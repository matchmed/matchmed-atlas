-- Employer V1 RLS abuse-case matrix (run after migration apply on staging).
-- Expects service-role or postgres session for setup; per-case blocks use JWT role simulation.
-- Usage: npx supabase db query --linked -f docs/security/employer-v1-rls-abuse-test.sql

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS abuse_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  pass boolean NOT NULL
) ON COMMIT DROP;

TRUNCATE abuse_results;

-- Fixed test UUIDs (deterministic)
DO $setup$
DECLARE
  u_anon uuid := '00000000-0000-4000-8000-000000000001';
  u_random uuid := '00000000-0000-4000-8000-000000000002';
  u_editor_a uuid := '00000000-0000-4000-8000-000000000003';
  u_editor_b uuid := '00000000-0000-4000-8000-000000000004';
  u_admin uuid := '00000000-0000-4000-8000-000000000005';
  u_invitee uuid := '00000000-0000-4000-8000-000000000006';
  u_access2 uuid := '00000000-0000-4000-8000-000000000007';
  org_a uuid := '10000000-0000-4000-8000-000000000001';
  org_b uuid := '10000000-0000-4000-8000-000000000002';
  practice_a uuid;
  practice_b uuid;
  doctor_a uuid;
  link_a uuid;
  claim_initial uuid;
  claim_access1 uuid;
  claim_access2 uuid;
  membership_invite uuid;
  v_rows int;
  v_err text;
