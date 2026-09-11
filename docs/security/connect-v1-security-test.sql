-- MAT-14 Connect V1 security matrix (transactional; rolls back).
-- Prerequisites: Connect V1 + lifecycle + data_sharing consent + drop open_to_practice_connections
--
--   npx supabase db query --linked -f docs/security/connect-v1-security-test.sql
--
-- Does NOT mutate lasting production data (BEGIN/ROLLBACK).

BEGIN;

CREATE TEMP TABLE connect_sec_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE connect_sec_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int,
  p_desc text,
  p_expected text,
  p_pass boolean,
  p_detail text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO connect_sec_results(case_no, description, expected, detail, pass)
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

DO $matrix$
DECLARE
  u_physician uuid := 'c0140000-0000-4000-8000-000000000001';
  u_physician2 uuid := 'c0140000-0000-4000-8000-000000000002';
  u_editor uuid := 'c0140000-0000-4000-8000-000000000003';
  u_editor_other uuid := 'c0140000-0000-4000-8000-000000000004';
  u_unrelated uuid := 'c0140000-0000-4000-8000-000000000005';
  org_a uuid := 'c0140000-0000-4000-8000-000000000011';
  org_b uuid := 'c0140000-0000-4000-8000-000000000012';
  practice_a uuid;
  practice_b uuid;
  practice_unclaimed uuid;
  profile_a uuid;
  profile_b uuid;
  profile_closed uuid;
  rel_id uuid;
  rel2 uuid;
  payload jsonb;
  keys text[];
  err text;
  ok boolean;
  n int;
