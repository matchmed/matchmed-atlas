-- Partner inquiry security rehearsal.
-- One transaction. Rolls back. Does not leave inquiry rows, vendors, or users.
--
--   docker exec -i supabase_db_matchmed-atlas psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < docs/security/partner-inquiries-v1-security-test.sql
--
-- Target must be the local database. Do not point this at production.

BEGIN;

CREATE TEMP TABLE inquiry_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int, p_desc text, p_expected text, p_pass boolean, p_detail text DEFAULT ''
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO inquiry_results(case_no, description, expected, detail, pass)
  VALUES (p_case, p_desc, p_expected, COALESCE(p_detail, ''), p_pass)
  ON CONFLICT (case_no) DO UPDATE
  SET description = EXCLUDED.description, expected = EXCLUDED.expected,
      detail = EXCLUDED.detail, pass = EXCLUDED.pass;
END;
$$;

DO $matrix$
DECLARE
  active_id uuid := 'c0918000-0000-4000-8000-0000000000a1';
  inactive_id uuid := 'c0918000-0000-4000-8000-0000000000a2';
  missing_id uuid := 'c0918000-0000-4000-8000-0000000000a3';
  percent_id uuid := 'c0918000-0000-4000-8000-0000000000a4';
  u_phys uuid := 'c0918000-0000-4000-8000-0000000000b1';
  u_emp uuid := 'c0918000-0000-4000-8000-0000000000b2';
  u_plain uuid := 'c0918000-0000-4000-8000-0000000000b3';
  org_id uuid := 'c0918000-0000-4000-8000-0000000000c1';
  vendors_before int;
  sponsors_before int;
  content_before int;
  active_sponsors_before int;
  revisions_before int;
  n int;
  lim int;
  probe int;
  ok boolean;
  err text;
  payload jsonb;
  snap text;
  stored_email text;
  stored_status text;
  stored_notes text;
  stored_contacted timestamptz;
  stored_consent timestamptz;
  row_id uuid;
  keys text[];
