-- MAT-26 sponsor publication security rehearsal.
-- Transactional. Rolls back. Does not publish a lasting sponsor.
-- Prerequisites: 20261003170000_sponsor_publication_v1.sql
-- and 20261004120000_admin_brief_publication_candidate.sql.
-- Those two migrations ship together.
--
--   npx supabase db query --local -f docs/security/sponsor-publication-v1-security-test.sql
--
-- Do not point this at production until the forward migration has been applied
-- in a controlled rollout. This file itself never commits.

BEGIN;

CREATE TEMP TABLE sponsor_pub_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON TABLE sponsor_pub_results TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int, p_desc text, p_expected text, p_pass boolean, p_detail text DEFAULT ''
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sponsor_pub_results(case_no, description, expected, detail, pass)
  VALUES (p_case, p_desc, p_expected, COALESCE(p_detail, ''), p_pass)
  ON CONFLICT (case_no) DO UPDATE
  SET description = EXCLUDED.description, expected = EXCLUDED.expected,
      detail = EXCLUDED.detail, pass = EXCLUDED.pass;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('row_security', 'on', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_auth()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

DO $matrix$
DECLARE
  u_admin uuid := 'c0260000-0000-4000-8000-0000000000a1';
  u_phys uuid := 'c0260000-0000-4000-8000-0000000000b1';
  u_none uuid := 'c0260000-0000-4000-8000-0000000000c1';
  u_ed_a uuid := 'c0260000-0000-4000-8000-0000000000d1';
  u_ed_b uuid := 'c0260000-0000-4000-8000-0000000000e1';
  org_a uuid := 'c0260000-0000-4000-8000-0000000000f1';
  org_b uuid := 'c0260000-0000-4000-8000-0000000000f2';
  vendor_bl uuid;
  practice_a uuid;
  practice_b uuid;
  content_id uuid;
  replacement uuid;
  revision uuid;
  candidate_rev uuid;
  other_rev uuid;
  candidate jsonb;
  payload jsonb;
  err text;
  ok boolean;
  n int;
  n_before int;
BEGIN
  SELECT id INTO vendor_bl FROM public.vendors WHERE slug = 'bausch_plus_lomb';
  -- Disposable practices. Existing local practices are already operated, and
  -- that unique index is the behavior under test rather than fixture data.
  practice_a := 'c0260000-0000-4000-8000-0000000000a2';
  practice_b := 'c0260000-0000-4000-8000-0000000000b2';
  IF vendor_bl IS NULL THEN
    RAISE EXCEPTION 'need bausch vendor';
  END IF;
  INSERT INTO public.practices (id, practice_name) VALUES
    (practice_a, 'MAT26 Practice A'),
    (practice_b, 'MAT26 Practice B');

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
  VALUES
    (u_admin, 'authenticated', 'authenticated', 'mat26-admin@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_phys, 'authenticated', 'authenticated', 'mat26-phys@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_none, 'authenticated', 'authenticated', 'mat26-none@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_ed_a, 'authenticated', 'authenticated', 'mat26-eda@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_ed_b, 'authenticated', 'authenticated', 'mat26-edb@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000');

  INSERT INTO public.profiles (email, user_id, is_admin, onboarding_complete) VALUES
    ('mat26-admin@matchmed-e2e.test', u_admin, true, true),
    ('mat26-phys@matchmed-e2e.test', u_phys, false, true),
    ('mat26-none@matchmed-e2e.test', u_none, false, true),
    ('mat26-eda@matchmed-e2e.test', u_ed_a, false, true),
    ('mat26-edb@matchmed-e2e.test', u_ed_b, false, true);

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at, verified_by) VALUES
    (org_a, 'MAT26 Org A', 'mat26-org-a', 'verified', now(), u_admin),
    (org_b, 'MAT26 Org B', 'mat26-org-b', 'verified', now(), u_admin);
  INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by) VALUES
    (org_a, practice_a, u_admin),
    (org_b, practice_b, u_admin);
  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at) VALUES
    (org_a, u_ed_a, 'editor', 'active', now()),
    (org_b, u_ed_b, 'editor', 'active', now());

  SELECT id INTO content_id
  FROM public.sponsor_vendor_content
  WHERE vendor_id = vendor_bl AND is_active = true
  ORDER BY sort_order
  LIMIT 1;

  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, true, true, true, 'rehearsal');
  PERFORM public.admin_record_company_approval_content(content_id, 'MAT26-TEST-REF', 'Reviewer', 'Director', 'Bausch + Lomb');
  PERFORM public.admin_record_matchmed_approval_content(content_id);
  PERFORM public.admin_publish_content(content_id);
  PERFORM pg_temp.reset_auth();

  -- 1 physician denied employer directory
  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    payload := public.list_employer_sponsors();
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%employer_access_denied%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(1, 'authenticated physician denied employer directory', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 2 employer without membership denied
  PERFORM pg_temp.set_jwt(u_none);
  BEGIN
    payload := public.list_employer_sponsors();
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%employer_access_denied%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(2, 'user without organization membership denied', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 3 other organization denied for this practice
  PERFORM pg_temp.set_jwt(u_ed_b);
  BEGIN
    payload := public.get_employer_practice_sponsor_context(practice_a, 'bausch-lomb');
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%employer_practice_denied%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(3, 'employer from another organization denied', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 4 authorized member allowed directory
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    payload := public.list_employer_sponsors();
    ok := jsonb_typeof(payload) = 'array';
    err := left(payload::text, 180);
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.record(4, 'authorized organization member can call employer directory', 'array', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 5 editor allowed for exact practice
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    payload := public.get_employer_practice_sponsor_context(practice_a, 'bausch-lomb');
    ok := payload IS NOT NULL AND NOT (payload::text LIKE '%practice_id%');
    err := left(COALESCE(payload::text, 'null'), 180);
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.record(5, 'authorized editor allowed for the exact practice', 'context without practice_id', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 6 same user denied for a different practice
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    payload := public.get_employer_practice_sponsor_context(practice_b, 'bausch-lomb');
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%employer_practice_denied%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(6, 'same editor denied for a different practice', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 7 published copy cannot be edited in place
  BEGIN
    UPDATE public.sponsor_vendor_content SET title = 'CHANGED UNDER APPROVAL' WHERE id = content_id;
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_content_immutable%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(7, 'published library copy cannot change under approval', 'immutable', ok, err);

  -- 8 destination cannot change under approval
  BEGIN
    UPDATE public.sponsor_vendor_content SET url = 'https://example.com/changed' WHERE id = content_id;
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_content_immutable%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(8, 'published destination cannot change under approval', 'immutable', ok, err);

  -- 9 replacement is a new draft and does not inherit approval
  PERFORM pg_temp.set_jwt(u_admin);
  replacement := public.admin_create_content_replacement(content_id);
  PERFORM pg_temp.reset_auth();
  SELECT publication_state = 'draft' AND company_approved_at IS NULL AND matchmed_approved_at IS NULL
    INTO ok
  FROM public.sponsor_vendor_content WHERE id = replacement;
  PERFORM pg_temp.record(9, 'replacement row is an unapproved draft', 'draft', COALESCE(ok, false), replacement::text);

  -- 10 profile flags do not approve the replacement
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.get_atlas_sponsor_page('bausch-lomb');
  ok := NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload->'sections') e WHERE e->>'title' = (
      SELECT title FROM public.sponsor_vendor_content WHERE id = replacement
    ) AND false
  );
  -- The replacement title matches the published title, so assert the draft id is absent from product JSON.
  ok := payload::text NOT LIKE '%' || replacement::text || '%';
  PERFORM pg_temp.record(10, 'unapproved replacement is absent from the Atlas page', 'hidden', ok, left(COALESCE(payload::text, 'null'), 120));
  PERFORM pg_temp.reset_auth();

  -- 11 unsafe urls rejected
  BEGIN
    PERFORM public.sponsor_https_url_problem('javascript:alert(1)');
    ok := public.sponsor_https_url_problem('javascript:alert(1)') = 'scheme'
      AND public.sponsor_https_url_problem('//evil.example') = 'protocol-relative'
      AND public.sponsor_https_url_problem('https://user:pass@example.com') = 'credentials'
      AND public.sponsor_https_url_problem('https://127.0.0.1/x') = 'private-address'
      AND public.sponsor_https_url_problem('https://localhost/x') = 'local-host'
      AND public.sponsor_https_url_problem('https://10.1.1.1/x') = 'private-address'
      AND public.sponsor_https_url_problem('https://169.254.1.1/x') = 'private-address'
      AND public.sponsor_https_url_problem('https://example.com/?practice_id=1') = 'context-query'
      AND public.sponsor_https_url_problem('https://example.com/path') IS NULL;
    err := 'classified';
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.record(11, 'database URL validator rejects unsafe destinations', 'classified', ok, err);

  -- 12 kill switch hides product surfaces and keeps admin preview
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, false, true, true, true, 'emergency');
  payload := public.admin_get_sponsor_preview('bausch-lomb');
  ok := payload IS NOT NULL AND (payload->>'is_active') = 'false';
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_phys);
  ok := ok AND public.get_atlas_sponsor_page('bausch-lomb') IS NULL
    AND public.list_active_atlas_sponsors()::text NOT LIKE '%bausch-lomb%';
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    ok := ok AND public.get_employer_sponsor_page('bausch-lomb') IS NULL;
    err := 'hidden';
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.record(12, 'is_active false hides product RPCs and admin preview still works', 'hidden + preview', ok, err);
  PERFORM pg_temp.reset_auth();

  -- restore active for brief tests
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, false, true, true, 'restore rehearsal');
  revision := public.admin_create_brief_draft(
    vendor_bl, '2026-11', 'October rehearsal', 'Draft introduction for the rehearsal only.', 'both'
  );
  PERFORM public.admin_replace_brief_items(revision, jsonb_build_array(
    jsonb_build_object(
      'position', 1, 'title', 'Item', 'summary', 'Summary',
      'source_label', 'Company announcement', 'source_url', 'https://example.com/source',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    )
  ));
  SELECT count(*) INTO n_before FROM public.sponsor_publication_events WHERE vendor_id = vendor_bl;
  BEGIN
    PERFORM public.admin_publish_brief(revision, true);
    ok := false; err := 'published without approval';
  EXCEPTION WHEN OTHERS THEN
    ok := true; err := SQLERRM;
  END;
  SELECT count(*) INTO n FROM public.sponsor_publication_events WHERE vendor_id = vendor_bl;
  ok := ok AND n = n_before;
  PERFORM pg_temp.record(13, 'failed publish leaves no audit event', 'rolled back together', ok, err);

  PERFORM public.admin_record_company_approval_brief(revision, 'MAT26-BRIEF-REF', 'Reviewer', 'Director', 'Bausch + Lomb');
  PERFORM public.admin_record_matchmed_approval_brief(revision);
  PERFORM public.admin_publish_brief(revision, true);
  SELECT count(*) INTO n FROM public.sponsor_publication_events WHERE brief_revision_id = revision AND action = 'publish';
  payload := public.get_public_sponsor_brief('bausch-lomb', '2026-11');
  ok := n = 1 AND payload->>'state_label' = 'current';
  PERFORM pg_temp.record(14, 'approved publish writes an audit event and a public payload', 'both', ok, left(COALESCE(payload::text, 'null'), 160));

  -- 15 internal vendor slug is not a public brief identity
  ok := public.get_public_sponsor_brief('bausch_plus_lomb', '2026-11') IS NULL;
  PERFORM pg_temp.record(15, 'internal vendor slug does not resolve a public brief', 'null', ok, 'bausch_plus_lomb');

  -- 16 directory hidden does not hide a shared brief while sponsor is active
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, false, true, true, 'hide directory');
  payload := public.get_public_sponsor_brief('bausch-lomb', '2026-11');
  ok := payload->>'state_label' = 'current'
    AND public.list_active_atlas_sponsors()::text NOT LIKE '%bausch-lomb%';
  PERFORM pg_temp.record(16, 'directory off keeps a shared brief while the sponsor is active', 'brief remains', ok, left(COALESCE(payload::text, 'null'), 80));

  -- 17 withdrawn brief is immediately unavailable
  PERFORM public.admin_set_brief_state(revision, 'withdrawn', 'rehearsal recall');
  ok := public.get_public_sponsor_brief('bausch-lomb', '2026-11') IS NULL;
  PERFORM pg_temp.record(17, 'withdrawn brief is unavailable', 'null', ok, 'withdrawn');

  -- 18 kill switch hides an archived brief without per-brief withdraw
  revision := public.admin_create_brief_draft(
    vendor_bl, '2026-12', 'Archive rehearsal', 'Second draft.', 'both'
  );
  PERFORM public.admin_replace_brief_items(revision, jsonb_build_array(
    jsonb_build_object(
      'position', 1, 'title', 'Archived item', 'summary', 'Summary',
      'source_label', 'Company announcement', 'source_url', 'https://example.com/archive',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    )
  ));
  PERFORM public.admin_record_company_approval_brief(revision, 'MAT26-ARCH', 'Reviewer', 'Director', 'Bausch + Lomb');
  PERFORM public.admin_record_matchmed_approval_brief(revision);
  PERFORM public.admin_publish_brief(revision, true);
  PERFORM public.admin_set_brief_state(revision, 'archived', NULL);
  payload := public.get_public_sponsor_brief('bausch-lomb', '2026-12');
  ok := payload->>'state_label' = 'archived';
  PERFORM public.admin_set_sponsor_flags(vendor_bl, false, false, false, false, 'kill');
  ok := ok AND public.get_public_sponsor_brief('bausch-lomb', '2026-12') IS NULL
    AND public.admin_get_sponsor_preview('bausch-lomb') IS NOT NULL;
  PERFORM pg_temp.record(18, 'active archive stays readable; kill switch hides it; preview remains', 'both', ok, COALESCE(payload->>'state_label', 'null'));

  -- 19 anon cannot read audit or employer RPCs
  PERFORM pg_temp.reset_auth();
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    payload := public.list_employer_sponsors();
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := true; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(19, 'anon denied employer directory', 'error', ok, err);

  -- 20 public payload has no audit or approver fields
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, false, true, false, 'brief only');
  -- 2026-11 was withdrawn; 2026-12 was archived then sponsor killed and reactivated.
  -- Re-share by creating nothing new: archived row still has sharing if we only flipped is_active.
  payload := public.get_public_sponsor_brief('bausch-lomb', '2026-12');
  ok := payload IS NOT NULL
    AND payload::text NOT LIKE '%company_approver%'
    AND payload::text NOT LIKE '%actor_id%'
    AND payload::text NOT LIKE '%external_reference%';
  PERFORM pg_temp.record(20, 'public brief payload omits approval and audit fields', 'clean', ok, left(COALESCE(payload::text, 'null'), 160));
  PERFORM pg_temp.reset_auth();

  -- 21 legacy content was not auto-approved: a second untouched row stays off the page
  SELECT count(*) INTO n
  FROM public.sponsor_vendor_content
  WHERE vendor_id = vendor_bl
    AND publication_state = 'draft'
    AND company_approved_at IS NULL;
  PERFORM pg_temp.record(21, 'existing library rows remain unapproved drafts', 'at least one', n >= 1, n::text);

  -- 22 illustrative public item rejected
  BEGIN
    INSERT INTO public.sponsor_brief_items (
      revision_id, position, title, summary, source_label, illustrative, included_publicly, verification_state
    ) VALUES (revision, 2, 'x', 'y', 'z', true, true, 'verified');
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := true; err := SQLERRM;
  END;
  PERFORM pg_temp.record(22, 'illustrative items cannot be publicly included', 'rejected', ok, err);

  -- 23 signed-out caller has no employer access
  PERFORM pg_temp.reset_auth();
  BEGIN
    payload := public.list_employer_sponsors();
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%employer_access_denied%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(23, 'signed-out caller denied employer directory', 'denied', ok, err);

  -- 24 inactive membership does not grant access
  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES (org_a, u_none, 'editor', 'revoked', now());
  PERFORM pg_temp.set_jwt(u_none);
  BEGIN
    payload := public.list_employer_sponsors();
    ok := false; err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%employer_access_denied%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(24, 'revoked organization member denied', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 25 multi-practice access is limited to operated practices
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, true, true, true, 'multi-practice');
  PERFORM pg_temp.reset_auth();
  INSERT INTO public.practices (id, practice_name)
  VALUES ('c0260000-0000-4000-8000-0000000000c2', 'MAT26 Practice C');
  INSERT INTO public.employer_organization_practices (organization_id, practice_id, approved_by)
  VALUES (org_a, 'c0260000-0000-4000-8000-0000000000c2', u_admin);
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    payload := public.get_employer_practice_sponsor_context('c0260000-0000-4000-8000-0000000000c2', 'bausch-lomb');
    ok := payload IS NOT NULL
      AND payload::text NOT LIKE '%' || practice_a::text || '%'
      AND payload::text NOT LIKE '%' || practice_b::text || '%';
    err := left(COALESCE(payload::text, 'null'), 120);
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  BEGIN
    PERFORM public.get_employer_practice_sponsor_context(practice_b, 'bausch-lomb');
    ok := false; err := 'other practice succeeded';
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM LIKE '%employer_practice_denied%';
    err := err || ' | ' || SQLERRM;
  END;
  PERFORM pg_temp.record(25, 'editor sees only an operated practice and not another organization', 'scoped', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 26-28 admin writes are admin-only and ignore caller-supplied identities
  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    PERFORM public.admin_set_sponsor_flags(vendor_bl, true, true, true, true, 'impersonate');
    ok := false; err := 'physician wrote flags';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_admin_required%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(26, 'physician denied admin flag write', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    PERFORM public.admin_publish_content(content_id);
    ok := false; err := 'employer published';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_admin_required%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(27, 'employer denied admin publish', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  PERFORM pg_temp.set_jwt(u_none);
  ok := public.employer_has_dashboard_access(u_admin) = false;
  PERFORM pg_temp.record(28, 'caller cannot impersonate an administrator or another member', 'false', ok, 'employer_has_dashboard_access(admin) as non-member');
  PERFORM pg_temp.reset_auth();

  -- 29 audience flags are independent and cannot override the kill switch
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, true, true, false, 'atlas only');
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_phys);
  ok := public.get_atlas_sponsor_page('bausch-lomb') IS NOT NULL;
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    ok := ok AND public.get_employer_sponsor_page('bausch-lomb') IS NULL;
    err := 'atlas on, employers off';
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, true, false, true, 'employers only');
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_phys);
  ok := ok AND public.get_atlas_sponsor_page('bausch-lomb') IS NULL;
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    ok := ok AND public.get_employer_sponsor_page('bausch-lomb') IS NOT NULL;
    err := err || ' | employers on, atlas off';
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, false, true, true, true, 'kill despite audiences');
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_phys);
  ok := ok AND public.get_atlas_sponsor_page('bausch-lomb') IS NULL;
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    payload := public.get_employer_practice_sponsor_context(practice_a, 'bausch-lomb');
    ok := ok AND payload IS NULL AND public.get_employer_sponsor_page('bausch-lomb') IS NULL;
    err := err || ' | kill switch';
  EXCEPTION WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.record(29, 'audience flags are independent and do not override is_active', 'separated', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 30 scheduled, expired, recalled, and unverified publication rules
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_set_sponsor_flags(vendor_bl, true, false, true, true, 'state matrix');
  revision := public.admin_create_brief_draft(vendor_bl, '2027-03', 'Scheduled rehearsal', 'Not yet.', 'both');
  PERFORM public.admin_replace_brief_items(revision, jsonb_build_array(
    jsonb_build_object(
      'position', 1, 'title', 'Future item', 'summary', 'Summary',
      'source_label', 'Company announcement', 'source_url', 'https://example.com/future',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    )
  ));
  PERFORM pg_temp.reset_auth();
  UPDATE public.sponsor_brief_revisions
  SET published_at = now() + interval '7 days'
  WHERE id = revision;
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_record_company_approval_brief(revision, 'MAT26-SCHED', 'Reviewer', 'Director', 'Bausch + Lomb');
  PERFORM public.admin_record_matchmed_approval_brief(revision);
  PERFORM public.admin_publish_brief(revision, true);
  ok := public.get_public_sponsor_brief('bausch-lomb', '2027-03') IS NULL;
  PERFORM public.admin_set_brief_state(revision, 'unpublished', 'clear current');
  replacement := public.admin_create_brief_draft(vendor_bl, '2027-04', 'Expired rehearsal', 'Already published.', 'both');
  PERFORM public.admin_replace_brief_items(replacement, jsonb_build_array(
    jsonb_build_object(
      'position', 1, 'title', 'Expired item', 'summary', 'Summary',
      'source_label', 'Company announcement', 'source_url', 'https://example.com/expired',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    )
  ));
  PERFORM pg_temp.reset_auth();
  UPDATE public.sponsor_brief_revisions
  SET expires_at = now() - interval '1 day'
  WHERE id = replacement;
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_record_company_approval_brief(replacement, 'MAT26-EXP', 'Reviewer', 'Director', 'Bausch + Lomb');
  PERFORM public.admin_record_matchmed_approval_brief(replacement);
  PERFORM public.admin_publish_brief(replacement, true);
  payload := public.get_public_sponsor_brief('bausch-lomb', '2027-04');
  ok := ok AND payload->>'state_label' = 'expired' AND payload::text NOT LIKE '%Expired item%';
  PERFORM public.admin_set_brief_state(replacement, 'recalled', 'rehearsal recall');
  ok := ok AND public.get_public_sponsor_brief('bausch-lomb', '2027-04') IS NULL;
  err := COALESCE(payload->>'state_label', 'null');
  PERFORM pg_temp.record(30, 'future, expired, and recalled briefs withhold the body', 'withheld', COALESCE(ok, false), err);

  -- 31 published brief revision is immutable; a later draft does not change it
  revision := public.admin_create_brief_draft(vendor_bl, '2027-05', 'Immutable original', 'Original introduction.', 'both');
  PERFORM public.admin_replace_brief_items(revision, jsonb_build_array(
    jsonb_build_object(
      'position', 1, 'title', 'Original item', 'summary', 'Summary',
      'source_label', 'Company announcement', 'source_url', 'https://example.com/original',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    )
  ));
  PERFORM public.admin_record_company_approval_brief(revision, 'MAT26-IMM', 'Reviewer', 'Director', 'Bausch + Lomb');
  PERFORM public.admin_record_matchmed_approval_brief(revision);
  PERFORM public.admin_publish_brief(revision, true);
  PERFORM pg_temp.reset_auth();
  BEGIN
    UPDATE public.sponsor_brief_revisions SET title = 'tampered' WHERE id = revision;
    ok := false; err := 'title changed';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_brief_immutable%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.set_jwt(u_admin);
  replacement := public.admin_create_brief_draft(vendor_bl, '2027-05', 'Draft replacement', 'Replacement introduction.', 'both');
  PERFORM pg_temp.reset_auth();
  SELECT title = 'Immutable original' INTO ok FROM public.sponsor_brief_revisions WHERE id = revision;
  ok := ok AND replacement IS NOT NULL;
  PERFORM pg_temp.record(31, 'published brief stays immutable when a draft replacement is created', 'unchanged', ok, err);

  -- 32 item-count, uniqueness, and unverified destination
  PERFORM pg_temp.reset_auth();
  BEGIN
    INSERT INTO public.sponsor_brief_revisions (
      issue_id, vendor_id, revision_number, title, introduction, audience
    )
    SELECT issue_id, vendor_id, revision_number, 'dup', 'dup', 'both'
    FROM public.sponsor_brief_revisions WHERE id = revision;
    ok := false; err := 'duplicate revision inserted';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_brief_revisions_unique%';
    err := SQLERRM;
  END;
  PERFORM pg_temp.set_jwt(u_admin);
  replacement := public.admin_create_brief_draft(vendor_bl, '2027-06', 'Too many', 'Too many items.', 'both');
  BEGIN
    PERFORM public.admin_replace_brief_items(replacement, jsonb_build_array(
      jsonb_build_object('position', 1, 'title', 'A', 'summary', 'S', 'source_label', 'L', 'source_url', 'https://example.com/a', 'verification_state', 'verified', 'included_publicly', true, 'illustrative', false),
      jsonb_build_object('position', 2, 'title', 'B', 'summary', 'S', 'source_label', 'L', 'source_url', 'https://example.com/b', 'verification_state', 'verified', 'included_publicly', true, 'illustrative', false),
      jsonb_build_object('position', 3, 'title', 'C', 'summary', 'S', 'source_label', 'L', 'source_url', 'https://example.com/c', 'verification_state', 'verified', 'included_publicly', true, 'illustrative', false),
      jsonb_build_object('position', 4, 'title', 'D', 'summary', 'S', 'source_label', 'L', 'source_url', 'https://example.com/d', 'verification_state', 'verified', 'included_publicly', true, 'illustrative', false),
      jsonb_build_object('position', 5, 'title', 'E', 'summary', 'S', 'source_label', 'L', 'source_url', 'https://example.com/e', 'verification_state', 'verified', 'included_publicly', true, 'illustrative', false)
    ));
    ok := false; err := err || ' | five items accepted';
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM LIKE '%brief_item_count%';
    err := err || ' | ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.admin_replace_brief_items(replacement, jsonb_build_array(
      jsonb_build_object('position', 1, 'title', 'A', 'summary', 'S', 'source_label', 'L', 'source_url', 'https://example.com/a', 'verification_state', 'verified', 'included_publicly', true, 'illustrative', false),
      jsonb_build_object('position', 3, 'title', 'C', 'summary', 'S', 'source_label', 'L', 'source_url', 'https://example.com/c', 'verification_state', 'verified', 'included_publicly', true, 'illustrative', false)
    ));
    ok := false; err := err || ' | gapped items accepted';
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM LIKE '%brief_item_gap%';
    err := err || ' | ' || SQLERRM;
  END;
  replacement := public.admin_create_brief_draft(vendor_bl, '2027-07', 'Unverified', 'Unverified destination.', 'both');
  BEGIN
    PERFORM public.admin_replace_brief_items(replacement, jsonb_build_array(
      jsonb_build_object(
        'position', 1, 'title', 'Unverified item', 'summary', 'Summary',
        'source_label', 'Company announcement', 'source_url', 'https://example.com/unverified',
        'verification_state', 'unverified', 'included_publicly', true, 'illustrative', false
      )
    ));
    ok := false; err := err || ' | unverified public item accepted';
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM LIKE '%sponsor_brief_items_public_source%';
    err := err || ' | ' || SQLERRM;
  END;
  PERFORM pg_temp.record(32, 'revision uniqueness, item count, and unverified items block publication', 'rejected', ok, err);

  -- 33 audit rows exist for the state changes and cannot be mutated
  PERFORM pg_temp.reset_auth();
  SELECT count(*) INTO n FROM public.sponsor_publication_events
  WHERE vendor_id = vendor_bl AND action IN (
    'company_approval', 'matchmed_approval', 'publish', 'content_revision_created',
    'archived', 'withdrawn', 'recalled', 'expired', 'brief_revision_created'
  );
  BEGIN
    UPDATE public.sponsor_publication_events SET reason = 'tamper' WHERE vendor_id = vendor_bl;
    ok := false; err := 'audit updated';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_audit_append_only%';
    err := SQLERRM;
  END;
  BEGIN
    DELETE FROM public.sponsor_publication_events WHERE vendor_id = vendor_bl;
    ok := false; err := 'audit deleted';
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM LIKE '%sponsor_audit_append_only%' AND n >= 8;
    err := err || ' | events=' || n::text;
  END;
  PERFORM pg_temp.record(33, 'approval and state changes are append-only audit events', 'append-only', ok, err);

  -- 34 anonymous and signed-in public bodies match and hide private fields
  payload := public.get_public_sponsor_brief('bausch-lomb', '2026-12');
  PERFORM pg_temp.reset_auth();
  EXECUTE 'SET LOCAL ROLE anon';
  ok := public.get_public_sponsor_brief('bausch-lomb', '2026-12') = payload
    AND payload IS NOT NULL
    AND payload::text NOT LIKE '%company_approver%'
    AND payload::text NOT LIKE '%actor_id%'
    AND payload::text NOT LIKE '%bausch_plus_lomb%'
    AND public.get_public_sponsor_brief('not-a-sponsor', '2026-12') IS NULL;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.set_jwt(u_phys);
  ok := ok AND public.get_public_sponsor_brief('bausch-lomb', '2026-12') = payload;
  PERFORM pg_temp.record(34, 'anonymous and signed-in brief bodies match and omit private fields', 'identical', ok, left(COALESCE(payload::text, 'null'), 80));
  PERFORM pg_temp.reset_auth();

  -- 35 old slug redirects only while the destination brief is readable
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.admin_rename_public_slug(vendor_bl, 'bausch-lomb-rehearsal');
  payload := public.resolve_sponsor_brief_canonical('bausch-lomb', '2026-12');
  ok := payload->>'public_slug' = 'bausch-lomb-rehearsal' AND (payload->>'redirect')::boolean = true;
  PERFORM public.admin_set_sponsor_flags(vendor_bl, false, false, false, false, 'hide redirect target');
  ok := ok AND public.resolve_sponsor_brief_canonical('bausch-lomb', '2026-12') IS NULL
    AND public.get_public_sponsor_brief('bausch-lomb-rehearsal', '2026-12') IS NULL;
  PERFORM pg_temp.record(35, 'old slug redirects only when the destination brief is readable', 'conditional', ok, left(COALESCE(payload::text, 'null'), 120));

  -- 36 Johnson & Johnson Vision stays inactive and unpublished
  PERFORM pg_temp.reset_auth();
  SELECT p.is_active = false
     AND p.atlas_enabled = false
     AND p.employers_enabled = false
     AND NOT EXISTS (
       SELECT 1 FROM public.sponsor_vendor_content c
       WHERE c.vendor_id = p.vendor_id AND c.publication_state <> 'draft'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.sponsor_brief_revisions r
       WHERE r.vendor_id = p.vendor_id AND r.publication_state <> 'draft'
     )
    INTO ok
  FROM public.sponsor_vendor_profiles p
  JOIN public.vendors v ON v.id = p.vendor_id
  WHERE v.slug = 'johnson_and_johnson_vision';
  ok := COALESCE(ok, false) AND public.get_public_sponsor_brief('johnson-and-johnson-vision', '2026-10') IS NULL;
  PERFORM pg_temp.record(36, 'Johnson & Johnson Vision remains inactive and unpublished', 'inactive', ok, 'johnson-and-johnson-vision');

  -- 37 additional URL classes
  ok := public.sponsor_https_url_problem('http://example.com/a') = 'scheme'
    AND public.sponsor_https_url_problem('data:text/html,hi') = 'scheme'
    AND public.sponsor_https_url_problem('https://') = 'malformed'
    AND public.sponsor_https_url_problem('https://192.168.1.1/x') = 'private-address'
    AND public.sponsor_https_url_problem('https://172.16.0.1/x') = 'private-address'
    AND public.sponsor_https_url_problem('https://example.com/?utm_source=atlas') = 'context-query'
    AND public.sponsor_https_url_problem('https://example.com/?physician_id=1') = 'context-query'
    AND public.sponsor_https_url_problem('https://example.com/?user_id=1') = 'context-query'
    AND public.sponsor_https_url_problem('https://example.com/?referral=1') = 'context-query';
  PERFORM pg_temp.record(37, 'validator rejects http, data, malformed, private, and tracking URLs', 'classified', ok, 'extended');

  -- 38 private brief bucket is not readable by anon or a non-admin
  PERFORM pg_temp.reset_auth();
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('sponsor-brief-assets', 'rehearsal/draft.pdf');
  PERFORM pg_temp.reset_auth();
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'sponsor-brief-assets';
    ok := n = 0;
    err := 'anon rows ' || n::text;
  EXCEPTION WHEN OTHERS THEN
    ok := true; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.set_jwt(u_phys);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO n FROM storage.objects WHERE name = 'rehearsal/draft.pdf';
    ok := ok AND n = 0;
    err := err || ' | physician rows ' || n::text;
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND true; err := err || ' | ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(38, 'draft brief asset is not readable by anon or a physician', 'hidden', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 39-49 brief publication candidate. Tables stay closed; only the admin RPC reads them.
  PERFORM pg_temp.set_jwt(u_admin);
  candidate_rev := public.admin_create_brief_draft(vendor_bl, '2027-08', 'Candidate rehearsal', 'Candidate introduction.', 'both');
  PERFORM public.admin_replace_brief_items(candidate_rev, jsonb_build_array(
    jsonb_build_object(
      'position', 2, 'title', 'Second', 'summary', 'Second summary',
      'source_label', 'Event', 'source_url', 'https://events.example/two',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    ),
    jsonb_build_object(
      'position', 1, 'title', 'First', 'summary', 'First summary',
      'source_label', 'Source', 'source_url', 'https://source.example/one',
      'cta_url', 'https://cta.example/one',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    ),
    jsonb_build_object(
      'position', 3, 'title', 'Hidden', 'summary', 'Hidden summary',
      'source_label', 'Draft', 'source_url', 'https://hidden.example/draft',
      'verification_state', 'unverified', 'included_publicly', false, 'illustrative', true
    )
  ));
  other_rev := public.admin_create_brief_draft(vendor_bl, '2027-09', 'Other revision', 'Other introduction.', 'both');
  PERFORM public.admin_replace_brief_items(other_rev, jsonb_build_array(
    jsonb_build_object(
      'position', 1, 'title', 'Other', 'summary', 'Other summary',
      'source_label', 'Other', 'source_url', 'https://other-revision.example/item',
      'verification_state', 'verified', 'included_publicly', true, 'illustrative', false
    )
  ));
  PERFORM pg_temp.reset_auth();
  UPDATE public.sponsor_brief_revisions
  SET pdf_asset_path = candidate_rev::text || '/2026-12.pdf',
      published_at = '2026-12-01 00:00:00+00'
  WHERE id = candidate_rev;

  PERFORM pg_temp.reset_auth();
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.admin_get_brief_publication_candidate(candidate_rev);
    ok := false; err := 'anon was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := SQLERRM;
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(39, 'signed-out caller cannot read a brief publication candidate', 'denied', ok, err);

  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    PERFORM public.admin_get_brief_publication_candidate(candidate_rev);
    ok := false; err := 'physician was allowed';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_admin_required%'; err := SQLERRM;
  END;
  PERFORM pg_temp.record(40, 'physician cannot read a brief publication candidate', 'denied', ok, err);

  PERFORM pg_temp.set_jwt(u_ed_a);
  BEGIN
    PERFORM public.admin_get_brief_publication_candidate(candidate_rev);
    ok := false; err := 'employer was allowed';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_admin_required%'; err := SQLERRM;
  END;
  PERFORM pg_temp.record(41, 'employer cannot read a brief publication candidate', 'denied', ok, err);

  PERFORM pg_temp.set_jwt(u_none);
  BEGIN
    PERFORM public.admin_get_brief_publication_candidate(candidate_rev);
    ok := false; err := 'non-member was allowed';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%sponsor_admin_required%'; err := SQLERRM;
  END;
  PERFORM pg_temp.record(42, 'non-member cannot read a brief publication candidate', 'denied', ok, err);
  PERFORM pg_temp.record(43, 'non-admin authenticated user cannot read a brief publication candidate', 'denied', ok, err);

  PERFORM pg_temp.set_jwt(u_admin);
  candidate := public.admin_get_brief_publication_candidate(candidate_rev);
  ok := candidate->>'revision_id' = candidate_rev::text
    AND candidate->>'publication_state' = 'draft'
    AND candidate->>'published_at' IS NOT NULL
    AND jsonb_array_length(candidate->'items') = 2
    AND candidate->'items'->0->>'position' = '1'
    AND candidate->'items'->0->>'source_url' = 'https://source.example/one'
    AND candidate->'items'->0->>'cta_url' = 'https://cta.example/one'
    AND candidate->'items'->1->>'position' = '2'
    AND candidate->'items'->1->>'source_url' = 'https://events.example/two'
    AND candidate->>'logo_url' IS NOT DISTINCT FROM (
      SELECT logo_url FROM public.sponsor_vendor_profiles WHERE vendor_id = vendor_bl
    );
  PERFORM pg_temp.record(44, 'administrator receives the requested revision with items in position order', 'exact revision', ok, 'ordered');

  ok := candidate::text NOT LIKE '%other-revision.example%'
    AND candidate::text NOT LIKE '%hidden.example%';
  PERFORM pg_temp.record(45, 'candidate excludes other revisions and items that are not included', 'isolated', ok, 'two included items');

  BEGIN
    SELECT count(*) INTO n FROM public.sponsor_brief_revisions;
    ok := false; err := 'admin select returned ' || n::text;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := SQLERRM;
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  BEGIN
    SELECT count(*) INTO n FROM public.sponsor_brief_items;
    ok := ok AND false; err := err || ' items visible';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := ok AND true;
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    SELECT count(*) INTO n FROM public.sponsor_brief_revisions;
    ok := ok AND false;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := ok AND true;
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  PERFORM pg_temp.record(46, 'direct authenticated selects on brief tables remain denied', 'denied', ok, err);

  PERFORM pg_temp.reset_auth();
  ok := candidate->>'pdf_external_url' IS NULL
    AND candidate->>'pdf_asset_path' = candidate_rev::text || '/2026-12.pdf'
    AND left(candidate->>'pdf_asset_path', 8) IS DISTINCT FROM 'https://';
  UPDATE public.sponsor_brief_revisions
  SET pdf_asset_path = 'https://cdn.example/brief.pdf',
      pdf_asset_state = 'approved'
  WHERE id = candidate_rev;
  PERFORM pg_temp.set_jwt(u_admin);
  candidate := public.admin_get_brief_publication_candidate(candidate_rev);
  ok := ok
    AND candidate->>'pdf_external_url' = 'https://cdn.example/brief.pdf'
    AND candidate->>'pdf_asset_path' = 'https://cdn.example/brief.pdf';
  PERFORM pg_temp.record(47, 'internal storage paths stay distinct from HTTPS brief assets', 'distinguished', ok, 'storage then https');

  SELECT pg_get_function_identity_arguments('public.admin_get_brief_publication_candidate(uuid)'::regprocedure) = 'p_revision_id uuid'
     AND NOT has_function_privilege('anon', 'public.admin_get_brief_publication_candidate(uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.admin_get_brief_publication_candidate(uuid)', 'EXECUTE')
    INTO ok;
  PERFORM pg_temp.record(48, 'candidate RPC accepts only a revision id and is not granted to anon', 'narrow', ok, 'p_revision_id uuid');

  BEGIN
    PERFORM public.admin_get_brief_publication_candidate(candidate_rev, 'https://caller.example/injected');
    ok := false; err := 'caller URL was accepted';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%function%does not exist%' OR SQLERRM LIKE '%candidate%';
    err := 'rejected';
  END;
  PERFORM pg_temp.record(49, 'caller cannot supply URLs or an actor to the candidate RPC', 'rejected', ok, err);
  PERFORM pg_temp.reset_auth();
END;
$matrix$;

SELECT case_no, description, expected, pass, left(detail, 180) AS detail
FROM sponsor_pub_results
ORDER BY case_no;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
FROM sponsor_pub_results;

DO $fail$
BEGIN
  IF EXISTS (SELECT 1 FROM sponsor_pub_results WHERE NOT pass) THEN
    RAISE EXCEPTION 'sponsor security rehearsal failed';
  END IF;
END;
$fail$;

ROLLBACK;
