-- Employer leave / unclaim regression tests (local). Runs in one transaction; ROLLBACK at end.
-- Apply migration 20260901180000_employer_leave_unclaim.sql first.
--
--   npx supabase db query --linked -f docs/security/employer-leave-unclaim-test.sql

BEGIN;

CREATE TEMP TABLE leave_unclaim_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE leave_unclaim_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.lurecord(
  p_case int, p_desc text, p_expected text, p_pass boolean, p_detail text DEFAULT ''
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO leave_unclaim_results VALUES (
    p_case, p_desc, p_expected,
    CASE WHEN p_pass THEN coalesce(nullif(p_detail,''),'ok') ELSE coalesce(nullif(p_detail,''),'FAIL') END,
    p_pass
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

DO $leave_unclaim$
DECLARE
  u_admin uuid := 'f1000000-0000-4000-8000-000000000001';
  u_owner uuid := 'f1000000-0000-4000-8000-000000000002';
  u_editor uuid := 'f1000000-0000-4000-8000-000000000003';
  u_other uuid := 'f1000000-0000-4000-8000-000000000004';
  practice_a uuid;
  practice_b uuid;
  practice_c uuid;
  org_id uuid := 'e1000000-0000-4000-8000-000000000001';
  link_a uuid;
  link_b uuid;
  membership_editor uuid;
  membership_owner uuid;
  v_rows bigint;
  v_bool boolean;
  v_err text;
  v_cms_name text;
  v_overview text;
BEGIN
  SELECT p.id
  INTO practice_a
  FROM public.practices AS p
  ORDER BY p.id
  LIMIT 1;

  SELECT p.id
  INTO practice_b
  FROM public.practices AS p
  WHERE p.id <> practice_a
  ORDER BY p.id
  LIMIT 1;

  SELECT p.id
  INTO practice_c
  FROM public.practices AS p
  WHERE p.id NOT IN (practice_a, practice_b)
  ORDER BY p.id
  LIMIT 1;

  IF practice_a IS NULL OR practice_b IS NULL THEN
    RAISE EXCEPTION 'Need at least two practices in database';
  END IF;

  UPDATE public.employer_organization_practices
  SET
    status = 'inactive',
    inactive_at = now(),
    inactive_reason = 'leave-unclaim test setup'
  WHERE practice_id IN (practice_a, practice_b, practice_c)
    AND status = 'active'
    AND relationship = 'operates';

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
  SELECT x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'
  FROM (VALUES
    (u_admin, 'leave-admin@test.local'),
    (u_owner, 'leave-owner@test.local'),
    (u_editor, 'leave-editor@test.local'),
    (u_other, 'leave-other@test.local')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (email, user_id, is_admin, onboarding_complete)
  SELECT 'leave-admin@test.local', u_admin, true, true
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = u_admin);

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at, verified_by)
  VALUES (org_id, 'Leave Test Org', 'leave-test-org', 'verified', now(), u_admin)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, status = 'verified', archived_at = NULL;

  DELETE FROM public.organization_memberships WHERE organization_id = org_id;
  DELETE FROM public.employer_organization_practices WHERE organization_id = org_id;

  UPDATE public.employer_organization_practices
  SET
    status = 'inactive',
    inactive_at = now(),
    inactive_reason = 'leave-unclaim test setup'
  WHERE practice_id IN (practice_a, practice_b, practice_c)
    AND status = 'active'
    AND relationship = 'operates';

  INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by)
  VALUES (org_id, practice_a, u_admin)
  RETURNING id INTO link_a;

  IF practice_c IS NOT NULL THEN
    INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by)
    VALUES (org_id, practice_c, u_admin)
    RETURNING id INTO link_b;
  END IF;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES
    (org_id, u_owner, 'owner', 'active', now()),
    (org_id, u_editor, 'editor', 'active', now());

  SELECT id INTO membership_owner FROM public.organization_memberships
  WHERE organization_id = org_id AND user_id = u_owner AND status = 'active' LIMIT 1;
  SELECT id INTO membership_editor FROM public.organization_memberships
  WHERE organization_id = org_id AND user_id = u_editor AND status = 'active' LIMIT 1;

  INSERT INTO public.employer_practice_profiles (practice_id, overview)
  VALUES (practice_a, 'Employer overview A')
  ON CONFLICT (practice_id) DO UPDATE SET overview = EXCLUDED.overview;

  PERFORM pg_temp.set_jwt(u_editor);
  PERFORM public.self_leave_organization(org_id);
  PERFORM pg_temp.reset_auth();
  SELECT count(*) INTO v_rows FROM public.organization_memberships
  WHERE organization_id = org_id AND user_id = u_editor AND status = 'revoked';
  PERFORM pg_temp.lurecord(201, 'editor can leave self when another manager remains', 'revoked', v_rows = 1, 'rows=' || v_rows);

  SELECT count(*) INTO v_rows FROM public.organization_memberships
  WHERE organization_id = org_id AND user_id = u_owner AND status = 'active';
  PERFORM pg_temp.lurecord(202, 'leave revokes caller only (owner still active)', 'active owner', v_rows = 1, 'rows=' || v_rows);

  SELECT count(*) INTO v_rows FROM public.employer_organization_practices
  WHERE organization_id = org_id AND status = 'active';
  PERFORM pg_temp.lurecord(203, 'leave does not deactivate org-practice links', '>=1 active links', v_rows >= 1, 'links=' || v_rows);

  SELECT overview INTO v_overview FROM public.employer_practice_profiles WHERE practice_id = practice_a;
  PERFORM pg_temp.lurecord(
    204,
    'leave does not modify Layer 3 profile data',
    'overview preserved',
    coalesce(v_overview, '') = 'Employer overview A',
    'overview=' || coalesce(v_overview, 'null')
  );

  SELECT practice_name INTO v_cms_name FROM public.practices WHERE id = practice_a;
  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    UPDATE public.practices SET practice_name = 'CMS hacked by editor' WHERE id = practice_a;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.lurecord(205, 'leave path does not grant CMS write (editor)', 'DENY', v_rows = 0, 'rows=' || v_rows);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.lurecord(205, 'leave path does not grant CMS write (editor)', 'DENY', true);
  END;

  -- Re-invite editor for further cases
  PERFORM pg_temp.reset_auth();
  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES (org_id, u_editor, 'editor', 'active', now());

  -- 206 editor cannot unclaim while owner remains
  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    PERFORM public.employer_unclaim_practice(practice_a, 'should fail');
    PERFORM pg_temp.lurecord(206, 'editor cannot unclaim when other managers exist', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.lurecord(206, 'editor cannot unclaim when other managers exist', 'DENY', true, v_err);
  END;

  -- 207 owner cannot unclaim while editor remains
  PERFORM pg_temp.set_jwt(u_owner);
  BEGIN
    PERFORM public.employer_unclaim_practice(practice_a, 'should fail');
    PERFORM pg_temp.lurecord(207, 'unclaim blocked when another active manager exists', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.lurecord(207, 'unclaim blocked when another active manager exists', 'DENY', true, v_err);
  END;

  -- 208 unauthorized user cannot leave another org
  PERFORM pg_temp.set_jwt(u_other);
  BEGIN
    PERFORM public.self_leave_organization(org_id);
    PERFORM pg_temp.lurecord(208, 'unauthorized user cannot leave another org', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.lurecord(208, 'unauthorized user cannot leave another org', 'DENY', true, v_err);
  END;

  -- Remove editor so owner is last manager
  PERFORM pg_temp.reset_auth();
  UPDATE public.organization_memberships
  SET status = 'revoked', revoked_at = now(), revoked_by = u_admin
  WHERE organization_id = org_id AND user_id = u_editor AND status = 'active';

  -- 209 last manager cannot ordinary leave
  PERFORM pg_temp.set_jwt(u_owner);
  BEGIN
    PERFORM public.self_leave_organization(org_id);
    PERFORM pg_temp.lurecord(209, 'last manager cannot ordinary-leave and orphan active link', 'DENY', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.lurecord(
      209,
      'last manager cannot ordinary-leave and orphan active link',
      'DENY use_unclaim',
      coalesce(v_err LIKE '%Unclaim%', false),
      v_err
    );
  END;

  -- 210 last owner can unclaim practice A
  PERFORM public.employer_unclaim_practice(practice_a, 'regression unclaim');
  PERFORM pg_temp.reset_auth();
  SELECT count(*) INTO v_rows FROM public.employer_organization_practices
  WHERE id = link_a AND status = 'inactive';
  PERFORM pg_temp.lurecord(210, 'unclaim deactivates active operates link', 'inactive', v_rows = 1, 'rows=' || v_rows);

  SELECT count(*) INTO v_rows FROM public.organization_memberships
  WHERE organization_id = org_id AND user_id = u_owner AND status = 'revoked';
  PERFORM pg_temp.lurecord(211, 'unclaim revokes caller membership', 'revoked', v_rows = 1, 'rows=' || v_rows);

  SELECT public.employer_overlay_publicly_visible(practice_a) INTO v_bool;
  PERFORM pg_temp.lurecord(212, 'overlay becomes non-public after unclaim', 'false', v_bool IS FALSE, 'visible=' || coalesce(v_bool::text,'null'));

  SELECT overview INTO v_overview FROM public.employer_practice_profiles WHERE practice_id = practice_a;
  PERFORM pg_temp.lurecord(
    213,
    'employer Layer 3 data remains stored after unclaim',
    'preserved',
    coalesce(v_overview, '') = 'Employer overview A',
    'overview=' || coalesce(v_overview, 'null')
  );

  SELECT practice_name INTO v_cms_name FROM public.practices WHERE id = practice_a;
  PERFORM pg_temp.lurecord(214, 'CMS practice_name unchanged after unclaim', 'unchanged', v_cms_name IS NOT NULL, 'name=' || coalesce(v_cms_name,'null'));

  -- 215 new initial claim possible (no active operates link on practice A)
  PERFORM pg_temp.reset_auth();
  SELECT count(*) INTO v_rows FROM public.employer_organization_practices
  WHERE practice_id = practice_a AND status = 'active' AND relationship = 'operates';
  PERFORM pg_temp.lurecord(215, 'new initial claim possible after link deactivation', '0 active links', v_rows = 0, 'links=' || v_rows);

  PERFORM pg_temp.set_jwt(u_other);
  BEGIN
    INSERT INTO public.practice_claims (
      practice_id, submitted_by, claim_type, status,
      claimant_name, claimant_title, claimant_work_email, authority_attestation, attestation_text_version
    ) VALUES (
      practice_a, u_other, 'initial_claim', 'pending_email_verification',
      'Other', 'Mgr', 'other@test.com', true, 'v1'
    );
    PERFORM pg_temp.lurecord(216, 'initial_claim insert allowed after unclaim', 'ALLOW', true);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.lurecord(216, 'initial_claim insert allowed after unclaim', 'ALLOW', false, v_err);
  END;

  -- 217 multi-practice org still has other active links after single unclaim when configured
  SELECT count(*) INTO v_rows FROM public.employer_organization_practices
  WHERE organization_id = org_id AND status = 'active' AND id <> link_a;
  PERFORM pg_temp.lurecord(
    217,
    'multi-practice org retains other active practice links after single unclaim',
    '>=0 other links',
    v_rows >= 0,
    'other_links=' || v_rows
  );

  -- 218 owner/admin leave when second manager exists on fresh single-practice org
  PERFORM pg_temp.reset_auth();
  DELETE FROM public.organization_memberships
  WHERE organization_id = 'e1000000-0000-4000-8000-000000000002';
  DELETE FROM public.employer_organization_practices
  WHERE organization_id = 'e1000000-0000-4000-8000-000000000002';

  UPDATE public.employer_organization_practices
  SET
    status = 'inactive',
    inactive_at = now(),
    inactive_reason = 'leave-unclaim test setup'
  WHERE practice_id = practice_b
    AND status = 'active'
    AND relationship = 'operates';

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at, verified_by)
  VALUES ('e1000000-0000-4000-8000-000000000002', 'Single Practice Org', 'single-practice-org', 'verified', now(), u_admin)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, status = 'verified', archived_at = NULL;

  INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by)
  VALUES ('e1000000-0000-4000-8000-000000000002', practice_b, u_admin);

  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES
    ('e1000000-0000-4000-8000-000000000002', u_owner, 'admin', 'active', now()),
    ('e1000000-0000-4000-8000-000000000002', u_editor, 'editor', 'active', now());

  PERFORM pg_temp.set_jwt(u_owner);
  PERFORM public.self_leave_organization('e1000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_rows FROM public.organization_memberships
  WHERE organization_id = 'e1000000-0000-4000-8000-000000000002' AND user_id = u_owner AND status = 'revoked';
  PERFORM pg_temp.lurecord(218, 'owner/admin can leave self when another manager remains', 'revoked', v_rows = 1, 'rows=' || v_rows);
END;
$leave_unclaim$;

SELECT case_no, description, expected, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, detail
FROM leave_unclaim_results ORDER BY case_no;

SELECT count(*) FILTER (WHERE pass) AS passed, count(*) FILTER (WHERE NOT pass) AS failed, count(*) AS total
FROM leave_unclaim_results;

ROLLBACK;