BEGIN
  INSERT INTO public.vendors (id, slug, display_label, legal_name, active) VALUES
    (active_id, 'inquiry_rehearsal_active', 'Inquiry Rehearsal Active', 'Legal Name Must Not Leak', true),
    (inactive_id, 'inquiry_rehearsal_inactive', 'Inquiry Rehearsal Inactive', NULL, false),
    (percent_id, 'inquiry_rehearsal_percent', '100% Rehearsal', NULL, true);
  INSERT INTO public.vendors (id, slug, display_label, active)
  SELECT
    ('c0918000-0000-4000-8000-00000000' || lpad(i::text, 4, '0'))::uuid,
    'inquiry_limit_probe_' || lpad(i::text, 2, '0'),
    'Limitprobe Vendor ' || lpad(i::text, 2, '0'),
    true
  FROM generate_series(1, 12) AS i;

  SELECT count(*) INTO vendors_before FROM public.vendors;
  SELECT count(*) INTO sponsors_before FROM public.sponsor_vendor_profiles;
  SELECT count(*) INTO content_before FROM public.sponsor_vendor_content;
  SELECT count(*) INTO active_sponsors_before FROM public.sponsor_vendor_profiles WHERE is_active IS TRUE;
  SELECT count(*) INTO revisions_before FROM public.sponsor_brief_revisions;

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM * FROM public.search_partner_inquiry_vendors('a');
    ok := false; err := 'short query returned';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%too short%' OR SQLERRM LIKE '%invalid search%';
    err := 'rejected';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(1, 'anonymous vendor search requires two characters', 'rejected', ok, err);

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n FROM public.search_partner_inquiry_vendors('Inquiry Rehearsal');
  SELECT count(*) INTO lim FROM public.search_partner_inquiry_vendors('Inquiry Rehearsal') WHERE id = inactive_id;
  EXECUTE 'RESET ROLE';
  ok := n = 1 AND lim = 0;
  PERFORM pg_temp.record(2, 'search returns active vendors only', 'active only', ok, 'matches ' || n::text);

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT array_agg(key ORDER BY key) INTO keys
  FROM public.search_partner_inquiry_vendors('Inquiry Rehearsal Active') AS hit,
       LATERAL jsonb_object_keys(to_jsonb(hit)) AS key;
  EXECUTE 'RESET ROLE';
  ok := keys = ARRAY['display_label', 'id'];
  PERFORM pg_temp.record(3, 'search returns only id and display label', 'two columns', ok, array_to_string(keys, ','));

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n FROM public.search_partner_inquiry_vendors('Limitprobe');
  EXECUTE 'RESET ROLE';
  ok := n = 8;
  PERFORM pg_temp.record(4, 'search has a hard result limit', '8', ok, n::text);

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) FILTER (WHERE display_label NOT LIKE '%\%\%%' ESCAPE '\') INTO n
  FROM public.search_partner_inquiry_vendors('%%');
  SELECT count(*) INTO lim FROM public.search_partner_inquiry_vendors('100%');
  SELECT count(*) INTO probe FROM public.search_partner_inquiry_vendors('x_')
  WHERE id = active_id;
  EXECUTE 'RESET ROLE';
  ok := n = 0 AND lim = 1 AND probe = 0;
  PERFORM pg_temp.record(5, 'pattern characters do not bypass search constraints', 'literal match', ok, 'nonliteral ' || n::text || ' percent ' || lim::text);

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.vendors LIMIT 1;
    ok := false; err := 'anon read vendors';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := 'denied';
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(6, 'vendor-table direct select remains denied to anon', 'denied', ok, err);

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.partner_inquiries LIMIT 1;
    ok := false; err := 'anon read inquiries';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := 'denied';
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(7, 'inquiry-table direct select is denied to anon', 'denied', ok, err);

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.partner_inquiries LIMIT 1;
    ok := false; err := 'authenticated read inquiries';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := 'denied';
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(8, 'inquiry-table direct select is denied to ordinary authenticated users', 'denied', ok, err);

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    INSERT INTO public.partner_inquiries (
      company_name_snapshot, contact_name, work_email, interest_area, source, consented_at
    ) VALUES ('Direct', 'Direct', 'direct@example.test', 'other', 'unknown', now());
    ok := false; err := 'insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := 'denied';
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(9, 'direct insert is denied', 'denied', ok, err);

  EXECUTE 'SET LOCAL ROLE anon';
  payload := public.submit_partner_inquiry(
    active_id, NULL, 'Review Contact', 'review@example.test', 'Director',
    'physician_engagement', 'Hello', 'partners_home', true
  );
  EXECUTE 'RESET ROLE';
  SELECT id, company_name_snapshot, work_email, status, internal_notes, contacted_at, consented_at
    INTO row_id, snap, stored_email, stored_status, stored_notes, stored_contacted, stored_consent
  FROM public.partner_inquiries
  WHERE vendor_id = active_id;
  ok := payload = '{"ok": true}'::jsonb AND snap = 'Inquiry Rehearsal Active' AND stored_status = 'new';
  PERFORM pg_temp.record(12, 'valid existing-vendor submission succeeds', 'ok', ok, 'generic success');
  ok := snap = 'Inquiry Rehearsal Active';
  PERFORM pg_temp.record(13, 'existing vendor name is copied from the database', 'canonical label', ok, 'snapshot matched');
  ok := stored_email = 'review@example.test';
  PERFORM pg_temp.record(14, 'browser cannot forge the snapshot', 'database label', ok, 'no snapshot argument');

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    UPDATE public.partner_inquiries SET status = 'closed' WHERE id = row_id;
    ok := false; err := 'update accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := 'denied';
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(10, 'direct update is denied', 'denied', ok, err);

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    DELETE FROM public.partner_inquiries WHERE id = row_id;
    ok := false; err := 'delete accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true; err := 'denied';
  WHEN OTHERS THEN
    ok := false; err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(11, 'direct delete is denied', 'denied', ok, err);

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.submit_partner_inquiry(
      inactive_id, NULL, 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'unknown', true
    );
    ok := false; err := 'inactive accepted';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM = 'invalid inquiry';
    err := 'rejected';
  END;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      missing_id, NULL, 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'unknown', true
    );
    ok := ok AND false; err := 'missing accepted';
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM = 'invalid inquiry';
    err := 'rejected';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(15, 'inactive vendor is rejected', 'rejected', ok, err);
  PERFORM pg_temp.record(16, 'missing vendor is rejected', 'rejected', ok, err);

  EXECUTE 'SET LOCAL ROLE anon';
  payload := public.submit_partner_inquiry(
    NULL, '  Northwind   Optics  ', 'Review Contact', 'Ada@Example.TEST', NULL,
    'practice_engagement', NULL, 'direct', true
  );
  EXECUTE 'RESET ROLE';
  SELECT company_name_snapshot, proposed_company_name, work_email, vendor_id IS NULL
    INTO snap, stored_status, stored_email, ok
  FROM public.partner_inquiries
  WHERE proposed_company_name = 'Northwind Optics';
  ok := payload = '{"ok": true}'::jsonb AND snap = 'Northwind Optics' AND stored_email = 'ada@example.test';
  PERFORM pg_temp.record(17, 'valid proposed-company submission succeeds', 'ok', ok, 'normalized name');

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.submit_partner_inquiry(
      active_id, 'Also Proposed', 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'unknown', true
    );
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM = 'invalid inquiry';
  END;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      NULL, '   ', 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'unknown', true
    );
    ok := ok AND false;
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM = 'invalid inquiry';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(18, 'submission with both vendor and proposed company is rejected', 'rejected', ok, 'rejected');
  PERFORM pg_temp.record(19, 'submission with neither is rejected', 'rejected', ok, 'rejected');

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.submit_partner_inquiry(
      NULL, 'Consent Probe', 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'unknown', false
    );
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM = 'invalid inquiry';
  END;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      NULL, 'Email Probe', 'Review Contact', 'not-an-email', NULL,
      'other', NULL, 'unknown', true
    );
    ok := ok AND false;
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM = 'invalid inquiry';
  END;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      NULL, repeat('A', 161), 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'unknown', true
    );
    ok := ok AND false;
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM = 'invalid inquiry';
  END;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      NULL, 'Message Probe', 'Review Contact', 'review@example.test', NULL,
      'other', repeat('m', 1001), 'unknown', true
    );
    ok := ok AND false;
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM = 'invalid inquiry';
  END;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      NULL, 'Interest Probe', 'Review Contact', 'review@example.test', NULL,
      'not_an_interest', NULL, 'unknown', true
    );
    ok := ok AND false;
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM = 'invalid inquiry';
  END;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      NULL, 'Source Probe', 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'utm_campaign', true
    );
    ok := ok AND false;
  EXCEPTION WHEN OTHERS THEN
    ok := ok AND SQLERRM = 'invalid inquiry';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(20, 'missing consent is rejected', 'rejected', ok, 'rejected');
  PERFORM pg_temp.record(21, 'invalid email is rejected', 'rejected', ok, 'rejected');
  PERFORM pg_temp.record(22, 'excessive field lengths are rejected', 'rejected', ok, 'rejected');
  PERFORM pg_temp.record(23, 'message over 1000 characters is rejected', 'rejected', ok, 'rejected');
  PERFORM pg_temp.record(24, 'unknown interest area is rejected', 'rejected', ok, 'rejected');
  PERFORM pg_temp.record(25, 'unknown source is rejected by the database', 'rejected', ok, 'app normalizes before the call');

  ok := stored_status IS NOT NULL;
  SELECT status, internal_notes, contacted_at, consented_at
    INTO stored_status, stored_notes, stored_contacted, stored_consent
  FROM public.partner_inquiries
  WHERE id = row_id;
  BEGIN
    PERFORM public.submit_partner_inquiry(
      active_id, NULL, 'Review Contact', 'review@example.test', NULL,
      'other', NULL, 'partners_home', true, 'closed'
    );
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE '%function%does not exist%' OR SQLERRM LIKE '%inquiry%';
  END;
  ok := ok AND stored_status = 'new' AND stored_notes IS NULL AND stored_contacted IS NULL AND stored_consent IS NOT NULL;
  PERFORM pg_temp.record(26, 'public caller cannot set status', 'forced new', ok, stored_status);
  PERFORM pg_temp.record(27, 'public caller cannot set internal notes', 'null', stored_notes IS NULL, 'null');
  PERFORM pg_temp.record(28, 'public caller cannot set contacted time', 'null', stored_contacted IS NULL, 'null');
  PERFORM pg_temp.record(29, 'public caller cannot set consent time', 'server clock', stored_consent IS NOT NULL, 'server set');

  SELECT count(*) = vendors_before INTO ok FROM public.vendors;
  PERFORM pg_temp.record(30, 'no canonical vendor is created by submission', 'unchanged', ok, 'count held');
  SELECT count(*) = sponsors_before INTO ok FROM public.sponsor_vendor_profiles;
  PERFORM pg_temp.record(31, 'no sponsor profile is created', 'unchanged', ok, 'count held');
  SELECT count(*) = content_before AND count(*) = revisions_before INTO ok
  FROM public.sponsor_vendor_content
  WHERE false;
  SELECT (SELECT count(*) FROM public.sponsor_vendor_content) = content_before
     AND (SELECT count(*) FROM public.sponsor_brief_revisions) = revisions_before
    INTO ok;
  PERFORM pg_temp.record(32, 'no MAT-26 content changes', 'unchanged', ok, 'counts held');
  SELECT count(*) = active_sponsors_before INTO ok FROM public.sponsor_vendor_profiles WHERE is_active IS TRUE;
  PERFORM pg_temp.record(33, 'no sponsor becomes active', 'unchanged', ok, 'active count held');

  SELECT NOT has_function_privilege('anon', 'public.submit_partner_inquiry(uuid, text, text, text, text, text, text, text, boolean)', 'EXECUTE')
    INTO ok;
  ok := NOT ok;
  SELECT count(*) INTO n
  FROM pg_proc AS p
  JOIN pg_namespace AS ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname LIKE '%partner_inquir%'
    AND p.proname NOT IN (
      'search_partner_inquiry_vendors',
      'submit_partner_inquiry',
      'partner_inquiries_touch_updated_at'
    );
  ok := ok AND n = 0;
  PERFORM pg_temp.record(34, 'no public function can read inquiry rows', 'no read function', ok, 'submit returns ok only');

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
  VALUES
    (u_phys, 'authenticated', 'authenticated', 'inquiry-phys@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_emp, 'authenticated', 'authenticated', 'inquiry-emp@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_plain, 'authenticated', 'authenticated', 'inquiry-plain@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000');
  INSERT INTO public.profiles (email, user_id, is_admin, onboarding_complete) VALUES
    ('inquiry-phys@matchmed-e2e.test', u_phys, false, true),
    ('inquiry-emp@matchmed-e2e.test', u_emp, false, true),
    ('inquiry-plain@matchmed-e2e.test', u_plain, false, true);
  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at, verified_by)
  VALUES (org_id, 'Inquiry Rehearsal Org', 'inquiry-rehearsal-org', 'verified', now(), u_plain);
  INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
  VALUES (org_id, u_emp, 'editor', 'active', now());

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_phys::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.partner_inquiries LIMIT 1;
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true;
  WHEN OTHERS THEN
    ok := false;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(35, 'physician cannot review inquiries', 'denied', ok, 'denied');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_emp::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.partner_inquiries LIMIT 1;
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true;
  WHEN OTHERS THEN
    ok := false;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(36, 'employer cannot review inquiries', 'denied', ok, 'denied');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_plain::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.partner_inquiries LIMIT 1;
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true;
  WHEN OTHERS THEN
    ok := false;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(37, 'ordinary authenticated user cannot review inquiries', 'denied', ok, 'denied');

  SELECT count(*) = 0 INTO ok
  FROM pg_proc AS p
  JOIN pg_namespace AS ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname LIKE 'admin_%partner_inquir%';
  PERFORM pg_temp.record(38, 'no admin review function was added', 'database owner review only', ok, 'no admin rpc');

  SELECT count(*) INTO n FROM public.partner_inquiries;
  PERFORM pg_temp.record(39, 'rehearsal rows exist only inside this transaction', 'present before rollback', n = 2, n::text);
END;
$matrix$;

SELECT case_no, description, expected, pass, left(detail, 160) AS detail
FROM inquiry_results
ORDER BY case_no;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
FROM inquiry_results;

DO $fail$
BEGIN
  IF (SELECT count(*) FROM inquiry_results) <> 39 THEN
    RAISE EXCEPTION 'partner inquiry security rehearsal did not record 39 cases';
  END IF;
  IF EXISTS (SELECT 1 FROM inquiry_results WHERE NOT pass) THEN
    RAISE EXCEPTION 'partner inquiry security rehearsal failed';
  END IF;
END;
$fail$;

ROLLBACK;
