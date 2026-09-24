-- MAT-18 employer notifications RLS (transactional; rolls back).
-- Prerequisite: 20260924153000_employer_notifications_v1.sql applied.
--
--   npx supabase db query --linked -f docs/security/employer-notifications-v1-security-test.sql

BEGIN;

CREATE TEMP TABLE employer_notice_results (
  case_no int PRIMARY KEY,
  description text NOT NULL,
  expected text NOT NULL,
  detail text NOT NULL,
  pass boolean NOT NULL
);

GRANT ALL ON TABLE employer_notice_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.record(
  p_case int,
  p_desc text,
  p_expected text,
  p_pass boolean,
  p_detail text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO employer_notice_results(case_no, description, expected, detail, pass)
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
  u_phys uuid := 'c0190000-0000-4000-8000-000000000001';
  u_editor uuid := 'c0190000-0000-4000-8000-000000000002';
  u_other uuid := 'c0190000-0000-4000-8000-000000000003';
  org_a uuid := 'c0190000-0000-4000-8000-000000000011';
  rel_id uuid := 'c0190000-0000-4000-8000-000000000021';
  note_id uuid := 'c0190000-0000-4000-8000-000000000031';
  practice_a uuid;
  profile_phys uuid;
  practice_label text;
  visible integer;
  marked boolean;
  unread integer;
  stored_body text;
  stored_link text;
  ok boolean;
  err text;
BEGIN
  IF to_regprocedure('public.employer_notifications_list_mine(integer, timestamptz)') IS NULL THEN
    PERFORM pg_temp.record(0, 'employer notifications migration applied', 'function present', false, 'list RPC missing');
    RETURN;
  END IF;

  PERFORM pg_temp.record(
    1,
    'physician connect deep link includes the thread',
    '/connect?thread=',
    position('/connect?thread=' in pg_get_functiondef('public._notification_on_connect_event()'::regprocedure)) > 0,
    'function source'
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
    PERFORM pg_temp.record(2, 'fixture practice', 'present', false, 'no practice');
    RETURN;
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (u_phys, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'enote.phys@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_editor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'enote.editor@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (u_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'enote.other@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, phone, npi,
    training_status, clinical_focus, preferred_state, start_year,
    onboarding_complete, data_sharing
  ) VALUES (
    u_phys, 'enote.phys@example.test', 'Secret', 'Physician', '555-0191', '1911911911',
    'Fellow', ARRAY['Glaucoma (medical and/or surgical)'], ARRAY['GA'], '2027', true, true
  );

  SELECT id INTO profile_phys FROM public.profiles WHERE user_id = u_phys;

  INSERT INTO public.employer_organizations (id, name, slug, status, verified_at)
  VALUES (org_a, 'Employer Notice Org', 'enote-org-' || substr(org_a::text, 1, 8), 'verified', now())
  ON CONFLICT (id) DO UPDATE SET status = 'verified', archived_at = NULL;

  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, scope, status, accepted_at
  ) VALUES (
    org_a, u_editor, 'owner', 'organization_only', 'active', now()
  );

  UPDATE public.employer_organization_practices
  SET status = 'inactive', inactive_at = now(), inactive_reason = 'enote_sec_test'
  WHERE practice_id = practice_a AND status = 'active';

  INSERT INTO public.employer_organization_practices (
    organization_id, practice_id, relationship, status, approved_at, approved_by
  ) VALUES (
    org_a, practice_a, 'operates', 'active', now(), u_editor
  );

  INSERT INTO public.connect_relationships (
    id, physician_profile_id, practice_id, organization_id,
    initiator_side, initiated_by_user_id, status
  ) VALUES (
    rel_id, profile_phys, practice_a, org_a, 'physician', u_phys, 'pending'
  );

  PERFORM public._connect_enqueue_employer_emails(
    rel_id,
    practice_a,
    'connect_requested',
    'New request from Dr. Secret Physician',
    'Dr. Secret Physician wants to connect.',
    '/practices/wrong',
    jsonb_build_object('identity_disclosed', true, 'message_body', 'private note'),
    format('connect_requested:%s', rel_id)
  );

  SELECT n.body, n.deep_link, n.id
  INTO stored_body, stored_link, note_id
  FROM public.employer_notifications AS n
  WHERE n.recipient_user_id = u_editor
    AND n.relationship_id = rel_id
    AND n.notification_type = 'connect_requested';

  practice_label := public._notification_practice_label(practice_a);

  PERFORM pg_temp.record(
    2,
    'request notice names the practice and hides physician identity',
    'anonymous + practice name',
    stored_body IS NOT NULL
      AND position(practice_label in stored_body) > 0
      AND position('Secret' in stored_body) = 0
      AND position('private note' in coalesce(stored_body, '')) = 0
      AND stored_link = format('/practices/%s/manage/connect?thread=%s', practice_a, rel_id),
    coalesce(stored_body, 'missing')
  );

  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_editor);
  SELECT COUNT(*) INTO visible
  FROM public.employer_notifications
  WHERE id = note_id;
  PERFORM pg_temp.record(3, 'recipient can read own row under RLS', '1', visible = 1, visible::text);

  SELECT COUNT(*) INTO visible FROM public.employer_notifications_list_mine(20, NULL);
  PERFORM pg_temp.record(4, 'list RPC returns the recipient row', 'at least 1', visible >= 1, visible::text);

  unread := public.employer_notifications_unread_count();
  PERFORM pg_temp.record(5, 'unread count includes the new row', 'at least 1', unread >= 1, unread::text);

  marked := public.employer_notifications_mark_read(note_id);
  PERFORM pg_temp.record(6, 'recipient can mark own row read', 'true', marked, marked::text);

  PERFORM pg_temp.reset_auth();
  PERFORM pg_temp.set_jwt(u_other);

  SELECT COUNT(*) INTO visible
  FROM public.employer_notifications
  WHERE id = note_id;
  PERFORM pg_temp.record(7, 'other user cannot read the row under RLS', '0', visible = 0, visible::text);

  SELECT COUNT(*) INTO visible
  FROM public.employer_notifications_list_mine(20, NULL) AS n
  WHERE n.id = note_id;
  PERFORM pg_temp.record(8, 'list RPC hides another recipient', '0', visible = 0, visible::text);

  marked := public.employer_notifications_mark_read(note_id);
  PERFORM pg_temp.record(9, 'other user cannot mark the row read', 'false', marked = false, marked::text);

  BEGIN
    INSERT INTO public.employer_notifications (
      recipient_user_id, practice_id, notification_type, title, body, deep_link, dedupe_key
    ) VALUES (
      u_other, practice_a, 'connect_requested', 'x', 'y', '/nope', 'enote-insert-denied'
    );
    ok := false;
    err := 'insert succeeded';
  EXCEPTION WHEN OTHERS THEN
    ok := SQLSTATE IN ('42501', 'insufficient_privilege');
    err := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM pg_temp.record(10, 'authenticated cannot insert notification rows', '42501', ok, err);

  PERFORM pg_temp.reset_auth();
  unread := public.employer_notifications_unread_count();
  PERFORM pg_temp.record(11, 'signed-out unread count is zero', '0', unread = 0, unread::text);
END;
$matrix$;

SELECT case_no, pass, description, expected, detail
FROM employer_notice_results
ORDER BY case_no;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM employer_notice_results WHERE NOT pass) THEN
    RAISE EXCEPTION 'employer notification security test failed';
  END IF;
END;
$$;

ROLLBACK;
