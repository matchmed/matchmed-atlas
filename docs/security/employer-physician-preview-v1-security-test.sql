-- Privacy of the pending practice Connect preview.
-- Runs inside one transaction and rolls back. Does not enqueue employer email.
--
--   npx supabase db query --linked -f docs/security/employer-physician-preview-v1-security-test.sql

BEGIN;

CREATE TEMP TABLE preview_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE preview_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int,
  p_desc text,
  p_expected text,
  p_pass boolean,
  p_detail text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO preview_results(case_no, description, expected, detail, pass)
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
  SELECT NOT (
    p_json ? 'first_name'
    OR p_json ? 'last_name'
    OR p_json ? 'email'
    OR p_json ? 'phone'
    OR p_json ? 'npi'
    OR p_json ? 'current_practice'
    OR p_json ? 'procedures_performed'
    OR p_json ? 'procedures_desired'
    OR p_json ? 'photo'
  )
  AND position('secret' in lower(p_json::text)) = 0
  AND position('555-0199' in p_json::text) = 0
  AND position('1991991991' in p_json::text) = 0;
$$;

DO $preview$
DECLARE
  u_phys uuid := 'c0191000-0000-4000-8000-000000000001';
  u_editor uuid := 'c0191000-0000-4000-8000-000000000002';
  u_other uuid := 'c0191000-0000-4000-8000-000000000003';
  org_a uuid := 'c0191000-0000-4000-8000-000000000011';
  rel_id uuid := 'c0191000-0000-4000-8000-000000000021';
  practice_a uuid;
  profile_phys uuid;
  sample public.profiles;
  anon jsonb;
  listed jsonb;
  keys text[];
  ok boolean;
  err text;
