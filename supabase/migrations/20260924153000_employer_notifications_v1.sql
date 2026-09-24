-- MAT-18 employer in-app notifications.
-- Does not update, skip, or delete connect_employer_email_outbox rows.
-- Employer email sending stays gated in the Atlas cron by ENABLE_EMPLOYER_CONNECT_EMAILS=true.

CREATE TABLE IF NOT EXISTS public.employer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  relationship_id uuid NULL REFERENCES public.connect_relationships(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deep_link text NOT NULL,
  read_at timestamptz NULL,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_notifications_type_check
    CHECK (notification_type IN ('connect_requested', 'connect_accepted', 'connect_message')),
  CONSTRAINT employer_notifications_dedupe_key_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS employer_notifications_recipient_created_idx
  ON public.employer_notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS employer_notifications_unread_idx
  ON public.employer_notifications (recipient_user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.employer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employer_notifications_select_own ON public.employer_notifications;
CREATE POLICY employer_notifications_select_own
  ON public.employer_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.employer_notifications FROM anon;
GRANT SELECT ON TABLE public.employer_notifications TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.employer_notifications FROM authenticated;

COMMENT ON TABLE public.employer_notifications IS
  'In-app Connect notices for a specific practice editor. Rows are visible only to recipient_user_id.';

-- Safe copy + canonical deep link. Request notices never carry physician identity.
CREATE OR REPLACE FUNCTION public._connect_enqueue_employer_emails(
  p_relationship_id uuid,
  p_practice_id uuid,
  p_email_kind text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_payload jsonb,
  p_dedupe_prefix text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rec record;
  v_n integer := 0;
  v_inserted integer;
  v_practice text;
  v_title text;
  v_body text;
  v_deep text;
  v_payload jsonb;
  v_disclosed boolean;
  v_who text;
BEGIN
  v_practice := COALESCE(public._notification_practice_label(p_practice_id), 'your practice');
  v_deep := format('/practices/%s/manage/connect?thread=%s', p_practice_id, p_relationship_id);
  v_disclosed := COALESCE((p_payload->>'identity_disclosed')::boolean, false);

  IF p_email_kind = 'connect_requested' THEN
    v_disclosed := false;
    v_title := 'New Connect request';
    v_body := format('A physician sent %s a Connect request on Atlas.', v_practice);
  ELSIF p_email_kind = 'connect_accepted' THEN
    v_disclosed := true;
    v_title := COALESCE(nullif(btrim(p_title), ''), 'Connect request accepted');
    v_body := format('%s This update is for %s.', btrim(regexp_replace(COALESCE(p_body, ''), '\s+', ' ', 'g')), v_practice);
  ELSIF p_email_kind = 'connect_message' THEN
    v_who := nullif(regexp_replace(COALESCE(p_title, ''), '^New message from\s+', ''), '');
    IF v_disclosed AND v_who IS NOT NULL THEN
      v_title := format('New message from %s', v_who);
      v_body := format('%s sent %s a new message on Atlas.', v_who, v_practice);
    ELSE
      v_disclosed := false;
      v_title := 'New message';
      v_body := format('You have a new message for %s on Atlas.', v_practice);
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid employer email kind' USING ERRCODE = '22023';
  END IF;

  v_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
    'practice_id', p_practice_id,
    'practice_name', v_practice,
    'connect_id', p_relationship_id,
    'identity_disclosed', v_disclosed
  );
  -- Never keep a message transcript on the notice payload.
  v_payload := v_payload - 'message_body' - 'body';

  FOR v_rec IN
    SELECT * FROM public._connect_practice_editor_recipients(p_practice_id)
  LOOP
    INSERT INTO public.connect_employer_email_outbox (
      relationship_id, practice_id, recipient_user_id, recipient_email,
      email_kind, title, body, deep_link, payload, dedupe_key, status
    ) VALUES (
      p_relationship_id,
      p_practice_id,
      v_rec.user_id,
      v_rec.email,
      p_email_kind,
      v_title,
      v_body,
      v_deep,
      v_payload,
      format('%s:%s:%s', p_dedupe_prefix, p_relationship_id, v_rec.user_id),
      'pending'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    INSERT INTO public.employer_notifications (
      recipient_user_id, practice_id, relationship_id, notification_type,
      title, body, payload, deep_link, dedupe_key
    ) VALUES (
      v_rec.user_id,
      p_practice_id,
      p_relationship_id,
      p_email_kind,
      v_title,
      v_body,
      v_payload,
      v_deep,
      format('inapp:%s:%s:%s', p_dedupe_prefix, p_relationship_id, v_rec.user_id)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_n := v_n + COALESCE(v_inserted, 0);
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public._connect_enqueue_employer_emails(uuid, uuid, text, text, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.employer_notifications_list_mine(
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  notification_type text,
  title text,
  body text,
  payload jsonb,
  practice_id uuid,
  relationship_id uuid,
  deep_link text,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.notification_type,
    n.title,
    n.body,
    n.payload,
    n.practice_id,
    n.relationship_id,
    n.deep_link,
    n.created_at,
    n.read_at
  FROM public.employer_notifications AS n
  WHERE n.recipient_user_id = v_uid
    AND public.can_edit_practice(v_uid, n.practice_id)
    AND (p_before IS NULL OR n.created_at < p_before)
  ORDER BY n.created_at DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.employer_notifications_unread_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.employer_notifications AS n
  WHERE n.recipient_user_id = v_uid
    AND n.read_at IS NULL
    AND public.can_edit_practice(v_uid, n.practice_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.employer_notifications_mark_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_notification_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.employer_notifications AS n
  SET read_at = COALESCE(n.read_at, now())
  WHERE n.id = p_notification_id
    AND n.recipient_user_id = v_uid
    AND public.can_edit_practice(v_uid, n.practice_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.employer_notifications_mark_all_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employer_notifications AS n
  SET read_at = now()
  WHERE n.recipient_user_id = v_uid
    AND n.read_at IS NULL
    AND public.can_edit_practice(v_uid, n.practice_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN COALESCE(v_updated, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.employer_notifications_list_mine(integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employer_notifications_unread_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employer_notifications_mark_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employer_notifications_mark_all_read() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.employer_notifications_list_mine(integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employer_notifications_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.employer_notifications_mark_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employer_notifications_mark_all_read() TO authenticated;

-- Physician Connect request (and acceptance) opens the exact thread.
CREATE OR REPLACE FUNCTION public._notification_on_connect_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel public.connect_relationships%ROWTYPE;
  v_label text;
  v_deep text;
BEGIN
  SELECT * INTO v_rel
  FROM public.connect_relationships AS c
  WHERE c.id = NEW.relationship_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_label := public._notification_practice_label(v_rel.practice_id);
  v_deep := format('/connect?thread=%s', v_rel.id);

  IF NEW.event_type = 'requested' AND NEW.actor_side = 'practice' THEN
    PERFORM public._notification_insert(
      v_rel.physician_profile_id,
      'connect_requested',
      'transactional',
      format('connect_requested:%s:%s', v_rel.id, v_rel.physician_profile_id),
      'New Connect request',
      format('%s sent you a Connect request.', v_label),
      jsonb_build_object(
        'connect_id', v_rel.id,
        'practice_id', v_rel.practice_id,
        'event_id', NEW.id
      ),
      'connect',
      v_rel.id,
      v_deep
    );
  ELSIF NEW.event_type = 'accepted' AND NEW.actor_side = 'practice' THEN
    PERFORM public._notification_insert(
      v_rel.physician_profile_id,
      'connect_accepted',
      'transactional',
      format('connect_accepted:%s:%s', v_rel.id, v_rel.physician_profile_id),
      'Connect request accepted',
      format('%s accepted your Connect request.', v_label),
      jsonb_build_object(
        'connect_id', v_rel.id,
        'practice_id', v_rel.practice_id,
        'event_id', NEW.id
      ),
      'connect',
      v_rel.id,
      v_deep
    );
  END IF;

  RETURN NEW;
END;
$$;
