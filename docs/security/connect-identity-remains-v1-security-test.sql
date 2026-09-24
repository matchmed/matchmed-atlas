-- Physician identity stays revealed after an accepted Connect relationship is disconnected.
-- Installs the unapplied list and profile functions, exercises them, then rolls back.
-- Does not record a migration, enqueue employer email, or modify outbox rows.
--
--   npx supabase db query --linked -f docs/security/connect-identity-remains-v1-security-test.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.connect_list_for_practice(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_at DESC, x.id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id,
      r.practice_id,
      r.status,
      r.initiator_side,
      r.opportunity_id,
      r.created_at,
      r.updated_at,
      r.responded_at,
      r.canceled_at,
      r.disconnected_at,
      r.disconnected_by_side,
      r.physician_profile_id,
      CASE
        WHEN r.status = 'accepted'
          OR EXISTS (
            SELECT 1
            FROM public.connect_relationship_events AS e
            WHERE e.relationship_id = r.id
              AND e.event_type = 'accepted'
          )
        THEN public._connect_unlocked_physician_json(p)
        ELSE public._connect_anonymous_physician_json(p)
      END AS physician,
      lm.body AS last_message_preview,
      lm.created_at AS last_message_at,
      lm.sender_side AS last_message_sender_side,
      public._connect_has_unread(r.id, 'practice') AS has_unread,
      opp.clinical_focus AS origin_clinical_focus,
      COALESCE(lm.created_at, r.updated_at, r.created_at) AS sort_at
    FROM public.connect_relationships AS r
    INNER JOIN public.profiles AS p ON p.id = r.physician_profile_id
    LEFT JOIN public.employer_practice_recruiting_opportunities AS opp
      ON opp.id = r.opportunity_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.created_at, m.sender_side
      FROM public.connect_messages AS m
      WHERE m.relationship_id = r.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) AS lm ON true
    WHERE r.practice_id = p_practice_id
  ) AS x;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_list_for_practice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_list_for_practice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.connect_get_physician_profile(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'accepted'
     AND NOT EXISTS (
       SELECT 1
       FROM public.connect_relationship_events AS e
       WHERE e.relationship_id = v_row.id
         AND e.event_type = 'accepted'
     )
  THEN
    RAISE EXCEPTION 'physician profile is locked' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_edit_practice(v_uid, v_row.practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  IF v_profile.id IS NULL OR v_profile.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'physician profile unavailable' USING ERRCODE = 'P0002';
  END IF;

  RETURN public._connect_unlocked_physician_json(v_profile)
    || jsonb_build_object(
      'relationship_id', v_row.id,
      'practice_id', v_row.practice_id,
      'status', v_row.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.connect_get_physician_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_get_physician_profile(uuid) TO authenticated;

CREATE TEMP TABLE identity_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE identity_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int,
  p_desc text,
  p_expected text,
  p_pass boolean,
  p_detail text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO identity_results(case_no, description, expected, detail, pass)
  VALUES (
    p_case,
    p_desc,
    p_expected,
    CASE WHEN p_pass THEN coalesce(nullif(p_detail, ''), 'ok') ELSE coalesce(nullif(p_detail, ''), 'FAIL') END,
    p_pass
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('row_security', 'on', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_auth()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.identity_hidden(p_json jsonb)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT p_json IS NOT NULL
    AND NOT (
      p_json ? 'first_name'
      OR p_json ? 'last_name'
      OR p_json ? 'email'
      OR p_json ? 'phone'
      OR p_json ? 'npi'
      OR p_json ? 'current_practice'
    );
$$;

CREATE OR REPLACE FUNCTION pg_temp.identity_present(p_json jsonb)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT p_json IS NOT NULL
    AND p_json ? 'first_name'
    AND p_json ? 'last_name'
    AND p_json ? 'email'
    AND length(coalesce(p_json->>'first_name', '')) > 0
    AND length(coalesce(p_json->>'email', '')) > 0;
$$;

DO $identity$
DECLARE
  u_phys uuid := 'c0212100-0000-4000-8000-000000000001';
  u_editor uuid := 'c0212100-0000-4000-8000-000000000002';
  u_other uuid := 'c0212100-0000-4000-8000-000000000003';
  org_a uuid := 'c0212100-0000-4000-8000-000000000011';
  rel_main uuid := 'c0212100-0000-4000-8000-000000000021';
  rel_declined uuid := 'c0212100-0000-4000-8000-000000000022';
  rel_canceled uuid := 'c0212100-0000-4000-8000-000000000023';
  rel_reconnect uuid := 'c0212100-0000-4000-8000-000000000024';
  rel_never uuid := 'c0212100-0000-4000-8000-000000000025';
  practice_a uuid;
  profile_phys uuid;
  listed jsonb;
  physician jsonb;
  profile jsonb;
  ok boolean;
  err text;
BEGIN
  PERFORM pg_temp.reset_auth();
  BEGIN
    PERFORM public.connect_list_for_practice(gen_random_uuid());
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLSTATE;
  END;
  PERFORM pg_temp.record(1, 'signed-out practice list denied', '42501', ok, err);

  BEGIN
    PERFORM public.connect_get_physician_profile(rel_main);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLSTATE;
  END;
  PERFORM pg_temp.record(2, 'signed-out physician profile denied', '42501', ok, err);

  SELECT l.practice_id INTO practice_a
  FROM public.employer_organization_practices AS l
  WHERE l.status = 'active' AND l.relationship = 'operates'
  ORDER BY l.practice_id
  LIMIT 1;
  IF practice_a IS NULL THEN
    PERFORM pg_temp.record(3, 'fixture practice', 'present', false, 'no practice');
    RETURN;
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (u_phys, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'identity.phys@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_editor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'identity.editor@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'identity.other@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, phone, npi,
    training_status, clinical_focus, preferred_state, start_year,
    practice_setting_preference, current_practice, onboarding_complete, data_sharing
  ) VALUES (
    u_phys, 'identity.phys@example.test', 'Secret', 'Physician', '555-0199', '1991991991',
    'Fellow', ARRAY['General Ophthalmology (multiple areas)'], ARRAY['GA'], '2027',
    ARRAY['Private Practice (independent)'], 'Secret Eye Institute', true, true
  );

  SELECT id INTO profile_phys FROM public.profiles WHERE user_id = u_phys;

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at)
  VALUES (org_a, 'Identity Org', 'identity-org-' || substr(org_a::text, 1, 8), 'verified', now())
  ON CONFLICT (id) DO UPDATE SET status = 'verified', archived_at = NULL;

  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, scope, status, accepted_at
  ) VALUES (
    org_a, u_editor, 'owner', 'organization_only', 'active', now()
  );

  UPDATE public.employer_organization_practices
  SET status = 'inactive', inactive_at = now(), inactive_reason = 'identity_sec_test'
  WHERE practice_id = practice_a AND status = 'active';

  INSERT INTO public.employer_organization_practices (
    organization_id, practice_id, relationship, status, approved_at, approved_by
  ) VALUES (
    org_a, practice_a, 'operates', 'active', now(), u_editor
  );

  INSERT INTO public.connect_relationships (
    id, physician_profile_id, practice_id, organization_id,
    initiator_side, initiated_by_user_id, status
  ) VALUES
    (rel_main, profile_phys, practice_a, org_a, 'physician', u_phys, 'pending'),
    (rel_declined, profile_phys, practice_a, org_a, 'physician', u_phys, 'declined'),
    (rel_canceled, profile_phys, practice_a, org_a, 'physician', u_phys, 'canceled'),
    (rel_never, profile_phys, practice_a, org_a, 'physician', u_phys, 'disconnected');

  UPDATE public.connect_relationships
  SET responded_at = now()
  WHERE id IN (rel_declined, rel_canceled, rel_never);

  INSERT INTO public.connect_relationship_events (
    relationship_id, event_type, actor_user_id, actor_side
  ) VALUES
    (rel_declined, 'declined', u_editor, 'practice'),
    (rel_canceled, 'canceled', u_phys, 'physician'),
    (rel_never, 'disconnected', u_editor, 'practice');

  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_other);
  BEGIN
    PERFORM public.connect_list_for_practice(practice_a);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLSTATE;
  END;
  PERFORM pg_temp.record(3, 'unauthorized caller cannot list the practice inbox', '42501', ok, err);

  BEGIN
    PERFORM public.connect_get_physician_profile(rel_main);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLSTATE;
  END;
  PERFORM pg_temp.record(4, 'unauthorized caller cannot read a physician profile', '42501', ok, err);

  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_editor);
  listed := public.connect_list_for_practice(practice_a);
  physician := (SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_main::text);
  PERFORM pg_temp.record(5, 'pending practice response hides physician identity', 'anonymous', pg_temp.identity_hidden(physician), CASE WHEN pg_temp.identity_hidden(physician) THEN 'anonymous' ELSE 'identity present' END);

  physician := (SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_declined::text);
  PERFORM pg_temp.record(6, 'declined before acceptance hides physician identity', 'anonymous', pg_temp.identity_hidden(physician), CASE WHEN pg_temp.identity_hidden(physician) THEN 'anonymous' ELSE 'identity present' END);

  physician := (SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_canceled::text);
  PERFORM pg_temp.record(7, 'canceled before acceptance hides physician identity', 'anonymous', pg_temp.identity_hidden(physician), CASE WHEN pg_temp.identity_hidden(physician) THEN 'anonymous' ELSE 'identity present' END);

  physician := (SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_never::text);
  PERFORM pg_temp.record(8, 'disconnected without an accepted event stays anonymous', 'anonymous', pg_temp.identity_hidden(physician), CASE WHEN pg_temp.identity_hidden(physician) THEN 'anonymous' ELSE 'identity present' END);

  BEGIN
    PERFORM public.connect_get_physician_profile(rel_main);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLSTATE;
  END;
  PERFORM pg_temp.record(9, 'pending profile fetch stays locked', '42501', ok, err);

  BEGIN
    PERFORM public.connect_get_physician_profile(rel_never);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLSTATE;
  END;
  PERFORM pg_temp.record(10, 'never-accepted disconnected profile fetch stays locked', '42501', ok, err);

  PERFORM pg_temp.reset_auth();
  UPDATE public.connect_relationships
  SET status = 'accepted', responded_at = now()
  WHERE id = rel_main;
  INSERT INTO public.connect_relationship_events (
    relationship_id, event_type, actor_user_id, actor_side
  ) VALUES (
    rel_main, 'accepted', u_editor, 'practice'
  );

  PERFORM pg_temp.set_jwt(u_editor);
  listed := public.connect_list_for_practice(practice_a);
  physician := (SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_main::text);
  PERFORM pg_temp.record(11, 'accepted practice response reveals physician identity', 'unlocked', pg_temp.identity_present(physician), CASE WHEN pg_temp.identity_present(physician) THEN 'unlocked' ELSE 'anonymous' END);

  profile := public.connect_get_physician_profile(rel_main);
  PERFORM pg_temp.record(12, 'accepted profile fetch reveals physician identity', 'unlocked', pg_temp.identity_present(profile), CASE WHEN pg_temp.identity_present(profile) THEN 'unlocked' ELSE 'anonymous' END);

  PERFORM pg_temp.reset_auth();
  UPDATE public.connect_relationships
  SET status = 'disconnected', disconnected_at = now(), disconnected_by_side = 'physician'
  WHERE id = rel_main;
  INSERT INTO public.connect_relationship_events (
    relationship_id, event_type, actor_user_id, actor_side
  ) VALUES (
    rel_main, 'disconnected', u_phys, 'physician'
  );

  PERFORM pg_temp.set_jwt(u_editor);
  listed := public.connect_list_for_practice(practice_a);
  physician := (SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_main::text);
  PERFORM pg_temp.record(
    13,
    'accepted then disconnected response still reveals physician identity',
    'unlocked',
    pg_temp.identity_present(physician) AND (SELECT elem->>'status' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_main::text) = 'disconnected',
    CASE WHEN pg_temp.identity_present(physician) THEN 'unlocked' ELSE 'anonymous' END
  );

  profile := public.connect_get_physician_profile(rel_main);
  PERFORM pg_temp.record(14, 'accepted then disconnected profile fetch still reveals identity', 'unlocked', pg_temp.identity_present(profile) AND profile->>'status' = 'disconnected', CASE WHEN pg_temp.identity_present(profile) THEN 'unlocked' ELSE 'anonymous' END);

  PERFORM pg_temp.reset_auth();
  INSERT INTO public.connect_relationships (
    id, physician_profile_id, practice_id, organization_id,
    initiator_side, initiated_by_user_id, status
  ) VALUES (
    rel_reconnect, profile_phys, practice_a, org_a, 'physician', u_phys, 'pending'
  );

  PERFORM pg_temp.set_jwt(u_editor);
  listed := public.connect_list_for_practice(practice_a);
  physician := (SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_reconnect::text);
  PERFORM pg_temp.record(
    15,
    'reconnect relationship is anonymous and distinct from the historical thread',
    'new anonymous id',
    rel_reconnect IS DISTINCT FROM rel_main
      AND pg_temp.identity_hidden(physician)
      AND pg_temp.identity_present((SELECT elem->'physician' FROM jsonb_array_elements(listed) AS elem WHERE elem->>'id' = rel_main::text)),
    CASE WHEN pg_temp.identity_hidden(physician) THEN 'reconnect anonymous' ELSE 'reconnect unlocked' END
  );

  PERFORM pg_temp.reset_auth();
END;
$identity$;

SELECT case_no, pass, description, expected, detail
FROM identity_results
ORDER BY case_no;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity_results WHERE NOT pass) THEN
    RAISE EXCEPTION 'connect identity disclosure security test failed';
  END IF;
END;
$$;

ROLLBACK;
