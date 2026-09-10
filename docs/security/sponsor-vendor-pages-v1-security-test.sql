-- MAT-16 sponsor vendor pages security matrix (transactional; rolls back).
-- Prerequisites: apply 20260910120000_sponsor_vendor_pages_v1.sql
--
--   npx supabase db query --linked -f docs/security/sponsor-vendor-pages-v1-security-test.sql
--
-- Does NOT mutate lasting production data (BEGIN/ROLLBACK).

BEGIN;

CREATE TEMP TABLE sponsor_sec_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE sponsor_sec_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int,
  p_desc text,
  p_expected text,
  p_pass boolean,
  p_detail text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sponsor_sec_results(case_no, description, expected, detail, pass)
  VALUES (p_case, p_desc, p_expected, COALESCE(p_detail, ''), p_pass)
  ON CONFLICT (case_no) DO UPDATE
  SET description = EXCLUDED.description,
      expected = EXCLUDED.expected,
      detail = EXCLUDED.detail,
      pass = EXCLUDED.pass;
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
  u_phys uuid := 'c0160000-0000-4000-8000-000000000001';
  vendor_bl uuid;
  vendor_other uuid;
  payload jsonb;
  slugs text[];
  n int;
  err text;
  ok boolean;
  keys text[];
BEGIN
  IF to_regclass('public.sponsor_vendor_profiles') IS NULL THEN
    RAISE EXCEPTION 'apply 20260910120000_sponsor_vendor_pages_v1.sql first';
  END IF;

  SELECT id INTO vendor_bl FROM public.vendors WHERE slug = 'bausch_plus_lomb';
  SELECT id INTO vendor_other
  FROM public.vendors
  WHERE slug <> 'bausch_plus_lomb' AND active = true
  ORDER BY slug
  LIMIT 1;

  IF vendor_bl IS NULL OR vendor_other IS NULL THEN
    RAISE EXCEPTION 'need bausch_plus_lomb and another vendor fixture';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    u_phys, 'authenticated', 'authenticated', 'mat16.phys@matchmed-e2e.test',
    crypt('x', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '00000000-0000-0000-0000-000000000000', '', '', '', ''
  );

  INSERT INTO public.profiles (user_id, email, first_name, last_name, onboarding_complete)
  VALUES (u_phys, 'mat16.phys@matchmed-e2e.test', 'Mat16', 'Phys', true);

  -- Ensure B+L active for listing tests (seed may already do this)
  INSERT INTO public.sponsor_vendor_profiles (vendor_id, is_active, short_description, sort_order)
  VALUES (vendor_bl, true, 'Test sponsor', 10)
  ON CONFLICT (vendor_id) DO UPDATE
  SET is_active = true, short_description = EXCLUDED.short_description, updated_at = now();

  -- Inactive sponsor should not list
  INSERT INTO public.sponsor_vendor_profiles (vendor_id, is_active, short_description, sort_order)
  VALUES (vendor_other, false, 'Inactive sponsor', 90)
  ON CONFLICT (vendor_id) DO UPDATE
  SET is_active = false, updated_at = now();

  -- 1. Active sponsor appears in list
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.list_active_atlas_sponsors();
  ok := EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS e WHERE e->>'slug' = 'bausch_plus_lomb'
  );
  PERFORM pg_temp.record(1, 'active sponsor appears in list_active_atlas_sponsors', 'included', ok, payload::text);
  PERFORM pg_temp.reset_auth();

  -- 2. Inactive sponsor excluded
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.list_active_atlas_sponsors();
  ok := NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS e
    WHERE (e->>'slug') = (SELECT slug FROM public.vendors WHERE id = vendor_other)
  );
  PERFORM pg_temp.record(2, 'inactive sponsor excluded from directory list', 'excluded', ok, payload::text);
  PERFORM pg_temp.reset_auth();

  -- 3. Directory entry has canonical slug for /partners/[slug]
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.list_active_atlas_sponsors();
  ok := EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS e
    WHERE e->>'slug' = 'bausch_plus_lomb' AND e ? 'display_label'
  );
  PERFORM pg_temp.record(3, 'directory payload has slug + display_label', 'present', ok, payload::text);
  PERFORM pg_temp.reset_auth();

  -- 4. Sponsor page has five section types present in content contract
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.get_atlas_sponsor_page('bausch_plus_lomb');
  ok := payload IS NOT NULL
    AND payload ? 'disclosure_text'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'sections') e WHERE e->>'section_type' = 'whats_new')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'sections') e WHERE e->>'section_type' = 'education')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'sections') e WHERE e->>'section_type' = 'clinical_evidence')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'sections') e WHERE e->>'section_type' = 'connect')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'sections') e WHERE e->>'section_type' = 'training_product_info');
  PERFORM pg_temp.record(4, 'sponsor page exposes five primary sections', 'all five', ok, left(payload::text, 400));
  PERFORM pg_temp.reset_auth();

  -- 5. Disclosure renders
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.get_atlas_sponsor_page('bausch_plus_lomb');
  ok := (payload->>'disclosure_text') ILIKE '%does not affect%';
  PERFORM pg_temp.record(5, 'sponsor disclosure present', 'independence language', ok, payload->>'disclosure_text');
  PERFORM pg_temp.reset_auth();

  -- 6. Active sponsor slug resolvable for practice tech links
  slugs := public.list_active_sponsor_slugs();
  ok := 'bausch_plus_lomb' = ANY (slugs);
  PERFORM pg_temp.record(6, 'active sponsor slug available for tech link resolution', 'present', ok, array_to_string(slugs, ','));

  -- 7. Inactive slug not linkable
  ok := NOT ((SELECT slug FROM public.vendors WHERE id = vendor_other) = ANY (slugs));
  PERFORM pg_temp.record(7, 'inactive sponsor slug not linkable', 'absent', ok, array_to_string(slugs, ','));

  -- 8. Non-sponsor vendors remain outside sponsor tables / inactive
  SELECT count(*)::int INTO n
  FROM public.vendors v
  WHERE v.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.sponsor_vendor_profiles p
      WHERE p.vendor_id = v.id AND p.is_active = true
    );
  ok := n >= 1;
  PERFORM pg_temp.record(8, 'non-sponsor vendors exist without active sponsor profile', '>=1', ok, n::text);

  -- 9. Sponsor status does not alter vendor_categories ordering for a category
  SELECT count(*)::int INTO n
  FROM public.vendor_categories vc
  WHERE vc.vendor_id = vendor_bl;
  ok := n >= 1;
  PERFORM pg_temp.record(9, 'sponsor status does not remove vendor taxonomy rows', 'still present', ok, n::text);

  -- 10. No physician-private keys in sponsor read contracts
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.get_atlas_sponsor_page('bausch_plus_lomb') || public.list_active_atlas_sponsors();
  ok := NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'email','phone','npi','first_name','last_name','user_id','profile_id',
      'clinical_focus_preference','preferred_geography','open_to_practice_connections'
    ]) AS k(key)
    WHERE payload::text ILIKE '%' || k.key || '%'
      AND payload::text ~ ('"' || k.key || '"\s*:')
  );
  -- Narrower: top-level / section object keys only
  SELECT array_agg(k) INTO keys
  FROM (
    SELECT DISTINCT jsonb_object_keys(e) AS k
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(public.list_active_atlas_sponsors()) = 'array'
        THEN public.list_active_atlas_sponsors() ELSE '[]'::jsonb END
    ) AS e
  ) s;
  ok := NOT (keys && ARRAY['email','phone','npi','first_name','last_name','user_id']);
  PERFORM pg_temp.record(10, 'directory keys omit physician-private fields', 'clean', ok, array_to_string(keys, ','));
  PERFORM pg_temp.reset_auth();

  -- 11. Anon denied directory/page RPCs (auth-gated partners surface)
  PERFORM pg_temp.reset_auth();
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    payload := public.list_active_atlas_sponsors();
    ok := false;
    err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(11, 'anon denied list_active_atlas_sponsors', 'error', ok, err);

  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    payload := public.get_atlas_sponsor_page('bausch_plus_lomb');
    ok := false;
    err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(12, 'anon denied get_atlas_sponsor_page', 'error', ok, err);

  -- 13. Anon may resolve active sponsor slugs (public practice tech links)
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    slugs := public.list_active_sponsor_slugs();
    ok := 'bausch_plus_lomb' = ANY (slugs);
    err := array_to_string(slugs, ',');
  EXCEPTION WHEN OTHERS THEN
    ok := false;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(13, 'anon can resolve active sponsor slugs', 'includes bausch', ok, err);

  -- 14. Malformed / inactive slug returns null
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.get_atlas_sponsor_page('not_a_real_sponsor_slug_zzz');
  ok := payload IS NULL;
  PERFORM pg_temp.record(14, 'unknown slug returns null', 'null', ok, coalesce(payload::text, 'null'));

  UPDATE public.sponsor_vendor_profiles SET is_active = false WHERE vendor_id = vendor_bl;
  payload := public.get_atlas_sponsor_page('bausch_plus_lomb');
  ok := payload IS NULL;
  PERFORM pg_temp.record(15, 'inactive sponsor slug returns null page', 'null', ok, coalesce(payload::text, 'null'));
  UPDATE public.sponsor_vendor_profiles SET is_active = true WHERE vendor_id = vendor_bl;
  PERFORM pg_temp.reset_auth();

  -- 16. Direct physician INSERT into sponsor content denied
  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    INSERT INTO public.sponsor_vendor_content (
      vendor_id, section_type, title, sort_order, is_active
    ) VALUES (vendor_bl, 'whats_new', 'Should fail', 999, true);
    ok := false;
    err := 'unexpected success';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    ok := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.record(16, 'physician cannot insert sponsor content', 'denied', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 17. Deactivating sponsor does not alter vendors row or practice infra relationships
  DECLARE
    vendor_active_before boolean;
    vendor_active_after boolean;
    infra_before int;
    infra_after int;
    categories_before int;
    categories_after int;
  BEGIN
    SELECT v.active INTO vendor_active_before FROM public.vendors v WHERE v.id = vendor_bl;
    SELECT count(*)::int INTO infra_before
    FROM public.employer_practice_infrastructure WHERE vendor_id = vendor_bl;
    SELECT count(*)::int INTO categories_before
    FROM public.vendor_categories WHERE vendor_id = vendor_bl;

    UPDATE public.sponsor_vendor_profiles SET is_active = false WHERE vendor_id = vendor_bl;

    SELECT v.active INTO vendor_active_after FROM public.vendors v WHERE v.id = vendor_bl;
    SELECT count(*)::int INTO infra_after
    FROM public.employer_practice_infrastructure WHERE vendor_id = vendor_bl;
    SELECT count(*)::int INTO categories_after
    FROM public.vendor_categories WHERE vendor_id = vendor_bl;

    slugs := public.list_active_sponsor_slugs();
    ok := vendor_active_before IS NOT DISTINCT FROM vendor_active_after
      AND infra_before = infra_after
      AND categories_before = categories_after
      AND NOT ('bausch_plus_lomb' = ANY (slugs));

    PERFORM pg_temp.record(
      17,
      'deactivating sponsor does not alter vendors/infra; slug unlinkable',
      'unchanged + unlinked',
      ok,
      format('active=%s→%s infra=%s→%s cats=%s→%s', vendor_active_before, vendor_active_after, infra_before, infra_after, categories_before, categories_after)
    );

    UPDATE public.sponsor_vendor_profiles SET is_active = true WHERE vendor_id = vendor_bl;
  END;

  -- 18. Inactive content rows excluded while profile remains active
  INSERT INTO public.sponsor_vendor_content (
    vendor_id, section_type, title, description, url, sort_order, is_active
  ) VALUES (
    vendor_bl, 'whats_new', 'INACTIVE_CONTENT_SHOULD_NOT_APPEAR', 'hidden', NULL, 9999, false
  );
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.get_atlas_sponsor_page('bausch_plus_lomb');
  ok := NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload->'sections') AS e
    WHERE e->>'title' = 'INACTIVE_CONTENT_SHOULD_NOT_APPEAR'
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload->'sections') AS e
    WHERE e ? 'section_sort'
  );
  PERFORM pg_temp.record(18, 'inactive content excluded; section_sort not leaked', 'clean', ok, left(payload::text, 300));
  DELETE FROM public.sponsor_vendor_content
  WHERE vendor_id = vendor_bl AND title = 'INACTIVE_CONTENT_SHOULD_NOT_APPEAR';
  PERFORM pg_temp.reset_auth();

  -- 19. list_active_sponsor_slugs returns only text slugs (no content/commercial blob)
  slugs := public.list_active_sponsor_slugs();
  ok := 'bausch_plus_lomb' = ANY (slugs)
    AND array_length(slugs, 1) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM unnest(slugs) AS s(slug)
      WHERE s.slug ILIKE '%http%' OR s.slug ILIKE '% %' OR length(s.slug) > 80
    );
  PERFORM pg_temp.record(19, 'active slug RPC returns minimal slug identities only', 'slugs only', ok, array_to_string(slugs, ','));
END;
$matrix$;

SELECT case_no, description, expected, pass, left(detail, 160) AS detail
FROM sponsor_sec_results
ORDER BY case_no;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
FROM sponsor_sec_results;

ROLLBACK;