BEGIN
  SELECT id INTO practice_a FROM public.practices ORDER BY id LIMIT 1;
  SELECT id INTO practice_b FROM public.practices ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO doctor_a FROM public.doctors ORDER BY id LIMIT 1;

  IF practice_a IS NULL OR practice_b IS NULL OR doctor_a IS NULL THEN
    RAISE EXCEPTION 'Need at least two practices and one doctor in database for abuse tests';
  END IF;

  -- Seed auth users (ignore if exist)
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (u_random, 'authenticated', 'authenticated', 'abuse-random@test.local', crypt('x', gen_salt('bf')), now(), now(), now()),
    (u_editor_a, 'authenticated', 'authenticated', 'abuse-editor-a@test.local', crypt('x', gen_salt('bf')), now(), now(), now()),
    (u_editor_b, 'authenticated', 'authenticated', 'abuse-editor-b@test.local', crypt('x', gen_salt('bf')), now(), now(), now()),
    (u_invitee, 'authenticated', 'authenticated', 'abuse-invitee@test.local', crypt('x', gen_salt('bf')), now(), now(), now()),
    (u_access2, 'authenticated', 'authenticated', 'abuse-access2@test.local', crypt('x', gen_salt('bf')), now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Admin profile flag for existing admin user if present
  IF EXISTS (SELECT 1 FROM public.profiles WHERE is_admin IS TRUE LIMIT 1) THEN
    SELECT user_id INTO u_admin FROM public.profiles WHERE is_admin IS TRUE LIMIT 1;
  ELSE
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES (u_admin, 'authenticated', 'authenticated', 'abuse-admin@test.local', crypt('x', gen_salt('bf')), now(), now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (user_id, is_admin, onboarding_complete)
    VALUES (u_admin, true, true)
    ON CONFLICT (user_id) DO UPDATE SET is_admin = true;
  END IF;

  -- Org A + practice A link (as superuser)
  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at, verified_by)
  VALUES (org_a, 'Abuse Test Org A', 'abuse-test-org-a', 'verified', now(), u_admin)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employer_organization_practices (id, organization_id, practice_id, approved_by)
  VALUES (gen_random_uuid(), org_a, practice_a, u_admin)
  RETURNING id INTO link_a;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES (org_a, u_editor_a, 'editor', 'active', now())
  ON CONFLICT DO NOTHING;

  -- Org B separate
  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at, verified_by)
  VALUES (org_b, 'Abuse Test Org B', 'abuse-test-org-b', 'verified', now(), u_admin)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES (org_b, u_editor_b, 'editor', 'active', now())
  ON CONFLICT DO NOTHING;

  -- Pending invite for case 16
  INSERT INTO public.organization_memberships (id, organization_id, user_id, role, status, invited_by, invited_at)
  VALUES (gen_random_uuid(), org_a, u_invitee, 'editor', 'invited', u_admin, now())
  RETURNING id INTO membership_invite;

  -- Claims
  INSERT INTO public.practice_claims (
    id, practice_id, submitted_by, claim_type, status,
    claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
  ) VALUES (
    gen_random_uuid(), practice_b, u_random, 'initial_claim', 'pending_email_verification',
    'Rand', 'Mgr', 'r@test.com', true, 'v1'
  ) RETURNING id INTO claim_initial;

  INSERT INTO public.practice_claims (
    id, practice_id, submitted_by, claim_type, status,
    claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version,
    claimant_work_email_verified_at, claimant_work_email_verification_method
  ) VALUES (
    gen_random_uuid(), practice_a, u_random, 'access_request', 'pending_review',
    'Rand', 'Mgr', 'r2@test.com', true, 'v1', now(), 'manual_admin'
  ) RETURNING id INTO claim_access1;

  INSERT INTO public.practice_claims (
    practice_id, submitted_by, claim_type, status,
    claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
  ) VALUES (
    practice_a, u_access2, 'access_request', 'pending_email_verification',
    'Two', 'Mgr', 'two@test.com', true, 'v1'
  ) RETURNING id INTO claim_access2;

  -- Helper to record result
  CREATE OR REPLACE FUNCTION pg_temp.record_abuse(
    p_case int, p_desc text, p_expected text, p_pass boolean, p_detail text DEFAULT ''
  ) RETURNS void LANGUAGE plpgsql AS $r$
  BEGIN
    INSERT INTO abuse_results(case_no, description, expected, actual, pass)
    VALUES (p_case, p_desc, p_expected, CASE WHEN p_pass THEN 'PASS' ELSE coalesce(p_detail, 'FAIL') END, p_pass);
  END;
  $r$;

  -- Case 1: anon SELECT employer table
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO v_rows FROM public.practice_claims;
    PERFORM pg_temp.record_abuse(1, 'anon SELECT practice_claims', 'DENY', false, 'got rows=' || v_rows);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.record_abuse(1, 'anon SELECT practice_claims', 'DENY', true);
  END;
  RESET ROLE;

  -- Case 2: random user SELECT org without membership
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.employer_organizations WHERE id = org_a;
  PERFORM pg_temp.record_abuse(2, 'no membership SELECT org A', 'DENY', v_rows = 0);
  RESET ROLE;

  -- Case 3: editor A SELECT org B
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.employer_organizations WHERE id = org_b;
  PERFORM pg_temp.record_abuse(3, 'Org A editor SELECT Org B', 'DENY', v_rows = 0);
  RESET ROLE;

  -- Case 4: editor A UPDATE profile practice B
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.employer_practice_profiles SET overview = 'hack' WHERE practice_id = practice_b;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record_abuse(4, 'Org A editor UPDATE Practice B profile', 'DENY', v_rows = 0);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record_abuse(4, 'Org A editor UPDATE Practice B profile', 'DENY', true);
  END;
  RESET ROLE;

  -- Case 5: editor A INSERT roster on practice A
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.employer_roster_assertions (
      practice_id, doctor_id, assertion, asserted_by
    ) VALUES (practice_a, doctor_a, 'confirm_current', u_editor_a);
    PERFORM pg_temp.record_abuse(5, 'Org A editor INSERT roster Practice A', 'ALLOW', true);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(5, 'Org A editor INSERT roster Practice A', 'ALLOW', false, v_err);
  END;
  RESET ROLE;

  -- Case 6: random user initial_claim unclaimed practice_b (no link yet)
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_b, u_random, 'initial_claim', 'pending_email_verification',
      'X', 'Y', 'x@y.com', true, 'v1'
    );
    PERFORM pg_temp.record_abuse(6, 'random INSERT initial_claim unclaimed', 'ALLOW', true);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(6, 'random INSERT initial_claim unclaimed', 'ALLOW', false, v_err);
  END;
  RESET ROLE;

  -- Case 7: duplicate pending same user+practice
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_b, u_random, 'initial_claim', 'pending_email_verification',
      'X', 'Y', 'x2@y.com', true, 'v1'
    );
    PERFORM pg_temp.record_abuse(7, 'duplicate pending claim same user', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.record_abuse(7, 'duplicate pending claim same user', 'DENY', true);
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(7, 'duplicate pending claim same user', 'DENY', false, v_err);
  END;
  RESET ROLE;

  -- Case 8: initial_claim when link exists on practice_a
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_a, u_random, 'initial_claim', 'pending_email_verification',
      'X', 'Y', 'x3@y.com', true, 'v1'
    );
    PERFORM pg_temp.record_abuse(8, 'initial_claim when link exists', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(8, 'initial_claim when link exists', 'DENY', v_err LIKE '%policy%' OR v_err LIKE '%violates%');
  END;
  RESET ROLE;

  -- Case 9: access_request when no link on practice_b - deactivate link first if any
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_b, u_random, 'access_request', 'pending_email_verification',
      'X', 'Y', 'x4@y.com', true, 'v1'
    );
    PERFORM pg_temp.record_abuse(9, 'access_request without link', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(9, 'access_request without link', 'DENY', true);
  END;
  RESET ROLE;

  -- Case 10: non-admin approve initial claim
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.approve_practice_initial_claim(claim_initial);
    PERFORM pg_temp.record_abuse(10, 'non-admin approve initial claim', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(10, 'non-admin approve initial claim', 'DENY', v_err LIKE '%not authorized%');
  END;
  RESET ROLE;

  -- Case 11: non-admin UPDATE claim to approved
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.practice_claims SET status = 'approved' WHERE id = claim_access1;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record_abuse(11, 'non-admin UPDATE claim approved', 'DENY', v_rows = 0);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record_abuse(11, 'non-admin UPDATE claim approved', 'DENY', true);
  END;
  RESET ROLE;

  -- Case 12: editor INSERT membership
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
    VALUES (org_a, u_random, 'editor', 'invited');
    PERFORM pg_temp.record_abuse(12, 'editor INSERT membership', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record_abuse(12, 'editor INSERT membership', 'DENY', true);
  END;
  RESET ROLE;

  -- Case 13: editor self-promote to owner
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.organization_memberships SET role = 'owner'
    WHERE organization_id = org_a AND user_id = u_editor_a;
    PERFORM pg_temp.record_abuse(13, 'editor self-promote owner', 'DENY', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(13, 'editor self-promote owner', 'DENY', v_err LIKE '%cannot change own role%');
  END;
  RESET ROLE;

  -- Case 14: admin member assigns owner without being owner
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.organization_memberships SET role = 'owner'
    WHERE id = membership_invite;
    PERFORM pg_temp.record_abuse(14, 'non-owner assign owner', 'DENY', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(14, 'non-owner assign owner', 'DENY', v_err LIKE '%only an owner%');
  END;
  RESET ROLE;

  -- Case 15: invitee accept changing role
  PERFORM set_config('request.jwt.claim.sub', u_invitee::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.organization_memberships
    SET status = 'active', role = 'owner', accepted_at = now()
    WHERE id = membership_invite;
    PERFORM pg_temp.record_abuse(15, 'invitee accept with role change', 'DENY', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(15, 'invitee accept with role change', 'DENY', v_err LIKE '%accepting invite%');
  END;
  RESET ROLE;

  -- Case 16: invitee accept status only
  PERFORM set_config('request.jwt.claim.sub', u_invitee::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.organization_memberships
    SET status = 'active', accepted_at = now()
    WHERE id = membership_invite;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record_abuse(16, 'invitee accept invite', 'ALLOW', v_rows = 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(16, 'invitee accept invite', 'ALLOW', false, v_err);
  END;
  RESET ROLE;

  -- Case 17: Org A member SELECT Org B claims
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.practice_claims
  WHERE submitted_by = u_editor_b;
  PERFORM pg_temp.record_abuse(17, 'Org A member SELECT Org B user claims', 'DENY', v_rows = 0);
  RESET ROLE;

  -- Case 18: member SELECT approved-org claims (seed approved claim)
  UPDATE public.practice_claims
  SET status = 'approved', approved_organization_id = org_a
  WHERE id = claim_access1;

  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.practice_claims WHERE id = claim_access1;
  PERFORM pg_temp.record_abuse(18, 'member SELECT approved org claim', 'ALLOW', v_rows = 1);
  RESET ROLE;

  -- Case 19: non-admin INSERT org-practice link
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by)
    VALUES (org_a, practice_b, u_random);
    PERFORM pg_temp.record_abuse(19, 'non-admin INSERT practice link', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record_abuse(19, 'non-admin INSERT practice link', 'DENY', true);
  END;
  RESET ROLE;

  -- Case 20: non-admin deactivate link
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.deactivate_organization_practice_link(link_a, 'nope');
    PERFORM pg_temp.record_abuse(20, 'non-admin deactivate link', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.record_abuse(20, 'non-admin deactivate link', 'DENY', v_err LIKE '%not authorized%');
  END;
  RESET ROLE;

  -- Case 21: editor A INSERT location on practice B
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.employer_practice_locations (
      practice_id, status, city, state, address
    ) VALUES (practice_b, 'active', 'X', 'NY', '1 Main');
    PERFORM pg_temp.record_abuse(21, 'editor INSERT location Practice B', 'DENY', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record_abuse(21, 'editor INSERT location Practice B', 'DENY', true);
  END;
  RESET ROLE;

  -- Case 22: DELETE layer 3
  PERFORM set_config('request.jwt.claim.sub', u_editor_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.employer_roster_assertions WHERE practice_id = practice_a;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.record_abuse(22, 'DELETE roster assertions', 'DENY', v_rows = 0);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.record_abuse(22, 'DELETE roster assertions', 'DENY', true);
  WHEN OTHERS THEN
    PERFORM pg_temp.record_abuse(22, 'DELETE roster assertions', 'DENY', true);
  END;
  RESET ROLE;

  -- Bonus: descendant helper not callable by authenticated
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM count(*) FROM public._organization_descendant_ids(org_a);
    PERFORM pg_temp.record_abuse(23, 'direct call _organization_descendant_ids', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.record_abuse(23, 'direct call _organization_descendant_ids', 'DENY', true);
  WHEN undefined_function THEN
    PERFORM pg_temp.record_abuse(23, 'direct call _organization_descendant_ids', 'DENY', true);
  END;
  RESET ROLE;

  -- Bonus: probe other user via can_access_organization
  PERFORM set_config('request.jwt.claim.sub', u_random::text, true);
  SET LOCAL ROLE authenticated;
  SELECT public.can_access_organization(u_editor_a, org_a) INTO v_rows;
  PERFORM pg_temp.record_abuse(24, 'probe other user can_access_organization', 'DENY', v_rows IS FALSE);
  RESET ROLE;

  -- Bonus: two pending access_requests different users same practice
  PERFORM set_config('request.jwt.claim.sub', u_access2::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.practice_claims
  WHERE practice_id = practice_a
    AND claim_type = 'access_request'
    AND status IN ('pending_email_verification', 'pending_review');
  PERFORM pg_temp.record_abuse(25, 'two pending access_requests same practice', 'ALLOW', v_rows >= 2);
  RESET ROLE;

END;
$setup$;

SELECT
  case_no,
  description,
  expected,
  actual,
  CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result
FROM abuse_results
ORDER BY case_no;

SELECT
  count(*) FILTER (WHERE pass) AS passed,
  count(*) FILTER (WHERE NOT pass) AS failed,
  count(*) AS total
FROM abuse_results;

ROLLBACK;