BEGIN
  IF to_regclass('public.connect_relationships') IS NULL THEN
    PERFORM pg_temp.record(0, 'connect tables exist', 'present', false, 'connect_relationships missing — apply migrations first');
    RETURN;
  END IF;

  -- Prefer practices that already have an active operates link for A/B fixtures.
  SELECT l.practice_id INTO practice_a
  FROM public.employer_organization_practices AS l
  WHERE l.status = 'active'
    AND l.relationship = 'operates'
  ORDER BY l.practice_id
  LIMIT 1;

  SELECT l.practice_id INTO practice_b
  FROM public.employer_organization_practices AS l
  WHERE l.status = 'active'
    AND l.relationship = 'operates'
    AND l.practice_id IS DISTINCT FROM practice_a
  ORDER BY l.practice_id
  LIMIT 1;

  -- Fallback if fewer than 2 claimed practices exist.
  IF practice_a IS NULL THEN
    SELECT id INTO practice_a FROM public.practices ORDER BY id LIMIT 1;
  END IF;
  IF practice_b IS NULL THEN
    SELECT id INTO practice_b
    FROM public.practices
    WHERE id IS DISTINCT FROM practice_a
    ORDER BY id
    LIMIT 1;
  END IF;

  SELECT id INTO practice_unclaimed
  FROM public.practices p
  WHERE p.id IS DISTINCT FROM practice_a
    AND p.id IS DISTINCT FROM practice_b
    AND NOT EXISTS (
      SELECT 1 FROM public.employer_organization_practices l
      WHERE l.practice_id = p.id AND l.status = 'active' AND l.relationship = 'operates'
    )
  ORDER BY id
  LIMIT 1;

  IF practice_a IS NULL OR practice_b IS NULL THEN
    PERFORM pg_temp.record(0, 'fixture practices', '>=2 practices', false, 'need >=2 practices');
    RETURN;
  END IF;

  -- Auth users + profiles
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (u_physician, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'connect.phys.a@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_physician2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'connect.phys.b@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_editor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'connect.editor.a@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_editor_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'connect.editor.b@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_unrelated, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'connect.unrelated@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, phone, npi,
    training_status, clinical_focus, preferred_state, start_year,
    onboarding_complete, data_sharing
  ) VALUES
    (u_physician, 'connect.phys.a@example.test', 'Alice', 'Alpha', '555-0100', '1111111111',
     'Fellow', ARRAY['Glaucoma (medical and/or surgical)'], ARRAY['GA'], '2027',
     true, true),
    (u_physician2, 'connect.phys.b@example.test', 'Bob', 'Beta', '555-0101', '2222222222',
     'Resident', ARRAY['Corneal Disease'], ARRAY['FL'], '2028',
     true, false);

  SELECT id INTO profile_a FROM public.profiles WHERE user_id = u_physician;
  SELECT id INTO profile_b FROM public.profiles WHERE user_id = u_physician2;

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at)
  VALUES
    (org_a, 'Connect Org A', 'connect-org-a-' || substr(org_a::text, 1, 8), 'verified', now()),
    (org_b, 'Connect Org B', 'connect-org-b-' || substr(org_b::text, 1, 8), 'verified', now())
  ON CONFLICT (id) DO UPDATE SET status = 'verified', archived_at = NULL;

  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, scope, status, accepted_at
  ) VALUES
    (org_a, u_editor, 'owner', 'organization_only', 'active', now()),
    (org_b, u_editor_other, 'owner', 'organization_only', 'active', now());

  -- Clear conflicting active operates on fixture practices within this transaction
  UPDATE public.employer_organization_practices
  SET status = 'inactive', inactive_at = now(), inactive_reason = 'connect_sec_test'
  WHERE practice_id IN (practice_a, practice_b) AND status = 'active';

  INSERT INTO public.employer_organization_practices (
    organization_id, practice_id, relationship, status, approved_at, approved_by
  ) VALUES
    (org_a, practice_a, 'operates', 'active', now(), u_editor),
    (org_b, practice_b, 'operates', 'active', now(), u_editor_other);

  -- Physician-Ready required for Connect eligibility (test fixture via privileged write flag)
  PERFORM set_config('app.employer_profile_privileged_write', '1', true);
  INSERT INTO public.employer_practice_profiles (practice_id, physician_ready_at, physician_ready_by)
  VALUES
    (practice_a, now(), u_editor),
    (practice_b, now(), u_editor_other)
  ON CONFLICT (practice_id) DO UPDATE
  SET physician_ready_at = EXCLUDED.physician_ready_at,
      physician_ready_by = EXCLUDED.physician_ready_by;
  PERFORM set_config('app.employer_profile_privileged_write', '', true);

  -- 1. Anon denied initiate
  PERFORM pg_temp.reset_auth();
  BEGIN
    PERFORM public.connect_initiate_by_physician(practice_a, NULL);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(1, 'anon denied initiate', '42501', ok, err);

  -- 2. Unclaimed practice cannot participate
  IF practice_unclaimed IS NOT NULL THEN
    PERFORM pg_temp.set_jwt(u_physician);
    BEGIN
      PERFORM public.connect_initiate_by_physician(practice_unclaimed, NULL);
      ok := false;
      err := 'no exception';
    EXCEPTION WHEN OTHERS THEN
      ok := SQLERRM ILIKE '%not eligible%';
      err := SQLERRM;
    END;
    PERFORM pg_temp.record(2, 'unclaimed practice blocked', 'not eligible', ok, err);
  ELSE
    PERFORM pg_temp.record(2, 'unclaimed practice blocked', 'skipped', true, 'no unclaimed practice fixture');
  END IF;

  -- 3. Physician initiate OK
  PERFORM pg_temp.set_jwt(u_physician);
  payload := public.connect_initiate_by_physician(practice_a, NULL);
  rel_id := (payload->>'id')::uuid;
  PERFORM pg_temp.record(3, 'physician initiate', 'pending', payload->>'status' = 'pending', payload::text);

  -- 4. Pending practice inbox leaks no identity
  PERFORM pg_temp.set_jwt(u_editor);
  payload := public.connect_list_for_practice(practice_a);
  keys := ARRAY(
    SELECT jsonb_object_keys(elem->'physician')
    FROM jsonb_array_elements(payload) AS elem
    WHERE (elem->>'id') = rel_id::text
  );
  ok := NOT ('first_name' = ANY (keys) OR 'last_name' = ANY (keys) OR 'email' = ANY (keys)
             OR 'phone' = ANY (keys) OR 'npi' = ANY (keys) OR 'current_practice' = ANY (keys));
  PERFORM pg_temp.record(4, 'pending physician request anonymized for practice', 'no identity keys', ok, array_to_string(keys, ','));

  -- 5. Pending profile unlock denied
  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    PERFORM public.connect_get_physician_profile(rel_id);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(5, 'pending unlock denied', '42501', ok, err);

  -- 6. Unrelated practice denied list/unlock
  PERFORM pg_temp.set_jwt(u_editor_other);
  BEGIN
    PERFORM public.connect_list_for_practice(practice_a);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(6, 'cross-practice list denied', '42501', ok, err);

  -- 7. Unrelated physician cannot accept
  PERFORM pg_temp.set_jwt(u_physician2);
  BEGIN
    PERFORM public.connect_accept(rel_id);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(7, 'cross-physician accept denied', '42501', ok, err);

  -- 8. Practice accept unlocks for correct practice
  PERFORM pg_temp.set_jwt(u_editor);
  payload := public.connect_accept(rel_id);
  PERFORM pg_temp.record(8, 'practice accept', 'accepted', payload->>'status' = 'accepted', payload::text);

  payload := public.connect_get_physician_profile(rel_id);
  ok := (payload->>'first_name') = 'Alice'
    AND (payload->>'email') = 'connect.phys.a@example.test'
    AND (payload->>'npi') = '1111111111';
  PERFORM pg_temp.record(9, 'accepted unlock allowlist', 'identity present', ok, payload::text);

  -- 10. Other practice still denied
  PERFORM pg_temp.set_jwt(u_editor_other);
  BEGIN
    PERFORM public.connect_get_physician_profile(rel_id);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(10, 'accepted unlock denied to other practice', '42501', ok, err);

  -- 11. Disconnect revokes
  PERFORM pg_temp.set_jwt(u_editor);
  payload := public.connect_disconnect(rel_id);
  PERFORM pg_temp.record(11, 'disconnect', 'disconnected', payload->>'status' = 'disconnected', payload::text);

  BEGIN
    PERFORM public.connect_get_physician_profile(rel_id);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(12, 'disconnect revokes profile access', '42501', ok, err);

  -- 13. New attempt after terminal creates new row
  PERFORM pg_temp.set_jwt(u_physician);
  payload := public.connect_initiate_by_physician(practice_a, NULL);
  rel2 := (payload->>'id')::uuid;
  ok := rel2 IS DISTINCT FROM rel_id AND payload->>'status' = 'pending';
  PERFORM pg_temp.record(13, 'new row after terminal', 'new pending id', ok, payload::text);

  -- Cancel pending
  payload := public.connect_cancel(rel2);
  PERFORM pg_temp.record(14, 'initiator cancel', 'canceled', payload->>'status' = 'canceled', payload::text);

  BEGIN
    PERFORM public.connect_get_physician_profile(rel2);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(15, 'canceled remains locked', '42501', ok, err);

  -- 16. Practice-initiated pending anonymized
  PERFORM pg_temp.set_jwt(u_editor);
  payload := public.connect_initiate_by_practice(practice_a, profile_a, NULL);
  rel_id := (payload->>'id')::uuid;
  payload := public.connect_list_for_practice(practice_a);
  keys := ARRAY(
    SELECT jsonb_object_keys(elem->'physician')
    FROM jsonb_array_elements(payload) AS elem
    WHERE (elem->>'id') = rel_id::text
  );
  ok := NOT ('first_name' = ANY (keys) OR 'email' = ANY (keys) OR 'npi' = ANY (keys));
  PERFORM pg_temp.record(16, 'practice-initiated pending anonymized', 'no identity keys', ok, array_to_string(keys, ','));

  -- Decline locks
  PERFORM pg_temp.set_jwt(u_physician);
  payload := public.connect_decline(rel_id);
  PERFORM pg_temp.record(17, 'physician decline practice request', 'declined', payload->>'status' = 'declined', payload::text);

  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    PERFORM public.connect_get_physician_profile(rel_id);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(18, 'declined remains locked', '42501', ok, err);

  -- 19. Anonymous discovery — open physician included, closed excluded; no identity keys
  PERFORM pg_temp.set_jwt(u_editor);
  payload := public.connect_list_anonymous_physicians(practice_a, NULL, NULL, NULL, NULL, 100, 0);
  ok := EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) e
    WHERE (e->>'physician_profile_id') = profile_a::text
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) e
    WHERE (e->>'physician_profile_id') = profile_b::text
  );
  PERFORM pg_temp.record(19, 'discovery uses data_sharing', 'open only', ok, payload::text);

  IF jsonb_array_length(payload) > 0 THEN
    keys := ARRAY(SELECT jsonb_object_keys(payload->0));
    ok := NOT ('first_name' = ANY (keys) OR 'last_name' = ANY (keys) OR 'email' = ANY (keys)
               OR 'phone' = ANY (keys) OR 'npi' = ANY (keys) OR 'current_practice' = ANY (keys));
    PERFORM pg_temp.record(20, 'discovery payload has no identifying fields', 'safe keys', ok, array_to_string(keys, ','));
  ELSE
    PERFORM pg_temp.record(20, 'discovery payload has no identifying fields', 'empty ok', true, 'no cards');
  END IF;

  -- 21. Practice cannot initiate to closed physician
  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    PERFORM public.connect_initiate_by_practice(practice_a, profile_b, NULL);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM ILIKE '%not open%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(21, 'closed physician cannot receive practice initiate', 'not open', ok, err);

  -- 22. Direct table write denied
  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    INSERT INTO public.connect_relationships (
      physician_profile_id, practice_id, initiator_side, initiated_by_user_id, status
    ) VALUES (profile_a, practice_a, 'practice', u_editor, 'pending');
    ok := false;
    err := 'insert allowed';
  EXCEPTION WHEN OTHERS THEN
    ok := true;
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(22, 'direct INSERT denied', 'error', ok, err);

  PERFORM pg_temp.set_jwt(u_physician);
  SELECT count(*)::int INTO n FROM public.connect_relationships WHERE physician_profile_id = profile_a;
  BEGIN
    UPDATE public.connect_relationships SET status = 'accepted' WHERE physician_profile_id = profile_a;
    GET DIAGNOSTICS n = ROW_COUNT;
    ok := n = 0;
    err := 'row_count=' || n::text;
  EXCEPTION WHEN OTHERS THEN
    ok := true;
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(23, 'direct UPDATE denied/no-op', '0 rows or error', ok, err);

  -- 24. Duplicate active blocked
  PERFORM pg_temp.set_jwt(u_physician);
  payload := public.connect_initiate_by_physician(practice_a, NULL);
  rel_id := (payload->>'id')::uuid;
  BEGIN
    PERFORM public.connect_initiate_by_physician(practice_a, NULL);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := true;
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(24, 'duplicate active blocked', 'error', ok, err);

  PERFORM pg_temp.reset_auth();

  -- Retired consent key must not appear in physician JSON payloads.
  SELECT public._connect_anonymous_physician_json(p)
    INTO payload FROM public.profiles p WHERE id = profile_a;
  ok := NOT (payload ? 'open_to_practice_connections')
    AND NOT (payload ? 'data_sharing');
  SELECT public._connect_unlocked_physician_json(p)
    INTO payload FROM public.profiles p WHERE id = profile_a;
  ok := ok
    AND NOT (payload ? 'open_to_practice_connections')
    AND NOT (payload ? 'data_sharing');
  PERFORM pg_temp.record(25, 'physician JSON omits retired consent keys', 'absent', ok);

  -- Practice initiation uses data_sharing.
  PERFORM pg_temp.set_jwt(u_editor_other);
  payload := public.connect_initiate_by_practice(practice_b, profile_a, NULL);
  rel2 := (payload->>'id')::uuid;
  PERFORM pg_temp.record(26, 'practice initiation uses data_sharing', 'pending', payload->>'status' = 'pending');
  PERFORM public.connect_cancel(rel2);

  -- Withdrawal must block new discovery/requests.
  PERFORM pg_temp.reset_auth();
  UPDATE public.profiles SET data_sharing = false WHERE id = profile_a;
  PERFORM pg_temp.set_jwt(u_editor_other);
  payload := public.connect_list_anonymous_physicians(practice_b);
  PERFORM pg_temp.record(27, 'shared consent withdrawal removes discovery', 'absent',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(payload) e WHERE e->>'physician_profile_id' = profile_a::text));
  BEGIN
    PERFORM public.connect_initiate_by_practice(practice_b, profile_a, NULL);
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM ILIKE '%not open%';
  END;
  PERFORM pg_temp.record(28, 'shared consent withdrawal blocks new request', 'not open', ok);
  PERFORM pg_temp.reset_auth();

  -- Physician may still initiate while discovery/practice-initiate are off.
  PERFORM pg_temp.set_jwt(u_physician);
  BEGIN
    payload := public.connect_initiate_by_physician(practice_b, NULL);
    ok := payload->>'status' = 'pending';
    rel2 := (payload->>'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    ok := false;
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(29, 'physician initiate allowed when data_sharing false', 'pending', ok, err);
  IF ok THEN
    PERFORM public.connect_cancel(rel2);
  END IF;
  PERFORM pg_temp.reset_auth();

  -- Opt-out must not auto-cancel existing accepted relationships.
  PERFORM pg_temp.reset_auth();
  UPDATE public.profiles SET data_sharing = true WHERE id = profile_a;
  PERFORM pg_temp.set_jwt(u_editor_other);
  payload := public.connect_initiate_by_practice(practice_b, profile_a, NULL);
  rel2 := (payload->>'id')::uuid;
  PERFORM pg_temp.set_jwt(u_physician);
  PERFORM public.connect_accept(rel2);
  PERFORM pg_temp.reset_auth();
  UPDATE public.profiles SET data_sharing = false WHERE id = profile_a;
  SELECT status INTO err FROM public.connect_relationships WHERE id = rel2;
  PERFORM pg_temp.record(30, 'opt-out leaves accepted Connect intact', 'accepted', err = 'accepted');
  PERFORM pg_temp.set_jwt(u_physician);
  PERFORM public.connect_disconnect(rel2);
  PERFORM pg_temp.reset_auth();

  -- 31. Incomplete practice cannot initiate Connect
  PERFORM set_config('app.employer_profile_privileged_write', '1', true);
  UPDATE public.employer_practice_profiles
  SET physician_ready_at = NULL, physician_ready_by = NULL
  WHERE practice_id = practice_a;
  PERFORM set_config('app.employer_profile_privileged_write', '', true);

  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    PERFORM public.connect_initiate_by_practice(practice_a, profile_a, NULL);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM ILIKE '%physician-ready%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(31, 'incomplete practice initiate blocked', 'physician-ready error', ok, err);

  -- 32. Incomplete practice cannot discover physicians
  BEGIN
    PERFORM public.connect_list_anonymous_physicians(practice_a, NULL, NULL, NULL, NULL, 10, 0);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM ILIKE '%not eligible%' OR SQLERRM ILIKE '%physician-ready%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(32, 'incomplete practice discovery blocked', 'not eligible', ok, err);

  -- 33. Physician cannot initiate toward incomplete practice
  PERFORM pg_temp.set_jwt(u_physician);
  BEGIN
    PERFORM public.connect_initiate_by_physician(practice_a, NULL);
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM ILIKE '%not eligible%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(33, 'physician initiate toward incomplete practice blocked', 'not eligible', ok, err);

  -- Restore ready for any later cleanup
  PERFORM set_config('app.employer_profile_privileged_write', '1', true);
  UPDATE public.employer_practice_profiles
  SET physician_ready_at = now(), physician_ready_by = u_editor
  WHERE practice_id = practice_a;
  PERFORM set_config('app.employer_profile_privileged_write', '', true);
  PERFORM pg_temp.reset_auth();
END;
$matrix$;

SELECT case_no, description, expected, detail, pass
FROM connect_sec_results
ORDER BY case_no;

SELECT
  count(*) FILTER (WHERE pass) AS passed,
  count(*) FILTER (WHERE NOT pass) AS failed,
  count(*) AS total
FROM connect_sec_results;

DO $$
DECLARE
  v_failed text;
BEGIN
  SELECT string_agg(case_no::text || ':' || description || ' [' || detail || ']', '; ' ORDER BY case_no)
  INTO v_failed
  FROM connect_sec_results
  WHERE NOT pass;
  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION 'Connect security tests failed: %', v_failed;
  END IF;
END $$;

ROLLBACK;
