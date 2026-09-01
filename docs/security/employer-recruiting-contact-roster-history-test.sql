-- Regression: recruiting_contact_name + employer_get_practice_physician_history
-- Run AFTER 20260901000000_employer_recruiting_contact_and_physician_history.sql
-- Entire script runs in a transaction and ROLLBACKs at end.
--
--   psql "$DATABASE_URL" -f docs/security/employer-recruiting-contact-roster-history-test.sql

BEGIN;

CREATE TEMP TABLE roster_history_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE roster_history_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.rh_record(
  p_case int, p_desc text, p_expected text, p_pass boolean, p_detail text DEFAULT ''
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO roster_history_results VALUES (
    p_case, p_desc, p_expected,
    CASE WHEN coalesce(p_pass, false) THEN coalesce(nullif(p_detail, ''), 'ok') ELSE coalesce(nullif(p_detail, ''), 'FAIL') END,
    coalesce(p_pass, false)
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

DO $tests$
DECLARE
  u_editor uuid := 'e2000000-0000-4000-8000-000000000001';
  u_other uuid := 'e2000000-0000-4000-8000-000000000002';
  practice_a uuid := 'c2000000-0000-4000-8000-000000000001';
  practice_b uuid := 'c2000000-0000-4000-8000-000000000002';
  org_id uuid := 'b2000000-0000-4000-8000-000000000001';
  doctor_current uuid := 'd2000000-0000-4000-8000-000000000001';
  doctor_former uuid := 'd2000000-0000-4000-8000-000000000002';
  aff_current uuid := 'f2000000-0000-4000-8000-000000000001';
  aff_former uuid := 'f2000000-0000-4000-8000-000000000002';
  v_json jsonb;
  v_rows int;
  v_status text;
  v_overlay jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
  VALUES
    (u_editor, 'authenticated', 'authenticated', 'rh-editor@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000'),
    (u_other, 'authenticated', 'authenticated', 'rh-other@test.local', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.practices (id, practice_name, city, state, org_pac_id)
  VALUES
    (practice_a, 'Roster History Alpha', 'Boston', 'MA', 'pac-rh-a'),
    (practice_b, 'Roster History Beta', 'Boston', 'MA', 'pac-rh-b')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.doctors (id, physician_name, npi)
  VALUES
    (doctor_current, 'Dr Current One RH Test', '2999999991'),
    (doctor_former, 'Dr Former Two RH Test', '2999999992')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.affiliations (id, practice_id, doctor_id, npi, org_pac_id, status, first_seen_year_at_org, last_seen_year_at_org)
  VALUES
    (aff_current, practice_a, doctor_current, '2999999991', 'pac-rh-a', 'On roster', 2020, 2024),
    (aff_former, practice_a, doctor_former, '2999999992', 'pac-rh-a', 'Not on roster', 2018, 2021)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employer_organizations (id, name, slug, status)
  VALUES (org_id, 'RH Test Org', 'rh-test-org', 'verified')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employer_organization_practices (organization_id, practice_id, relationship, status, approved_by)
  VALUES (org_id, practice_a, 'operates', 'active', u_editor)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
  VALUES (org_id, u_editor, 'editor', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.employer_practice_profiles (practice_id)
  VALUES (practice_a)
  ON CONFLICT (practice_id) DO NOTHING;

  -- H1: authorized editor reads current + former physicians
  PERFORM pg_temp.set_jwt(u_editor);
  v_json := public.employer_get_practice_physician_history(practice_a);
  v_rows := jsonb_array_length(v_json);
  PERFORM pg_temp.rh_record(
    1,
    'authorized editor receives CMS physician history',
    '2 physicians',
    v_rows = 2,
    'count=' || v_rows
  );

  SELECT count(*) INTO v_rows
  FROM jsonb_array_elements(v_json) AS e
  WHERE (e->>'is_current_cms_roster')::boolean = true;
  PERFORM pg_temp.rh_record(
    2,
    'history includes current CMS roster physician',
    '1 current',
    v_rows = 1,
    'current=' || v_rows
  );

  SELECT count(*) INTO v_rows
  FROM jsonb_array_elements(v_json) AS e
  WHERE (e->>'is_current_cms_roster')::boolean = false;
  PERFORM pg_temp.rh_record(
    3,
    'history includes former CMS-observed physician',
    '1 former',
    v_rows = 1,
    'former=' || v_rows
  );

  -- H4: unrelated practice isolation
  v_json := public.employer_get_practice_physician_history(practice_b);
  PERFORM pg_temp.rh_record(
    4,
    'authorized editor cannot read unrelated practice history',
    '[]',
    v_json = '[]'::jsonb,
    v_json::text
  );

  -- H5: unrelated user isolation
  PERFORM pg_temp.set_jwt(u_other);
  v_json := public.employer_get_practice_physician_history(practice_a);
  PERFORM pg_temp.rh_record(
    5,
    'unrelated user receives empty history',
    '[]',
    v_json = '[]'::jsonb,
    v_json::text
  );

  -- H6: affiliations source immutability (RPC is read-only)
  PERFORM pg_temp.reset_auth();
  SELECT status INTO v_status FROM public.affiliations WHERE id = aff_former;
  PERFORM pg_temp.set_jwt(u_editor);
  PERFORM public.employer_get_practice_physician_history(practice_a);
  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.rh_record(
    6,
    'physician history RPC does not mutate affiliations',
    'unchanged',
    (SELECT status FROM public.affiliations WHERE id = aff_former) IS NOT DISTINCT FROM v_status,
    'status=' || coalesce(v_status, 'null')
  );

  -- H7: recruiting_contact_name profile roundtrip
  PERFORM pg_temp.set_jwt(u_editor);
  UPDATE public.employer_practice_profiles
  SET recruiting_contact_name = 'Jane Recruiter'
  WHERE practice_id = practice_a;
  PERFORM pg_temp.rh_record(
    7,
    'editor can set recruiting_contact_name',
    'Jane Recruiter',
    (SELECT recruiting_contact_name FROM public.employer_practice_profiles WHERE practice_id = practice_a) = 'Jane Recruiter',
    (SELECT recruiting_contact_name FROM public.employer_practice_profiles WHERE practice_id = practice_a)
  );

  UPDATE public.employer_practice_profiles
  SET recruiting_contact_name = '   '
  WHERE practice_id = practice_a;
  PERFORM pg_temp.rh_record(
    10,
    'blank recruiting_contact_name normalizes to NULL',
    'NULL',
    (SELECT recruiting_contact_name FROM public.employer_practice_profiles WHERE practice_id = practice_a) IS NULL,
    coalesce((SELECT recruiting_contact_name FROM public.employer_practice_profiles WHERE practice_id = practice_a)::text, 'null')
  );

  UPDATE public.employer_practice_profiles
  SET recruiting_contact_name = 'Jane Recruiter'
  WHERE practice_id = practice_a;

  -- H8: overlay exposes recruiting_contact_name when visible
  PERFORM pg_temp.reset_auth();
  v_overlay := public.public_get_employer_practice_overlay(practice_a);
  PERFORM pg_temp.rh_record(
    8,
    'public overlay includes recruiting_contact_name',
    'Jane Recruiter',
    v_overlay #>> '{profile,recruiting_contact_name}' = 'Jane Recruiter',
    coalesce(v_overlay #>> '{profile,recruiting_contact_name}', 'null')
  );

  -- H9: history rows include affiliation_id for assertion linkage
  PERFORM pg_temp.set_jwt(u_editor);
  SELECT count(*) INTO v_rows
  FROM jsonb_array_elements(public.employer_get_practice_physician_history(practice_a)) AS e
  WHERE e ? 'affiliation_id' AND e ? 'doctor_id' AND e->>'source' = 'cms';
  PERFORM pg_temp.rh_record(
    9,
    'history rows expose affiliation_id and provenance',
    '2 rows',
    v_rows = 2,
    'rows=' || v_rows
  );
END;
$tests$;

SELECT case_no, pass, description, expected, detail
FROM roster_history_results
ORDER BY case_no;

DO $assert$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM roster_history_results WHERE NOT pass;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'employer recruiting/roster history regression failed: % case(s)', v_fail;
  END IF;
END;
$assert$;

ROLLBACK;
