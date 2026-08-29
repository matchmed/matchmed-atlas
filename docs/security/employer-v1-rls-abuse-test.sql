-- Employer V1 RLS abuse-case matrix
-- Run AFTER applying 20260829000000_employer_v1_schema.sql on staging.
-- Entire script runs in a transaction and ROLLBACKs fixture data at the end.
--
--   npx supabase db query --linked -f docs/security/employer-v1-rls-abuse-test.sql
--
-- Requires: >=2 practices, >=1 doctor, pgcrypto (for crypt).

BEGIN;

CREATE TEMP TABLE abuse_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int,
  p_desc text,
  p_expected text,
  p_pass boolean,
  p_detail text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO abuse_results(case_no, description, expected, detail, pass)
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
  u_random uuid := 'a0000000-0000-4000-8000-000000000002';
  u_editor_a uuid := 'a0000000-0000-4000-8000-000000000003';
  u_editor_b uuid := 'a0000000-0000-4000-8000-000000000004';
  u_invitee uuid := 'a0000000-0000-4000-8000-000000000006';
  u_access2 uuid := 'a0000000-0000-4000-8000-000000000007';
  u_admin uuid;
  org_a uuid := 'b0000000-0000-4000-8000-000000000001';
  org_b uuid := 'b0000000-0000-4000-8000-000000000002';
  practice_a uuid;
  practice_b uuid;
  doctor_a uuid;
  practice_c uuid;
  link_a uuid;
  claim_initial uuid;
  claim_access1 uuid;
  membership_invite uuid;
  practice_c uuid;
  v_rows bigint;
  v_bool boolean;
  v_err text;
