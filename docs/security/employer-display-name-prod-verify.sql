-- Production verification for 20260831000000 — ROLLBACK at end (no lasting writes).
BEGIN;

CREATE TEMP TABLE dn_prod_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  pass boolean NOT NULL,
  detail text NOT NULL
);
GRANT ALL ON TABLE dn_prod_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.dn_record(
  p_case int, p_desc text, p_pass boolean, p_detail text DEFAULT ''
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO dn_prod_results VALUES (
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
  u_admin uuid := '4e60adf9-4528-467e-822f-4880dbd121ff';
  u_owner uuid := 'eb19fc46-afad-4f08-9ec3-dda1406e0f9b';
  u_other uuid := '6d87523f-230b-4df9-aa29-bdf5f957d032';
  v_practice_id uuid := 'fd0fb34e-e145-4ac3-add3-071f6bc532ee';
  cms_name text;
  cms_after text;
  proposed text;
  public_name text;
  overlay jsonb;
  v_err text;
  v_rows int;
BEGIN
  SELECT practice_name INTO cms_name FROM public.practices WHERE id = v_practice_id;

  -- Ensure profile row exists for practice
  INSERT INTO public.employer_practice_profiles (practice_id)
  VALUES (v_practice_id)
  ON CONFLICT (practice_id) DO NOTHING;

  -- Snapshot prior privileged fields so we can reason about rollback
  -- V1: unrelated cannot propose
  BEGIN
    PERFORM pg_temp.set_jwt(u_other);
    PERFORM public.propose_employer_display_name(v_practice_id, 'Unauthorized Prod Name');
    PERFORM pg_temp.dn_record(1, 'unrelated user cannot propose', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.dn_record(1, 'unrelated user cannot propose', true, v_err);
  END;

  -- V2: employer can propose
  PERFORM pg_temp.set_jwt(u_owner);
  PERFORM public.propose_employer_display_name(v_practice_id, 'Prod Verify Friendly Name');
  SELECT proposed_display_name, public_display_name
  INTO proposed, public_name
  FROM public.employer_practice_profiles
  WHERE employer_practice_profiles.practice_id = v_practice_id;
  PERFORM pg_temp.dn_record(
    2, 'employer can propose pending name',
    proposed = 'Prod Verify Friendly Name' AND (public_name IS NULL OR public_name IS DISTINCT FROM proposed),
    'proposed=' || coalesce(proposed,'null') || ' public=' || coalesce(public_name,'null')
  );

  -- V3: cannot directly set public_display_name
  BEGIN
    UPDATE public.employer_practice_profiles
    SET public_display_name = 'Hacked Direct Name'
    WHERE employer_practice_profiles.practice_id = v_practice_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    SELECT public_display_name INTO public_name
    FROM public.employer_practice_profiles
    WHERE employer_practice_profiles.practice_id = v_practice_id;
    PERFORM pg_temp.dn_record(
      3, 'employer cannot directly set public_display_name',
      v_rows = 0 OR public_name IS DISTINCT FROM 'Hacked Direct Name',
      'rows=' || v_rows || ' public=' || coalesce(public_name,'null')
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.dn_record(3, 'employer cannot directly set public_display_name', true, v_err);
  END;

  -- V4: overlay does not expose pending proposal
  overlay := public.public_get_employer_practice_overlay(v_practice_id);
  PERFORM pg_temp.dn_record(
    4, 'pending proposal not in public overlay',
    (overlay->'profile'->>'public_display_name') IS DISTINCT FROM 'Prod Verify Friendly Name'
      AND (overlay::text NOT LIKE '%Prod Verify Friendly Name%'),
    coalesce(overlay->'profile'->>'public_display_name', 'null')
  );

  -- V5: initial review completes with pending proposal
  PERFORM public.complete_employer_initial_review(v_practice_id);
  PERFORM pg_temp.dn_record(
    5, 'initial review completes with pending proposal',
    (SELECT initial_review_completed_at IS NOT NULL FROM public.employer_practice_profiles WHERE practice_id = v_practice_id),
    'ok'
  );

  -- V6: admin approve promotes name
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.approve_employer_display_name(v_practice_id);
  overlay := public.public_get_employer_practice_overlay(v_practice_id);
  PERFORM pg_temp.dn_record(
    6, 'admin approve promotes proposed name',
    overlay->'profile'->>'public_display_name' = 'Prod Verify Friendly Name',
    overlay->'profile'->>'public_display_name'
  );

  -- V7: reject preserves approved public name
  PERFORM pg_temp.set_jwt(u_owner);
  PERFORM public.propose_employer_display_name(v_practice_id, 'Prod Verify Rejected Name');
  PERFORM pg_temp.set_jwt(u_admin);
  PERFORM public.reject_employer_display_name(v_practice_id, 'prod verify rejection');
  PERFORM pg_temp.dn_record(
    7, 'admin reject preserves approved public name',
    (SELECT proposed_display_name IS NULL
            AND public_display_name = 'Prod Verify Friendly Name'
            AND display_name_rejection_reason = 'prod verify rejection'
     FROM public.employer_practice_profiles WHERE practice_id = v_practice_id),
    'ok'
  );

  -- V8: CMS practice_name unchanged throughout
  PERFORM pg_temp.reset_auth();
  SELECT practice_name INTO cms_after FROM public.practices WHERE id = v_practice_id;
  PERFORM pg_temp.dn_record(
    8, 'CMS practice_name unchanged throughout',
    cms_after = cms_name AND cms_name = '11 BEHAVIORAL HEALTH PROVIDERS FOUND',
    'before=' || cms_name || ' after=' || cms_after
  );

  -- V9: privileged bypass does not persist after RPC (direct write still blocked)
  BEGIN
    PERFORM pg_temp.set_jwt(u_owner);
    -- Confirm GUC is not left enabled from prior SECURITY DEFINER RPCs
    UPDATE public.employer_practice_profiles
    SET public_display_name = 'PostRpc Hack'
    WHERE employer_practice_profiles.practice_id = v_practice_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.dn_record(
      9, 'privileged bypass does not persist after RPC',
      false,
      'unexpected success rows=' || v_rows
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM pg_temp.dn_record(
      9, 'privileged bypass does not persist after RPC',
      v_err ILIKE '%not authorized%' OR v_err ILIKE '%propose_employer_display_name%',
      v_err
    );
  END;
END;
$test$;

SELECT case_no, description, pass, detail FROM dn_prod_results ORDER BY case_no;

DO $fail$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM dn_prod_results WHERE NOT pass;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '% production verification case(s) failed', v_fail;
  END IF;
END;
$fail$;

ROLLBACK;
