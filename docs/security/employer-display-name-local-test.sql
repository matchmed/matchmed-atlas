-- Local validation: display name + initial review (runs in one transaction; ROLLBACK at end).
BEGIN;

CREATE TEMP TABLE display_name_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  pass boolean NOT NULL,
  detail text NOT NULL
);

GRANT ALL ON TABLE display_name_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.dn_record(
  p_case int, p_desc text, p_pass boolean, p_detail text DEFAULT ''
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO display_name_results VALUES (
    p_case, p_desc, p_pass, coalesce(nullif(p_detail, ''), CASE WHEN p_pass THEN 'ok' ELSE 'FAIL' END)
  );
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('row_security', 'on', true);
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.reset_auth()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END; $$;

DO $test$
DECLARE
  u_admin uuid := 'e2000000-0000-4000-8000-000000000001';
  u_owner uuid := 'e2000000-0000-4000-8000-000000000005';
  u_other uuid := 'e2000000-0000-4000-8000-000000000003';
  v_practice_id uuid := 'c1000000-0000-4000-8000-000000000002';
  cms_name text;
  public_name text;
  proposed text;
  overlay jsonb;
  v_err text;
  v_rows int;
  v_public text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
  SELECT x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'
  FROM (VALUES
    (u_admin, 'e2e-admin@test.local'),
    (u_owner, 'pos-owner@test.local'),
    (u_other, 'pos-editor@test.local')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (email, user_id, is_admin, onboarding_complete)
  SELECT 'e2e-admin@test.local', u_admin, true, true
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = u_admin);

  -- Ensure owner can edit this practice (seed fixtures may already provide access).
  IF NOT EXISTS (
    SELECT 1
    FROM public.employer_organization_practices AS l
    INNER JOIN public.organization_memberships AS m ON m.organization_id = l.organization_id
    WHERE l.practice_id = v_practice_id
      AND l.status = 'active'
      AND l.relationship = 'operates'
      AND m.user_id = u_owner
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin', 'editor')
  ) THEN
    PERFORM pg_temp.reset_auth();
    INSERT INTO public.practice_claims (
      id, practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version,
      claimant_work_email_verified_at, claimant_work_email_verification_method
    ) VALUES (
      'f3000000-0000-4000-8000-000000000001', v_practice_id, u_owner, 'initial_claim', 'pending_review',
      'Owner', 'CEO', 'owner@test.com', true, 'v1', now(), 'manual_admin'
    )
    ON CONFLICT (id) DO NOTHING;
    PERFORM pg_temp.set_jwt(u_admin);
    PERFORM public.approve_practice_initial_claim('f3000000-0000-4000-8000-000000000001');
  END IF;

  SELECT practice_name INTO cms_name FROM public.practices WHERE id = v_practice_id;

  -- D1: unrelated user cannot propose
  BEGIN
    PERFORM pg_temp.set_jwt(u_other);
    PERFORM public.propose_employer_display_name(v_practice_id, 'Other Practice Name');
    PERFORM pg_temp.dn_record(1, 'unrelated user cannot propose display name', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.dn_record(1, 'unrelated user cannot propose display name', true, v_err);
  END;

  -- D2: owner proposes
  PERFORM pg_temp.set_jwt(u_owner);
  PERFORM public.propose_employer_display_name(v_practice_id, 'Friendly Eye Care');

  SELECT proposed_display_name, public_display_name
  INTO proposed, public_name
  FROM public.employer_practice_profiles
  WHERE employer_practice_profiles.practice_id = v_practice_id;

  PERFORM pg_temp.dn_record(
    2, 'owner proposal stored as pending only',
    proposed = 'Friendly Eye Care' AND public_name IS NULL,
    'proposed=' || coalesce(proposed, 'null') || ' public=' || coalesce(public_name, 'null')
  );

  -- D3: CMS name unchanged
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.dn_record(
    3, 'CMS practice_name unchanged',
    (SELECT practice_name FROM public.practices WHERE id = v_practice_id) = cms_name,
    'cms=' || cms_name
  );
  PERFORM pg_temp.set_jwt(u_owner);

  -- D4: overlay public name still CMS until approval
  overlay := public.public_get_employer_practice_overlay(v_practice_id);
  PERFORM pg_temp.dn_record(
    4, 'overlay omits pending proposal; no public override yet',
    overlay->'profile'->>'public_display_name' IS NULL,
    overlay::text
  );

  -- D5: initial review can complete while proposal pending
  PERFORM public.complete_employer_initial_review(v_practice_id);
  PERFORM pg_temp.dn_record(
    5, 'initial review completes with pending name proposal',
    (SELECT initial_review_completed_at IS NOT NULL FROM public.employer_practice_profiles WHERE employer_practice_profiles.practice_id = v_practice_id),
    'review complete'
  );

  -- D6: admin approves
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.approve_employer_display_name(v_practice_id);
  overlay := public.public_get_employer_practice_overlay(v_practice_id);
  PERFORM pg_temp.dn_record(
    6, 'admin approval promotes public display name',
    overlay->'profile'->>'public_display_name' = 'Friendly Eye Care',
    overlay->'profile'->>'public_display_name'
  );

  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.dn_record(
    7, 'CMS practice_name still unchanged after approval',
    (SELECT practice_name FROM public.practices WHERE id = v_practice_id) = cms_name,
    cms_name
  );
  PERFORM pg_temp.set_jwt(u_admin);

  -- D8: reject flow on new proposal
  PERFORM pg_temp.set_jwt(u_owner);
  PERFORM public.propose_employer_display_name(v_practice_id, 'Rejected Name LLC');
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.reject_employer_display_name(v_practice_id, 'Does not match legal entity');
  PERFORM pg_temp.dn_record(
    8, 'rejection clears proposal and keeps approved public name',
    (SELECT proposed_display_name IS NULL AND public_display_name = 'Friendly Eye Care'
     FROM public.employer_practice_profiles WHERE employer_practice_profiles.practice_id = v_practice_id),
    'rejected'
  );

  -- D9: direct public_display_name update blocked for owner
  BEGIN
    PERFORM pg_temp.set_jwt(u_owner);
    UPDATE public.employer_practice_profiles
    SET public_display_name = 'Hacked Name'
    WHERE employer_practice_profiles.practice_id = v_practice_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    SELECT public_display_name INTO v_public
    FROM public.employer_practice_profiles
    WHERE employer_practice_profiles.practice_id = v_practice_id;
    PERFORM pg_temp.dn_record(
      9,
      'owner cannot set public_display_name directly',
      v_rows = 0 AND v_public = 'Friendly Eye Care',
      'rows=' || v_rows || ' public=' || coalesce(v_public, 'null')
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.dn_record(9, 'owner cannot set public_display_name directly', true, v_err);
  END;
END;
$test$;

SELECT case_no, description, pass, detail FROM display_name_results ORDER BY case_no;

DO $fail$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM display_name_results WHERE NOT pass;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '% display-name test(s) failed', v_fail;
  END IF;
END;
$fail$;

ROLLBACK;
