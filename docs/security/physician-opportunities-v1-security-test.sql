-- MAT-12 physician Opportunities security matrix (transactional; rolls back).
-- Prerequisites: apply 20260909100000_physician_opportunities_v1.sql
--
--   npx supabase db query --linked -f docs/security/physician-opportunities-v1-security-test.sql
--
-- Does NOT mutate lasting production data (BEGIN/ROLLBACK).

BEGIN;

CREATE TEMP TABLE opp_sec_results (
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
  INSERT INTO opp_sec_results(case_no, description, expected, detail, pass)
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
  u_phys uuid := 'c0120000-0000-4000-8000-000000000001';
  u_incomplete uuid := 'c0120000-0000-4000-8000-000000000002';
  practice_ready uuid;
  practice_unready uuid;
  opp_ready uuid;
  opp_unready uuid;
  payload jsonb;
  n int;
  err text;
  ok boolean;
  overlay jsonb;
BEGIN
  -- Prefer real physician-ready practices when present.
  SELECT epp.practice_id INTO practice_ready
  FROM public.employer_practice_profiles AS epp
  WHERE epp.physician_ready_at IS NOT NULL
    AND public.employer_overlay_publicly_visible(epp.practice_id)
    AND EXISTS (
      SELECT 1 FROM public.employer_practice_recruiting_opportunities o
      WHERE o.practice_id = epp.practice_id
    )
  ORDER BY epp.practice_id
  LIMIT 1;

  SELECT p.id INTO practice_unready
  FROM public.practices AS p
  WHERE NOT EXISTS (
      SELECT 1 FROM public.employer_practice_profiles epp
      WHERE epp.practice_id = p.id AND epp.physician_ready_at IS NOT NULL
    )
  ORDER BY p.id
  LIMIT 1;

  IF practice_ready IS NULL THEN
    PERFORM pg_temp.record(0, 'fixture physician-ready practice with opportunities', 'present', false, 'none found');
    RAISE EXCEPTION 'MAT-12 security test requires at least one physician-ready practice with opportunities';
  END IF;

  SELECT o.id INTO opp_ready
  FROM public.employer_practice_recruiting_opportunities AS o
  WHERE o.practice_id = practice_ready
  ORDER BY o.id
  LIMIT 1;

  -- Disposable auth users + profiles
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES
    (u_phys, 'authenticated', 'authenticated', 'opp.phys@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
     '00000000-0000-0000-0000-000000000000', '', '', '', ''),
    (u_incomplete, 'authenticated', 'authenticated', 'opp.incomplete@matchmed-e2e.test', crypt('x', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
     '00000000-0000-0000-0000-000000000000', '', '', '', '');

  INSERT INTO public.profiles (user_id, email, first_name, last_name, onboarding_complete)
  VALUES
    (u_phys, 'opp.phys@matchmed-e2e.test', 'Opp', 'Phys', true),
    (u_incomplete, 'opp.incomplete@matchmed-e2e.test', 'Opp', 'Inc', false);

  -- 1. Ready opportunity appears for authorized physician
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.list_physician_opportunities(500, 0, NULL, NULL, NULL);
  ok := EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS e
    WHERE (e->>'id')::uuid = opp_ready
  );
  PERFORM pg_temp.record(1, 'physician-ready opportunity appears in list', 'included', ok, payload::text);
  PERFORM pg_temp.reset_auth();

  -- 2. Pre-ready opportunities do not appear (insert temp unready row if possible)
  IF practice_unready IS NOT NULL THEN
    INSERT INTO public.employer_practice_profiles (practice_id)
    VALUES (practice_unready)
    ON CONFLICT (practice_id) DO NOTHING;

    INSERT INTO public.employer_practice_recruiting_opportunities (
      practice_id, clinical_focus, hiring_horizon,
      base_compensation_min_usd, base_compensation_max_usd, base_compensation_max_is_open_ended,
      productivity_structure_available, signing_bonus_available, relocation_assistance_available
    ) VALUES (
      practice_unready,
      'Glaucoma (medical and/or surgical)',
      'now',
      100000, 200000, false,
      false, false, false
    )
    ON CONFLICT (practice_id, clinical_focus) DO UPDATE
    SET hiring_horizon = EXCLUDED.hiring_horizon
    RETURNING id INTO opp_unready;

    IF opp_unready IS NULL THEN
      SELECT id INTO opp_unready
      FROM public.employer_practice_recruiting_opportunities
      WHERE practice_id = practice_unready
        AND clinical_focus = 'Glaucoma (medical and/or surgical)';
    END IF;

    -- Ensure not physician-ready
    UPDATE public.employer_practice_profiles
    SET physician_ready_at = NULL, physician_ready_by = NULL
    WHERE practice_id = practice_unready;

    PERFORM pg_temp.set_jwt(u_phys);
    payload := public.list_physician_opportunities(500, 0, NULL, NULL, NULL);
    ok := NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload) AS e
      WHERE (e->>'id')::uuid = opp_unready
    );
    PERFORM pg_temp.record(2, 'pre-ready opportunity hidden from list', 'excluded', ok, COALESCE(opp_unready::text, 'n/a'));
    PERFORM pg_temp.reset_auth();
  ELSE
    PERFORM pg_temp.record(2, 'pre-ready opportunity hidden from list', 'excluded', true, 'skipped — no unready practice');
  END IF;

  -- 3. hiring_now comes from hiring_horizon=now (no employer_leads dependency in returned flag)
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.list_physician_opportunities_for_practice(practice_ready);
  ok := NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS e
    WHERE (e->>'hiring_horizon') = 'now' AND (e->>'hiring_now') IS DISTINCT FROM 'true'
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS e
    WHERE (e->>'hiring_horizon') IS DISTINCT FROM 'now' AND (e->>'hiring_now') = 'true'
  );
  PERFORM pg_temp.record(3, 'hiring_now mirrors hiring_horizon=now', 'aligned', ok, payload::text);
  PERFORM pg_temp.reset_auth();

  -- 4. Specialty filter
  PERFORM pg_temp.set_jwt(u_phys);
  SELECT clinical_focus INTO err
  FROM public.employer_practice_recruiting_opportunities WHERE id = opp_ready;
  payload := public.list_physician_opportunities(500, 0, err, NULL, NULL);
  ok := (
    SELECT bool_and((e->>'clinical_focus') = err)
    FROM jsonb_array_elements(payload) AS e
  );
  PERFORM pg_temp.record(4, 'clinical_focus filter', 'exact match only', COALESCE(ok, true) AND jsonb_array_length(payload) >= 1, payload::text);
  PERFORM pg_temp.reset_auth();

  -- 5. State filter via practice geography
  PERFORM pg_temp.set_jwt(u_phys);
  SELECT (public._physician_opportunity_practice_states(practice_ready))[1] INTO err;
  IF err IS NOT NULL THEN
    payload := public.list_physician_opportunities(500, 0, NULL, err, NULL);
    ok := EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload) AS e
      WHERE (e->>'practice_id')::uuid = practice_ready
    );
    PERFORM pg_temp.record(5, 'state filter via practice geography', 'includes practice', ok, err);
  ELSE
    PERFORM pg_temp.record(5, 'state filter via practice geography', 'includes practice', true, 'skipped — no states');
  END IF;
  PERFORM pg_temp.reset_auth();

  -- 6. Hiring horizon filter
  PERFORM pg_temp.set_jwt(u_phys);
  SELECT hiring_horizon INTO err
  FROM public.employer_practice_recruiting_opportunities WHERE id = opp_ready;
  payload := public.list_physician_opportunities(500, 0, NULL, NULL, err);
  ok := (
    SELECT bool_and((e->>'hiring_horizon') = err)
    FROM jsonb_array_elements(payload) AS e
  );
  PERFORM pg_temp.record(6, 'hiring_horizon filter', 'exact match only', COALESCE(ok, true), payload::text);
  PERFORM pg_temp.reset_auth();

  -- 7. Default horizon ordering
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.list_physician_opportunities(500, 0, NULL, NULL, NULL);
  ok := (
    SELECT bool_and(prev_rank <= curr_rank)
    FROM (
      SELECT
        (e->>'horizon_rank')::int AS curr_rank,
        lag((e->>'horizon_rank')::int) OVER () AS prev_rank
      FROM jsonb_array_elements(payload) AS e
    ) AS ranks
    WHERE prev_rank IS NOT NULL
  );
  PERFORM pg_temp.record(7, 'default horizon ordering', 'nondecreasing horizon_rank', COALESCE(ok, true), 'ok');
  PERFORM pg_temp.reset_auth();

  -- 8. Overlay hiring_now independent of employer_leads
  overlay := public.public_get_employer_practice_overlay(practice_ready);
  ok := overlay->>'physician_ready' = 'true'
    AND overlay->'recruiting_outlook' ? 'opportunities'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(overlay->'recruiting_outlook'->'opportunities') AS e
      WHERE e ? 'id'
    );
  PERFORM pg_temp.record(8, 'overlay exposes opportunity id', 'id present', ok, overlay::text);

  ok := NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(overlay->'recruiting_outlook'->'opportunities') AS e
    WHERE (e->>'hiring_horizon') = 'now' AND (e->>'actively_recruiting_now') IS DISTINCT FROM 'true'
  );
  PERFORM pg_temp.record(9, 'overlay actively_recruiting_now = horizon now', 'aligned', ok, 'ok');

  -- 10. Incomplete onboarding denied
  PERFORM pg_temp.set_jwt(u_incomplete);
  BEGIN
    payload := public.list_physician_opportunities(10, 0, NULL, NULL, NULL);
    ok := false;
    err := 'unexpected success';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    ok := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.record(10, 'incomplete onboarding denied list', '42501/error', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 11. Anon denied
  PERFORM pg_temp.reset_auth();
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    payload := public.list_physician_opportunities(10, 0, NULL, NULL, NULL);
    ok := false;
    err := 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    ok := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(11, 'anon denied list', 'error', ok, err);

  -- 12. No contact PII keys in list payload
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.list_physician_opportunities(50, 0, NULL, NULL, NULL);
  ok := NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(payload) AS e,
         unnest(ARRAY['recruiting_email','recruiting_phone','recruiting_contact_name','email','phone','npi','first_name','last_name']) AS k(key)
    WHERE e ? k.key
  );
  PERFORM pg_temp.record(12, 'list payload omits contact/PII keys', 'clean', ok, 'ok');
  PERFORM pg_temp.reset_auth();

  -- 13. count matches list under same filters
  PERFORM pg_temp.set_jwt(u_phys);
  n := public.count_physician_opportunities(NULL, NULL, NULL);
  payload := public.list_physician_opportunities(500, 0, NULL, NULL, NULL);
  ok := n = jsonb_array_length(payload);
  PERFORM pg_temp.record(13, 'count matches unfiltered list length (<=500)', 'equal', ok, format('count=%s len=%s', n, jsonb_array_length(payload)));
  PERFORM pg_temp.reset_auth();

  -- 14. legacy employer_leads RPCs still callable (unchanged surface)
  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    payload := public.list_physician_jobs(5, 0);
    ok := jsonb_typeof(payload) = 'array';
    err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    ok := false;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.record(14, 'legacy list_physician_jobs still works', 'array', ok, err);
  PERFORM pg_temp.reset_auth();

  -- 15. Inactive/deactivated practice link excludes Opportunity from list/count/for-practice
  DECLARE
    link_id uuid;
    visible_before boolean;
    n_before int;
    n_after int;
    n_from_practice int;
    for_practice_before jsonb;
    for_practice_after jsonb;
  BEGIN
    SELECT l.id INTO link_id
    FROM public.employer_organization_practices AS l
    WHERE l.practice_id = practice_ready
      AND l.relationship = 'operates'
      AND l.status = 'active'
    ORDER BY l.id
    LIMIT 1;

    IF link_id IS NULL THEN
      PERFORM pg_temp.record(
        15,
        'inactive operates link excludes opportunity',
        'active operates link present',
        false,
        'no active operates link for practice_ready'
      );
    ELSE
      PERFORM pg_temp.set_jwt(u_phys);
      payload := public.list_physician_opportunities(500, 0, NULL, NULL, NULL);
      visible_before := EXISTS (
        SELECT 1 FROM jsonb_array_elements(payload) AS e
        WHERE (e->>'id')::uuid = opp_ready
      );
      n_before := public.count_physician_opportunities(NULL, NULL, NULL);
      for_practice_before := public.list_physician_opportunities_for_practice(practice_ready);
      n_from_practice := jsonb_array_length(for_practice_before);
      PERFORM pg_temp.reset_auth();

      -- Deactivate within this transaction only (ROLLBACK restores).
      UPDATE public.employer_organization_practices
      SET status = 'inactive', updated_at = now()
      WHERE id = link_id;

      PERFORM pg_temp.set_jwt(u_phys);
      payload := public.list_physician_opportunities(500, 0, NULL, NULL, NULL);
      n_after := public.count_physician_opportunities(NULL, NULL, NULL);
      for_practice_after := public.list_physician_opportunities_for_practice(practice_ready);
      ok := visible_before
        AND n_from_practice > 0
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(payload) AS e
          WHERE (e->>'practice_id')::uuid = practice_ready
        )
        AND n_after = n_before - n_from_practice
        AND jsonb_typeof(for_practice_after) = 'array'
        AND jsonb_array_length(for_practice_after) = 0;
      err := format(
        'before_visible=%s n_from_practice=%s n_before=%s n_after=%s for_practice_after=%s',
        visible_before,
        n_from_practice,
        n_before,
        n_after,
        jsonb_array_length(for_practice_after)
      );
      PERFORM pg_temp.record(
        15,
        'inactive operates link excludes opportunity from list/count/for-practice',
        'hidden after deactivate',
        ok,
        err
      );
      PERFORM pg_temp.reset_auth();
    END IF;
  END;

  -- 16. Direct base-table SELECT denied / empty for normal physician (RLS)
  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    SELECT count(*)::int INTO n
    FROM public.employer_practice_recruiting_opportunities;
    -- Physician is not an employer editor; RLS must yield zero readable rows.
    ok := n = 0;
    err := format('row_count=%s', n);
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    ok := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.record(
    16,
    'physician direct SELECT on recruiting_opportunities denied/empty',
    '0 rows or error',
    ok,
    err
  );
  PERFORM pg_temp.reset_auth();
END;
$matrix$;

SELECT case_no, description, expected, pass, left(detail, 160) AS detail
FROM opp_sec_results
ORDER BY case_no;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
FROM opp_sec_results;

ROLLBACK;
