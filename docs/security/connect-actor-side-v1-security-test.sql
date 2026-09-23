-- MAT-18 explicit actor side (transactional; rolls back).
-- Prerequisite: 20260922180000_connect_explicit_actor_side.sql applied.
--
--   npx supabase db query --linked -f docs/security/connect-actor-side-v1-security-test.sql

BEGIN;

CREATE TEMP TABLE actor_side_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE actor_side_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int,
  p_desc text,
  p_expected text,
  p_pass boolean,
  p_detail text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO actor_side_results(case_no, description, expected, detail, pass)
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
  u_phys uuid := 'c0180000-0000-4000-8000-000000000001';
  u_editor uuid := 'c0180000-0000-4000-8000-000000000002';
  u_dual uuid := 'c0180000-0000-4000-8000-000000000003';
  u_other uuid := 'c0180000-0000-4000-8000-000000000004';
  org_a uuid := 'c0180000-0000-4000-8000-000000000011';
  practice_a uuid;
  profile_phys uuid;
  profile_dual uuid;
  rel_split uuid;
  rel_dual uuid;
  payload jsonb;
  msg_id uuid;
  stored_side text;
  stored_user uuid;
  phys_cursor uuid;
  practice_cursor uuid;
  ok boolean;
  err text;
BEGIN
  IF to_regprocedure('public.connect_send_message(uuid, text, text)') IS NULL THEN
    PERFORM pg_temp.record(0, 'explicit actor-side migration applied', 'function present', false, 'connect_send_message(uuid, text, text) missing');
    RETURN;
  END IF;

  PERFORM pg_temp.record(
    1,
    'old inferred send signature kept for deployed callers',
    'present',
    to_regprocedure('public.connect_send_message(uuid, text)') IS NOT NULL,
    'connect_send_message(uuid, text)'
  );
  PERFORM pg_temp.record(
    2,
    'physician-first viewer helper kept for old signatures',
    'present',
    to_regprocedure('public._connect_viewer_side(public.connect_relationships)') IS NOT NULL,
    '_connect_viewer_side'
  );

  SELECT l.practice_id INTO practice_a
  FROM public.employer_organization_practices AS l
  WHERE l.status = 'active' AND l.relationship = 'operates'
  ORDER BY l.practice_id
  LIMIT 1;
  IF practice_a IS NULL THEN
    SELECT id INTO practice_a FROM public.practices ORDER BY id LIMIT 1;
  END IF;
  IF practice_a IS NULL THEN
    PERFORM pg_temp.record(3, 'fixture practice', 'present', false, 'no practice');
    RETURN;
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (u_phys, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actor.phys@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_editor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actor.editor@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_dual, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actor.dual@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actor.other@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, phone, npi,
    training_status, clinical_focus, preferred_state, start_year,
    onboarding_complete, data_sharing
  ) VALUES
    (u_phys, 'actor.phys@example.test', 'Pat', 'Physician', '555-0181', '1811811811',
     'Fellow', ARRAY['Glaucoma (medical and/or surgical)'], ARRAY['GA'], '2027', true, true),
    (u_dual, 'actor.dual@example.test', 'Dee', 'Dual', '555-0182', '1821821822',
     'Fellow', ARRAY['Corneal Disease'], ARRAY['FL'], '2026', true, true);

  SELECT id INTO profile_phys FROM public.profiles WHERE user_id = u_phys;
  SELECT id INTO profile_dual FROM public.profiles WHERE user_id = u_dual;

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at)
  VALUES (org_a, 'Actor Side Org', 'actor-side-org-' || substr(org_a::text, 1, 8), 'verified', now())
  ON CONFLICT (id) DO UPDATE SET status = 'verified', archived_at = NULL;

  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, scope, status, accepted_at
  ) VALUES
    (org_a, u_editor, 'owner', 'organization_only', 'active', now()),
    (org_a, u_dual, 'editor', 'organization_only', 'active', now());

  UPDATE public.employer_organization_practices
  SET status = 'inactive', inactive_at = now(), inactive_reason = 'actor_side_sec_test'
  WHERE practice_id = practice_a AND status = 'active';

  INSERT INTO public.employer_organization_practices (
    organization_id, practice_id, relationship, status, approved_at, approved_by
  ) VALUES
    (org_a, practice_a, 'operates', 'active', now(), u_editor);

  PERFORM set_config('app.employer_profile_privileged_write', '1', true);
  INSERT INTO public.employer_practice_profiles (practice_id, physician_ready_at, physician_ready_by)
  VALUES (practice_a, now(), u_editor)
  ON CONFLICT (practice_id) DO UPDATE
  SET physician_ready_at = EXCLUDED.physician_ready_at,
      physician_ready_by = EXCLUDED.physician_ready_by;
  PERFORM set_config('app.employer_profile_privileged_write', '', true);

  -- Separate physician and practice senders.
  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.connect_initiate_by_physician(practice_a, NULL);
  rel_split := (payload->>'id')::uuid;
  PERFORM pg_temp.set_jwt(u_editor);
  PERFORM public.connect_accept(rel_split);

  PERFORM pg_temp.set_jwt(u_phys);
  payload := public.connect_send_message(rel_split, 'from the physician', 'physician');
  msg_id := (payload->>'id')::uuid;
  SELECT m.sender_side, m.sender_user_id INTO stored_side, stored_user
  FROM public.connect_messages AS m WHERE m.id = msg_id;
  PERFORM pg_temp.record(
    3,
    'valid physician send stores physician side and sender user',
    'physician + physician user',
    stored_side = 'physician' AND stored_user = u_phys AND payload->>'sender_side' = 'physician',
    stored_side || ' ' || COALESCE(stored_user::text, 'null')
  );

  PERFORM pg_temp.set_jwt(u_editor);
  payload := public.connect_send_message(rel_split, 'from the practice', 'practice');
  msg_id := (payload->>'id')::uuid;
  SELECT m.sender_side, m.sender_user_id INTO stored_side, stored_user
  FROM public.connect_messages AS m WHERE m.id = msg_id;
  PERFORM pg_temp.record(
    4,
    'valid practice send stores practice side and sender user',
    'practice + editor user',
    stored_side = 'practice' AND stored_user = u_editor AND payload->>'sender_side' = 'practice',
    stored_side || ' ' || COALESCE(stored_user::text, 'null')
  );

  PERFORM pg_temp.set_jwt(u_editor);
  BEGIN
    PERFORM public.connect_send_message(rel_split, 'editor pretending to be physician', 'physician');
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(12, 'practice editor cannot select the physician side', '42501', ok, err);

  PERFORM pg_temp.set_jwt(u_phys);
  BEGIN
    PERFORM public.connect_send_message(rel_split, 'physician pretending to be practice', 'practice');
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(13, 'physician cannot select the practice side', '42501', ok, err);

  PERFORM pg_temp.set_jwt(u_other);
  BEGIN
    PERFORM public.connect_send_message(rel_split, 'outsider', 'physician');
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(14, 'unrelated user cannot select the physician side', '42501', ok, err);

  BEGIN
    PERFORM public.connect_send_message(rel_split, 'outsider', 'practice');
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '42501';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(15, 'unrelated user cannot select the practice side', '42501', ok, err);

  -- Close the split thread so the dual physician can open one on the same practice.
  PERFORM pg_temp.set_jwt(u_phys);
  PERFORM public.connect_disconnect(rel_split, 'physician');

  PERFORM pg_temp.set_jwt(u_dual);
  payload := public.connect_initiate_by_physician(practice_a, NULL);
  rel_dual := (payload->>'id')::uuid;
  PERFORM pg_temp.set_jwt(u_editor);
  PERFORM public.connect_accept(rel_dual);

  PERFORM pg_temp.set_jwt(u_dual);
  payload := public.connect_send_message(rel_dual, 'dual as physician', 'physician');
  msg_id := (payload->>'id')::uuid;
  SELECT m.sender_side, m.sender_user_id INTO stored_side, stored_user
  FROM public.connect_messages AS m WHERE m.id = msg_id;
  PERFORM pg_temp.record(
    5,
    'dual-role user sends as physician from the physician side',
    'physician + dual user',
    stored_side = 'physician' AND stored_user = u_dual,
    stored_side || ' ' || COALESCE(stored_user::text, 'null')
  );

  payload := public.connect_send_message(rel_dual, 'dual as practice', 'practice');
  msg_id := (payload->>'id')::uuid;
  SELECT m.sender_side, m.sender_user_id INTO stored_side, stored_user
  FROM public.connect_messages AS m WHERE m.id = msg_id;
  PERFORM pg_temp.record(
    6,
    'dual-role user sends as practice from the practice side',
    'practice + dual user',
    stored_side = 'practice' AND stored_user = u_dual,
    stored_side || ' ' || COALESCE(stored_user::text, 'null')
  );

  payload := public.connect_list_messages(rel_dual, 'physician');
  ok := payload->>'viewer_side' = 'physician'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload->'messages') AS m
      WHERE m->>'body' = 'dual as physician' AND (m->>'is_mine')::boolean IS TRUE
    )
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload->'messages') AS m
      WHERE m->>'body' = 'dual as practice' AND (m->>'is_mine')::boolean IS FALSE
    );
  PERFORM pg_temp.record(7, 'physician read marks only physician messages as mine', 'viewer physician', ok, payload->>'viewer_side');

  payload := public.connect_list_messages(rel_dual, 'practice');
  ok := payload->>'viewer_side' = 'practice'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload->'messages') AS m
      WHERE m->>'body' = 'dual as practice' AND (m->>'is_mine')::boolean IS TRUE
    )
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload->'messages') AS m
      WHERE m->>'body' = 'dual as physician' AND (m->>'is_mine')::boolean IS FALSE
    );
  PERFORM pg_temp.record(8, 'practice read marks only practice messages as mine', 'viewer practice', ok, payload->>'viewer_side');

  SELECT rs.last_read_message_id INTO phys_cursor
  FROM public.connect_participant_read_state AS rs
  WHERE rs.relationship_id = rel_dual AND rs.participant_side = 'physician';
  PERFORM public.connect_mark_thread_read(rel_dual, 'practice');
  SELECT rs.last_read_message_id INTO practice_cursor
  FROM public.connect_participant_read_state AS rs
  WHERE rs.relationship_id = rel_dual AND rs.participant_side = 'practice';
  ok := practice_cursor IS NOT NULL
    AND practice_cursor IS DISTINCT FROM phys_cursor
    AND (
      SELECT rs.last_read_message_id
      FROM public.connect_participant_read_state AS rs
      WHERE rs.relationship_id = rel_dual AND rs.participant_side = 'physician'
    ) = phys_cursor;
  PERFORM pg_temp.record(
    9,
    'practice read cursor does not move the physician cursor',
    'cursors differ and physician cursor unchanged',
    ok,
    COALESCE(phys_cursor::text, 'null') || ' / ' || COALESCE(practice_cursor::text, 'null')
  );

  payload := public.connect_thread_seen_state(rel_dual, 'practice');
  PERFORM pg_temp.record(
    10,
    'practice seen state follows the practice side',
    'sent',
    payload->>'state' = 'sent',
    COALESCE(payload->>'state', 'null')
  );
  payload := public.connect_thread_seen_state(rel_dual, 'physician');
  PERFORM pg_temp.record(
    11,
    'physician seen state is none when the latest message is from the practice',
    'none',
    payload->>'state' = 'none',
    COALESCE(payload->>'state', 'null')
  );

  PERFORM pg_temp.set_jwt(u_dual);
  BEGIN
    PERFORM public.connect_send_message(rel_dual, 'bad side', 'both');
    ok := false;
    err := 'no exception';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE = '22023';
    err := SQLERRM;
  END;
  PERFORM pg_temp.record(16, 'invalid actor side rejected', '22023', ok, err);

  payload := public.connect_disconnect(rel_dual, 'practice');
  SELECT r.disconnected_by_side, r.disconnected_by_user_id INTO stored_side, stored_user
  FROM public.connect_relationships AS r WHERE r.id = rel_dual;
  PERFORM pg_temp.record(
    17,
    'dual-role disconnect from the practice side records practice',
    'practice + dual user',
    payload->>'disconnected_by_side' = 'practice'
      AND stored_side = 'practice'
      AND stored_user = u_dual,
    COALESCE(stored_side, 'null') || ' ' || COALESCE(stored_user::text, 'null')
  );

  PERFORM pg_temp.record(
    18,
    'accept, decline, and cancel stay single-arg; old disconnect stays too',
    'uuid signatures present',
    to_regprocedure('public.connect_accept(uuid)') IS NOT NULL
      AND to_regprocedure('public.connect_decline(uuid)') IS NOT NULL
      AND to_regprocedure('public.connect_cancel(uuid)') IS NOT NULL
      AND to_regprocedure('public.connect_disconnect(uuid)') IS NOT NULL
      AND to_regprocedure('public.connect_disconnect(uuid, text)') IS NOT NULL,
    'old disconnect remains for origin/main'
  );
END;
$matrix$;

SELECT
  COUNT(*) FILTER (WHERE pass) AS passed,
  COUNT(*) FILTER (WHERE NOT pass) AS failed,
  COUNT(*) AS total
FROM actor_side_results;

SELECT case_no, description, expected, pass, left(detail, 160) AS detail
FROM actor_side_results
ORDER BY case_no;

ROLLBACK;