BEGIN
  sample.id := gen_random_uuid();
  sample.first_name := 'Secret';
  sample.last_name := 'Physician';
  sample.email := 'secret.preview@example.test';
  sample.phone := '555-0199';
  sample.npi := '1991991991';
  sample.current_practice := 'Secret Eye Institute';
  sample.training_status := 'Fellow';
  sample.clinical_focus := ARRAY['General Ophthalmology (multiple areas)'];
  sample.preferred_state := ARRAY['GA'];
  sample.start_year := '2027';
  sample.practice_setting_preference := ARRAY['Private Practice (independent)'];
  anon := public._connect_anonymous_physician_json(sample);
  PERFORM pg_temp.record(
    1,
    'complete anonymous json hides identity and keeps preview fields',
    'no identity keys',
    pg_temp.identity_hidden(anon)
      AND anon->>'training_status' = 'Fellow'
      AND anon->>'start_year' = '2027'
      AND anon->'clinical_focus' ? 'General Ophthalmology (multiple areas)'
      AND anon->'preferred_state' ? 'GA'
      AND anon->'practice_setting_preference' ? 'Private Practice (independent)',
    'keys only'
  );

  sample.clinical_focus := ARRAY['Corneal Disease'];
  sample.training_status := NULL;
  sample.preferred_state := NULL;
  sample.start_year := NULL;
  sample.practice_setting_preference := NULL;
  anon := public._connect_anonymous_physician_json(sample);
  PERFORM pg_temp.record(
    2,
    'partial anonymous json keeps specialty and omits empty preview values',
    'cornea only',
    pg_temp.identity_hidden(anon)
      AND anon->'clinical_focus' ? 'Corneal Disease'
      AND anon->>'training_status' IS NULL
      AND anon->>'start_year' IS NULL
      AND (anon->'preferred_state' = 'null'::jsonb OR anon->>'preferred_state' IS NULL),
    'keys only'
  );

  sample.clinical_focus := NULL;
  sample.first_name := 'Secret';
  sample.current_practice := 'Secret Eye Institute';
  anon := public._connect_anonymous_physician_json(sample);
  PERFORM pg_temp.record(
    3,
    'missing preview fields still hide identity',
    'no identity keys',
    pg_temp.identity_hidden(anon)
      AND (anon->'clinical_focus' = 'null'::jsonb OR anon->>'clinical_focus' IS NULL),
    'keys only'
  );

  PERFORM pg_temp.reset_auth();
  BEGIN
    PERFORM public.connect_list_for_practice(gen_random_uuid());
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLSTATE;
  END;
  PERFORM pg_temp.record(4, 'signed-out practice list denied', '42501', ok, err);

  SELECT l.practice_id INTO practice_a
  FROM public.employer_organization_practices AS l
  WHERE l.status = 'active' AND l.relationship = 'operates'
  ORDER BY l.practice_id
  LIMIT 1;
  IF practice_a IS NULL THEN
    PERFORM pg_temp.record(5, 'fixture practice', 'present', false, 'no practice');
    RETURN;
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (u_phys, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview.phys@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_editor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview.editor@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview.other@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, phone, npi,
    training_status, clinical_focus, preferred_state, start_year,
    practice_setting_preference, current_practice, onboarding_complete, data_sharing
  ) VALUES (
    u_phys, 'preview.phys@example.test', 'Secret', 'Physician', '555-0199', '1991991991',
    'Fellow', ARRAY['General Ophthalmology (multiple areas)'], ARRAY['GA'], '2027',
    ARRAY['Private Practice (independent)'], 'Secret Eye Institute', true, true
  );

  SELECT id INTO profile_phys FROM public.profiles WHERE user_id = u_phys;

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at)
  VALUES (org_a, 'Preview Org', 'preview-org-' || substr(org_a::text, 1, 8), 'verified', now())
  ON CONFLICT (id) DO UPDATE SET status = 'verified', archived_at = NULL;

  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, scope, status, accepted_at
  ) VALUES (
    org_a, u_editor, 'owner', 'organization_only', 'active', now()
  );

  UPDATE public.employer_organization_practices
  SET status = 'inactive', inactive_at = now(), inactive_reason = 'preview_sec_test'
  WHERE practice_id = practice_a AND status = 'active';

  INSERT INTO public.employer_organization_practices (
    organization_id, practice_id, relationship, status, approved_at, approved_by
  ) VALUES (
    org_a, practice_a, 'operates', 'active', now(), u_editor
  );

  INSERT INTO public.connect_relationships (
    id, physician_profile_id, practice_id, organization_id,
    initiator_side, initiated_by_user_id, status
  ) VALUES (
    rel_id, profile_phys, practice_a, org_a, 'physician', u_phys, 'pending'
  );

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
  PERFORM pg_temp.record(5, 'unauthorized editor cannot list the practice inbox', '42501', ok, err);

  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_editor);
  listed := public.connect_list_for_practice(practice_a);
  SELECT ARRAY(SELECT jsonb_object_keys(elem->'physician'))
  INTO keys
  FROM jsonb_array_elements(listed) AS elem
  WHERE elem->>'id' = rel_id::text;
  anon := (
    SELECT elem->'physician'
    FROM jsonb_array_elements(listed) AS elem
    WHERE elem->>'id' = rel_id::text
  );
  PERFORM pg_temp.record(
    6,
    'authorized editor pending inbox returns preview without identity',
    'no identity keys',
    pg_temp.identity_hidden(anon)
      AND anon->>'training_status' = 'Fellow'
      AND anon->>'start_year' = '2027'
      AND NOT ('first_name' = ANY (keys) OR 'email' = ANY (keys) OR 'current_practice' = ANY (keys)),
    'keys only'
  );

  PERFORM pg_temp.reset_auth();
  UPDATE public.connect_relationships
  SET status = 'accepted'
  WHERE id = rel_id;

  PERFORM pg_temp.set_jwt(u_editor);
  listed := public.connect_list_for_practice(practice_a);
  anon := (
    SELECT elem->'physician'
    FROM jsonb_array_elements(listed) AS elem
    WHERE elem->>'id' = rel_id::text
  );
  PERFORM pg_temp.record(
    7,
    'accepted inbox returns the physician name',
    'first name present',
    anon->>'first_name' = 'Secret' AND anon->>'email' = 'preview.phys@example.test',
    CASE WHEN anon->>'first_name' IS NULL THEN 'still anonymous' ELSE 'unlocked' END
  );

  PERFORM pg_temp.reset_auth();
END;
$preview$;

SELECT case_no, pass, description, expected, detail
FROM preview_results
ORDER BY case_no;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM preview_results WHERE NOT pass) THEN
    RAISE EXCEPTION 'employer physician preview security test failed';
  END IF;
END;
$$;

ROLLBACK;