BEGIN
  SELECT id INTO practice_a FROM public.practices ORDER BY id LIMIT 1;
  SELECT id INTO practice_b FROM public.practices WHERE id <> practice_a ORDER BY id LIMIT 1;
  SELECT id INTO doctor_a FROM public.doctors ORDER BY id LIMIT 1;
  SELECT id INTO practice_c FROM public.practices WHERE id NOT IN (practice_a, practice_b) ORDER BY id LIMIT 1;

  IF practice_a IS NULL OR practice_b IS NULL OR doctor_a IS NULL THEN
    RAISE EXCEPTION 'Need at least two practices and one doctor';
  END IF;

  SELECT p.user_id INTO u_admin
  FROM public.profiles AS p
  WHERE p.is_admin IS TRUE AND p.user_id IS NOT NULL
  LIMIT 1;

  IF u_admin IS NULL THEN
    u_admin := 'a0000000-0000-4000-8000-000000000005';
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
    VALUES (u_admin, 'authenticated', 'authenticated', 'abuse-admin@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (email, user_id, is_admin, onboarding_complete)
    VALUES ('abuse-admin@test.local', u_admin, true, true);
  END IF;

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
  VALUES
    (u_random, 'authenticated', 'authenticated', 'abuse-random@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_editor_a, 'authenticated', 'authenticated', 'abuse-editor-a@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_editor_b, 'authenticated', 'authenticated', 'abuse-editor-b@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_invitee, 'authenticated', 'authenticated', 'abuse-invitee@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_access2, 'authenticated', 'authenticated', 'abuse-access2@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at, verified_by)
  VALUES
    (org_a, 'Abuse Test Org A', 'abuse-test-org-a', 'verified', now(), u_admin),
    (org_b, 'Abuse Test Org B', 'abuse-test-org-b', 'verified', now(), u_admin);

  INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by)
  VALUES (org_a, practice_a, u_admin)
  RETURNING id INTO link_a;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES
    (org_a, u_editor_a, 'editor', 'active', now()),
    (org_b, u_editor_b, 'editor', 'active', now());

  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, invited_by, invited_at)
  VALUES (org_a, u_invitee, 'editor', 'invited', u_admin, now())
  RETURNING id INTO membership_invite;

  INSERT INTO public.employer_practice_profiles (practice_id)
  VALUES (practice_a), (practice_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.practice_claims (
    practice_id, submitted_by, claim_type, status,
    claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
  ) VALUES (
    practice_b, u_random, 'initial_claim', 'pending_email_verification',
    'Rand', 'Mgr', 'r@test.com', true, 'v1'
  ) RETURNING id INTO claim_initial;

  INSERT INTO public.practice_claims (
    practice_id, submitted_by, claim_type, status,
    claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version,
    claimant_work_email_verified_at, claimant_work_email_verification_method
  ) VALUES (
    practice_a, u_random, 'access_request', 'pending_review',
    'Rand', 'Mgr', 'r2@test.com', true, 'v1', now(), 'manual_admin'
  ) RETURNING id INTO claim_access1;

  INSERT INTO public.practice_claims (
    practice_id, submitted_by, claim_type, status,
    claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
  ) VALUES (
    practice_a, u_access2, 'access_request', 'pending_email_verification',
    'Two', 'Mgr', 'two@test.com', true, 'v1'
  );

  -- 1 anon SELECT
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO v_rows FROM public.practice_claims;
    RESET ROLE;
    PERFORM pg_temp.record(1, 'anon SELECT practice_claims', 'DENY', false, 'rows=' || v_rows);
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.record(1, 'anon SELECT practice_claims', 'DENY', true);
  WHEN OTHERS THEN
    RESET ROLE;
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(1, 'anon SELECT practice_claims', 'DENY', true, v_err);
  END;

  -- 2 no membership SELECT org
  PERFORM pg_temp.set_jwt(u_random);
  SELECT count(*) INTO v_rows FROM public.employer_organizations WHERE id = org_a;
  PERFORM pg_temp.record(2, 'no membership SELECT org A', 'DENY', v_rows = 0, 'rows=' || v_rows);

  -- 3 Org A editor SELECT Org B
  PERFORM pg_temp.set_jwt(u_editor_a);
  SELECT count(*) INTO v_rows FROM public.employer_organizations WHERE id = org_b;
  PERFORM pg_temp.record(3, 'Org A editor SELECT Org B', 'DENY', v_rows = 0, 'rows=' || v_rows);

  -- 4 Org A editor UPDATE Practice B profile
  PERFORM pg_temp.set_jwt(u_editor_a);
  UPDATE public.employer_practice_profiles SET overview = 'hack' WHERE practice_id = practice_b;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.record(4, 'Org A editor UPDATE Practice B profile', 'DENY', v_rows = 0, 'rows=' || v_rows);

  -- 5 Org A editor INSERT roster Practice A
  PERFORM pg_temp.set_jwt(u_editor_a);
  BEGIN
    INSERT INTO public.employer_roster_assertions (practice_id, doctor_id, assertion, asserted_by)
    VALUES (practice_a, doctor_a, 'confirm_current', u_editor_a);
    PERFORM pg_temp.record(5, 'Org A editor INSERT roster Practice A', 'ALLOW', true);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(5, 'Org A editor INSERT roster Practice A', 'ALLOW', false, v_err);
  END;

  -- 6 random INSERT initial_claim on unclaimed practice
  PERFORM pg_temp.set_jwt(u_random);
  IF practice_c IS NULL THEN
    PERFORM pg_temp.record(6, 'random INSERT initial_claim unclaimed', 'ALLOW', true, 'seeded pending claim_initial');
  ELSE
    BEGIN
      INSERT INTO public.practice_claims (
        practice_id, submitted_by, claim_type, status,
        claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
      ) VALUES (
        practice_c, u_random, 'initial_claim', 'pending_email_verification',
        'X', 'Y', 'x@y.com', true, 'v1'
      );
      PERFORM pg_temp.record(6, 'random INSERT initial_claim unclaimed', 'ALLOW', true);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.record(6, 'random INSERT initial_claim unclaimed', 'ALLOW', false, v_err);
    END;
  END IF;

  -- 7 duplicate pending same user+practice
  PERFORM pg_temp.set_jwt(u_random);
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_b, u_random, 'initial_claim', 'pending_email_verification',
      'X', 'Y', 'x2@y.com', true, 'v1'
    );
    PERFORM pg_temp.record(7, 'duplicate pending claim same user', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.record(7, 'duplicate pending claim same user', 'DENY', true);
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(7, 'duplicate pending claim same user', 'DENY', true, v_err);
  END;

  -- 8 initial_claim when link exists
  PERFORM pg_temp.set_jwt(u_random);
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_a, u_random, 'initial_claim', 'pending_email_verification',
      'X', 'Y', 'x3@y.com', true, 'v1'
    );
    PERFORM pg_temp.record(8, 'initial_claim when link exists', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(8, 'initial_claim when link exists', 'DENY', true, v_err);
  END;

  -- 9 access_request without link (practice_b has no operates link)
  PERFORM pg_temp.set_jwt(u_access2);
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_b, u_access2, 'access_request', 'pending_email_verification',
      'X', 'Y', 'x4@y.com', true, 'v1'
    );
    PERFORM pg_temp.record(9, 'access_request without link', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(9, 'access_request without link', 'DENY', true, v_err);
  END;

  -- 10 non-admin approve
  PERFORM pg_temp.set_jwt(u_random);
  BEGIN
    PERFORM public.approve_practice_initial_claim(claim_initial);
    PERFORM pg_temp.record(10, 'non-admin approve initial claim', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(10, 'non-admin approve initial claim', 'DENY', v_err LIKE '%not authorized%', v_err);
  END;

  -- 11 non-admin UPDATE claim approved
  PERFORM pg_temp.set_jwt(u_random);
  UPDATE public.practice_claims SET status = 'approved' WHERE id = claim_access1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.record(11, 'non-admin UPDATE claim approved', 'DENY', v_rows = 0, 'rows=' || v_rows);

  -- 12 editor INSERT membership
  PERFORM pg_temp.set_jwt(u_editor_a);
  BEGIN
    INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
    VALUES (org_a, u_random, 'editor', 'invited');
    PERFORM pg_temp.record(12, 'editor INSERT membership', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(12, 'editor INSERT membership', 'DENY', true, v_err);
  END;

  -- 13 editor self-promote
  PERFORM pg_temp.set_jwt(u_editor_a);
  BEGIN
    UPDATE public.organization_memberships SET role = 'owner'
    WHERE organization_id = org_a AND user_id = u_editor_a;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record(13, 'editor self-promote owner', 'DENY', v_rows = 0, 'rows=' || v_rows);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(13, 'editor self-promote owner', 'DENY', true, v_err);
  END;

  -- 14 non-owner assign owner
  PERFORM pg_temp.set_jwt(u_editor_a);
  BEGIN
    UPDATE public.organization_memberships SET role = 'owner' WHERE id = membership_invite;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record(14, 'non-owner assign owner', 'DENY', v_rows = 0, 'rows=' || v_rows);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(14, 'non-owner assign owner', 'DENY', true, v_err);
  END;

  -- 15 invitee accept with role change
  PERFORM pg_temp.set_jwt(u_invitee);
  BEGIN
    UPDATE public.organization_memberships
    SET status = 'active', role = 'owner', accepted_at = now()
    WHERE id = membership_invite;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record(15, 'invitee accept with role change', 'DENY', v_rows = 0, 'rows=' || v_rows);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(15, 'invitee accept with role change', 'DENY', true, v_err);
  END;

  -- 16 invitee accept clean
  PERFORM pg_temp.set_jwt(u_invitee);
  BEGIN
    UPDATE public.organization_memberships
    SET status = 'active', accepted_at = now()
    WHERE id = membership_invite AND status = 'invited';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record(16, 'invitee accept invite', 'ALLOW', v_rows = 1, 'rows=' || v_rows);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(16, 'invitee accept invite', 'ALLOW', false, v_err);
  END;

  -- 17 Org A cannot see Org B editor claims (none seeded for B editor — check random claim not visible to B)
  PERFORM pg_temp.set_jwt(u_editor_b);
  SELECT count(*) INTO v_rows FROM public.practice_claims WHERE id = claim_initial;
  PERFORM pg_temp.record(17, 'Org B member SELECT unrelated pending claim', 'DENY', v_rows = 0, 'rows=' || v_rows);

  -- 18 member SELECT approved-org claim
  PERFORM pg_temp.reset_auth();
  UPDATE public.practice_claims
  SET status = 'approved', approved_organization_id = org_a, reviewed_by = u_admin, reviewed_at = now()
  WHERE id = claim_access1;

  PERFORM pg_temp.set_jwt(u_editor_a);
  SELECT count(*) INTO v_rows FROM public.practice_claims WHERE id = claim_access1;
  PERFORM pg_temp.record(18, 'member SELECT approved org claim', 'ALLOW', v_rows = 1, 'rows=' || v_rows);

  -- 19 non-admin INSERT practice link
  PERFORM pg_temp.set_jwt(u_random);
  BEGIN
    INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by)
    VALUES (org_a, practice_b, u_random);
    PERFORM pg_temp.record(19, 'non-admin INSERT practice link', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(19, 'non-admin INSERT practice link', 'DENY', true, v_err);
  END;

  -- 20 non-admin deactivate link
  PERFORM pg_temp.set_jwt(u_random);
  BEGIN
    PERFORM public.deactivate_organization_practice_link(link_a, 'nope');
    PERFORM pg_temp.record(20, 'non-admin deactivate link', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(20, 'non-admin deactivate link', 'DENY', v_err LIKE '%not authorized%', v_err);
  END;

  -- 21 editor INSERT location Practice B
  PERFORM pg_temp.set_jwt(u_editor_a);
  BEGIN
    INSERT INTO public.employer_practice_locations (practice_id, status, city, state, address)
    VALUES (practice_b, 'active', 'X', 'NY', '1 Main');
    PERFORM pg_temp.record(21, 'editor INSERT location Practice B', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(21, 'editor INSERT location Practice B', 'DENY', true, v_err);
  END;

  -- 22 DELETE layer 3
  PERFORM pg_temp.set_jwt(u_editor_a);
  BEGIN
    DELETE FROM public.employer_roster_assertions WHERE practice_id = practice_a;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record(22, 'DELETE roster assertions', 'DENY', v_rows = 0, 'rows=' || v_rows);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.record(22, 'DELETE roster assertions', 'DENY', true);
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(22, 'DELETE roster assertions', 'DENY', true, v_err);
  END;

  -- 23 direct call _organization_descendant_ids
  PERFORM pg_temp.set_jwt(u_random);
  BEGIN
    PERFORM (SELECT count(*) FROM public._organization_descendant_ids(org_a));
    PERFORM pg_temp.record(23, 'direct call _organization_descendant_ids', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.record(23, 'direct call _organization_descendant_ids', 'DENY', true);
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(23, 'direct call _organization_descendant_ids', 'DENY', true, v_err);
  END;

  -- 24 probe other user via can_access_organization
  PERFORM pg_temp.set_jwt(u_random);
  SELECT public.can_access_organization(u_editor_a, org_a) INTO v_bool;
  PERFORM pg_temp.record(24, 'probe other user can_access_organization', 'DENY', v_bool IS FALSE, 'result=' || coalesce(v_bool::text, 'null'));

  -- 25 two pending access_requests different users same practice
  PERFORM pg_temp.reset_auth();
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
  VALUES ('a0000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'abuse-access3@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000')
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.set_jwt('a0000000-0000-4000-8000-000000000008'::uuid);
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_a, 'a0000000-0000-4000-8000-000000000008'::uuid, 'access_request', 'pending_email_verification',
      'Three', 'Mgr', 'three@test.com', true, 'v1'
    );
    SELECT count(*) INTO v_rows FROM public.practice_claims
    WHERE practice_id = practice_a
      AND claim_type = 'access_request'
      AND status IN ('pending_email_verification', 'pending_review');
    PERFORM pg_temp.record(25, 'multiple pending access_requests different users', 'ALLOW', v_rows >= 2, 'pending=' || v_rows);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(25, 'multiple pending access_requests different users', 'ALLOW', false, v_err);
  END;

  -- 26 second pending initial_claim different user same practice — DENY
  PERFORM pg_temp.set_jwt(u_access2);
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_b, u_access2, 'initial_claim', 'pending_email_verification',
      'Other', 'Mgr', 'other@test.com', true, 'v1'
    );
    PERFORM pg_temp.record(26, 'second pending initial_claim different user', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.record(26, 'second pending initial_claim different user', 'DENY', true);
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record(26, 'second pending initial_claim different user', 'DENY', true, v_err);
  END;
END;
$matrix$;

SELECT
  case_no,
  description,
  expected,
  CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
  detail
FROM abuse_results
ORDER BY case_no;

SELECT
  count(*) FILTER (WHERE pass) AS passed,
  count(*) FILTER (WHERE NOT pass) AS failed,
  count(*) AS total
FROM abuse_results;

ROLLBACK;
