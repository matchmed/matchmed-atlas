-- MAT-18: Connect messaging (one thread per connect_relationships row).
-- Decisions: new thread per attempt; intro = message #1; practice-shared read cursor;
-- bilateral transactional email via Atlas Resend outbox for employers.

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.connect_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES public.connect_relationships(id) ON DELETE CASCADE,
  sender_side text NOT NULL CHECK (sender_side IN ('physician', 'practice')),
  sender_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  is_intro boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connect_messages_body_len_check
    CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS connect_messages_one_intro_per_relationship
  ON public.connect_messages (relationship_id)
  WHERE is_intro IS TRUE;

CREATE INDEX IF NOT EXISTS connect_messages_relationship_created_idx
  ON public.connect_messages (relationship_id, created_at ASC, id ASC);

COMMENT ON TABLE public.connect_messages IS
  'Messages for a Connect relationship. Thread root is connect_relationships.id. Intro notes are the first message while pending.';

CREATE TABLE IF NOT EXISTS public.connect_participant_read_state (
  relationship_id uuid NOT NULL REFERENCES public.connect_relationships(id) ON DELETE CASCADE,
  participant_side text NOT NULL CHECK (participant_side IN ('physician', 'practice')),
  last_read_message_id uuid NULL REFERENCES public.connect_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (relationship_id, participant_side)
);

COMMENT ON TABLE public.connect_participant_read_state IS
  'Shared read cursor per relationship party (physician vs practice). Practice cursor is shared across authorized editors.';

-- Minimal employer-side transactional email outbox (Atlas Resend only).
CREATE TABLE IF NOT EXISTS public.connect_employer_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES public.connect_relationships(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  email_kind text NOT NULL CHECK (email_kind IN (
    'connect_requested',
    'connect_accepted',
    'connect_message'
  )),
  title text NOT NULL,
  body text NOT NULL,
  deep_link text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  provider_message_id text NULL,
  error_detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  CONSTRAINT connect_employer_email_outbox_dedupe_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS connect_employer_email_outbox_pending_idx
  ON public.connect_employer_email_outbox (created_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.connect_employer_email_outbox IS
  'Transactional Connect emails for practice editors. Claimed by Atlas service cron; no employer Resend stack.';

-- Allow connect_message on physician notifications + connect destination already present.
ALTER TABLE public.physician_notifications
  DROP CONSTRAINT IF EXISTS physician_notifications_type_check;

ALTER TABLE public.physician_notifications
  ADD CONSTRAINT physician_notifications_type_check
  CHECK (notification_type IN (
    'opportunity_matched',
    'opportunity_changed',
    'opportunity_closed',
    'region_ready_milestone',
    'relationship_practice_ready',
    'relationship_opportunity_update',
    'connect_requested',
    'connect_accepted',
    'connect_message'
  ));

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.connect_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_participant_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_employer_email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connect_messages_select_party ON public.connect_messages;
CREATE POLICY connect_messages_select_party
  ON public.connect_messages FOR SELECT TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.connect_relationships AS r
      INNER JOIN public.profiles AS p ON p.id = r.physician_profile_id
      WHERE r.id = connect_messages.relationship_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.connect_relationships AS r
      WHERE r.id = connect_messages.relationship_id
        AND public.can_edit_practice((SELECT auth.uid()), r.practice_id)
    )
  );

DROP POLICY IF EXISTS connect_read_state_select_party ON public.connect_participant_read_state;
CREATE POLICY connect_read_state_select_party
  ON public.connect_participant_read_state FOR SELECT TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.connect_relationships AS r
      INNER JOIN public.profiles AS p ON p.id = r.physician_profile_id
      WHERE r.id = connect_participant_read_state.relationship_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.connect_relationships AS r
      WHERE r.id = connect_participant_read_state.relationship_id
        AND public.can_edit_practice((SELECT auth.uid()), r.practice_id)
    )
  );

-- Outbox: service-role only (no authenticated policies).
REVOKE ALL ON TABLE public.connect_messages FROM anon;
REVOKE ALL ON TABLE public.connect_participant_read_state FROM anon;
REVOKE ALL ON TABLE public.connect_employer_email_outbox FROM anon, authenticated;

GRANT SELECT ON TABLE public.connect_messages TO authenticated;
GRANT SELECT ON TABLE public.connect_participant_read_state TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.connect_messages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.connect_participant_read_state FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.connect_employer_email_outbox TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connect_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connect_participant_read_state TO service_role;

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public._connect_normalize_message_body(p_body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text;
BEGIN
  v := btrim(COALESCE(p_body, ''));
  IF v = '' THEN
    RAISE EXCEPTION 'message body required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v) > 2000 THEN
    RAISE EXCEPTION 'message exceeds 2000 characters' USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_viewer_side(p_relationship public.connect_relationships)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_profile_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles AS p
  WHERE p.user_id = v_uid
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_profile_id IS NOT NULL AND v_profile_id = p_relationship.physician_profile_id THEN
    RETURN 'physician';
  END IF;

  IF public.can_edit_practice(v_uid, p_relationship.practice_id) OR public.is_atlas_admin() THEN
    RETURN 'practice';
  END IF;

  RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_message_covers(
  p_candidate_id uuid,
  p_candidate_created timestamptz,
  p_last_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_last_created timestamptz;
BEGIN
  IF p_last_id IS NULL THEN
    RETURN false;
  END IF;
  IF p_candidate_id = p_last_id THEN
    RETURN true;
  END IF;
  SELECT m.created_at INTO v_last_created
  FROM public.connect_messages AS m
  WHERE m.id = p_last_id;
  IF v_last_created IS NULL THEN
    RETURN false;
  END IF;
  IF p_candidate_created < v_last_created THEN
    RETURN true;
  END IF;
  IF p_candidate_created = v_last_created AND p_candidate_id::text <= p_last_id::text THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_has_unread(
  p_relationship_id uuid,
  p_viewer_side text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.connect_messages AS m
    LEFT JOIN public.connect_participant_read_state AS rs
      ON rs.relationship_id = m.relationship_id
     AND rs.participant_side = p_viewer_side
    WHERE m.relationship_id = p_relationship_id
      AND m.sender_side IS DISTINCT FROM p_viewer_side
      AND (
        rs.last_read_message_id IS NULL
        OR NOT public._connect_message_covers(m.id, m.created_at, rs.last_read_message_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public._connect_practice_editor_recipients(p_practice_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (lower(u.email))
    u.id AS user_id,
    lower(btrim(u.email)) AS email
  FROM public.employer_organization_practices AS l
  INNER JOIN public.organization_memberships AS m
    ON m.organization_id = l.organization_id
  INNER JOIN auth.users AS u
    ON u.id = m.user_id
  WHERE l.practice_id = p_practice_id
    AND l.status = 'active'
    AND l.relationship = 'operates'
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin', 'editor')
    AND (
      m.organization_id = l.organization_id
      OR (
        m.scope = 'organization_and_descendants'
        AND l.organization_id IN (SELECT public._organization_descendant_ids(m.organization_id))
      )
    )
    AND nullif(btrim(COALESCE(u.email, '')), '') IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
  ORDER BY lower(u.email), u.id;
$$;

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
BEGIN
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
      p_title,
      p_body,
      p_deep_link,
      COALESCE(p_payload, '{}'::jsonb),
      format('%s:%s:%s', p_dedupe_prefix, p_relationship_id, v_rec.user_id),
      'pending'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_n := v_n + COALESCE(v_inserted, 0);
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_insert_message(
  p_relationship_id uuid,
  p_sender_side text,
  p_sender_user_id uuid,
  p_body text,
  p_is_intro boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_body text;
BEGIN
  v_body := public._connect_normalize_message_body(p_body);
  INSERT INTO public.connect_messages (
    relationship_id, sender_side, sender_user_id, body, is_intro
  ) VALUES (
    p_relationship_id, p_sender_side, p_sender_user_id, v_body, COALESCE(p_is_intro, false)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_enqueue_message_notifications(
  p_relationship public.connect_relationships,
  p_message_id uuid,
  p_sender_side text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label text;
  v_phys public.profiles%ROWTYPE;
  v_title text;
  v_body text;
  v_deep text;
BEGIN
  IF p_relationship.status IS DISTINCT FROM 'accepted' THEN
    RETURN;
  END IF;

  v_label := public._notification_practice_label(p_relationship.practice_id);
  SELECT * INTO v_phys FROM public.profiles WHERE id = p_relationship.physician_profile_id;

  IF p_sender_side = 'practice' AND v_phys.id IS NOT NULL THEN
    v_title := format('New message from %s', v_label);
    v_body := format('%s sent you a new message on Atlas.', v_label);
    v_deep := format('/connect?thread=%s', p_relationship.id);
    PERFORM public._notification_insert(
      v_phys.id,
      'connect_message',
      'transactional',
      format('connect_message:%s:%s', p_message_id, v_phys.id),
      v_title,
      v_body,
      jsonb_build_object(
        'connect_id', p_relationship.id,
        'practice_id', p_relationship.practice_id,
        'message_id', p_message_id,
        'category', 'connect'
      ),
      'connect',
      p_relationship.id,
      v_deep
    );
  ELSIF p_sender_side = 'physician' THEN
    -- Post-acceptance: identity may be disclosed to practice editors.
    v_title := format(
      'New message from Dr. %s %s',
      COALESCE(nullif(btrim(v_phys.first_name), ''), 'Physician'),
      COALESCE(nullif(btrim(v_phys.last_name), ''), '')
    );
    v_title := btrim(v_title);
    v_body := format(
      'Dr. %s %s sent your practice a new message on Atlas.',
      COALESCE(nullif(btrim(v_phys.first_name), ''), 'Physician'),
      COALESCE(nullif(btrim(v_phys.last_name), ''), '')
    );
    v_body := btrim(regexp_replace(v_body, '\s+', ' ', 'g'));
    v_deep := format('/practices/%s/manage/connect?thread=%s', p_relationship.practice_id, p_relationship.id);
    PERFORM public._connect_enqueue_employer_emails(
      p_relationship.id,
      p_relationship.practice_id,
      'connect_message',
      v_title,
      v_body,
      v_deep,
      jsonb_build_object(
        'connect_id', p_relationship.id,
        'message_id', p_message_id,
        'identity_disclosed', true
      ),
      format('connect_message:%s', p_message_id)
    );
  END IF;
END;
$$;

-- =============================================================================
-- Initiate RPCs with optional intro note (message #1)
-- =============================================================================

DROP FUNCTION IF EXISTS public.connect_initiate_by_physician(uuid, uuid);
CREATE OR REPLACE FUNCTION public.connect_initiate_by_physician(
  p_practice_id uuid,
  p_opportunity_id uuid DEFAULT NULL,
  p_intro_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_org_id uuid;
  v_id uuid;
  v_intro text;
  v_msg_id uuid;
BEGIN
  v_profile := public._connect_caller_physician_profile();

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.connect_practice_is_eligible(p_practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  PERFORM public._connect_validate_opportunity(p_opportunity_id, p_practice_id);

  IF EXISTS (
    SELECT 1 FROM public.connect_relationships AS r
    WHERE r.physician_profile_id = v_profile.id
      AND r.practice_id = p_practice_id
      AND r.status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'active Connect relationship already exists' USING ERRCODE = '23505';
  END IF;

  IF p_intro_note IS NOT NULL AND btrim(p_intro_note) <> '' THEN
    IF char_length(btrim(p_intro_note)) > 1000 THEN
      RAISE EXCEPTION 'intro note exceeds 1000 characters' USING ERRCODE = '22023';
    END IF;
    v_intro := public._connect_normalize_message_body(left(btrim(p_intro_note), 1000));
  END IF;

  v_org_id := public._connect_active_organization_id(p_practice_id);

  INSERT INTO public.connect_relationships (
    physician_profile_id, practice_id, organization_id,
    initiator_side, initiated_by_user_id, status, opportunity_id
  ) VALUES (
    v_profile.id, p_practice_id, v_org_id,
    'physician', (SELECT auth.uid()), 'pending', p_opportunity_id
  )
  RETURNING id INTO v_id;

  PERFORM public._connect_record_event(
    v_id, 'requested', (SELECT auth.uid()), 'physician',
    jsonb_build_object('opportunity_id', p_opportunity_id, 'has_intro_note', v_intro IS NOT NULL)
  );

  IF v_intro IS NOT NULL THEN
    v_msg_id := public._connect_insert_message(
      v_id, 'physician', (SELECT auth.uid()), v_intro, true
    );
  END IF;

  -- Physician → practice Connect request email (privacy-safe; no physician identity).
  PERFORM public._connect_enqueue_employer_emails(
    v_id,
    p_practice_id,
    'connect_requested',
    'New Connect request on Atlas',
    'A physician sent your practice a Connect request on Atlas.',
    format('/practices/%s/manage/connect?thread=%s', p_practice_id, v_id),
    jsonb_build_object('connect_id', v_id, 'identity_disclosed', false),
    format('connect_requested:%s', v_id)
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'pending',
    'initiator_side', 'physician',
    'practice_id', p_practice_id,
    'physician_profile_id', v_profile.id,
    'intro_message_id', v_msg_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.connect_initiate_by_practice(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.connect_initiate_by_practice(
  p_practice_id uuid,
  p_physician_profile_id uuid,
  p_opportunity_id uuid DEFAULT NULL,
  p_intro_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org_id uuid;
  v_target public.profiles%ROWTYPE;
  v_id uuid;
  v_intro text;
  v_msg_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL OR p_physician_profile_id IS NULL THEN
    RAISE EXCEPTION 'practice_id and physician_profile_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employer_practice_profiles AS epp
    WHERE epp.practice_id = p_practice_id AND epp.physician_ready_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Practice profile must be physician-ready before connecting with physicians.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.connect_practice_is_eligible(p_practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles AS p WHERE p.id = p_physician_profile_id;

  IF v_target.id IS NULL
     OR v_target.user_id IS NULL
     OR v_target.deleted_at IS NOT NULL
     OR v_target.onboarding_complete IS NOT TRUE THEN
    RAISE EXCEPTION 'physician is not eligible' USING ERRCODE = '22023';
  END IF;

  IF v_target.data_sharing IS NOT TRUE THEN
    RAISE EXCEPTION 'physician is not open to practice connections' USING ERRCODE = '22023';
  END IF;

  PERFORM public._connect_validate_opportunity(p_opportunity_id, p_practice_id);

  IF EXISTS (
    SELECT 1 FROM public.connect_relationships AS r
    WHERE r.physician_profile_id = p_physician_profile_id
      AND r.practice_id = p_practice_id
      AND r.status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'active Connect relationship already exists' USING ERRCODE = '23505';
  END IF;

  IF p_intro_note IS NOT NULL AND btrim(p_intro_note) <> '' THEN
    IF char_length(btrim(p_intro_note)) > 1000 THEN
      RAISE EXCEPTION 'intro note exceeds 1000 characters' USING ERRCODE = '22023';
    END IF;
    v_intro := public._connect_normalize_message_body(left(btrim(p_intro_note), 1000));
  END IF;

  v_org_id := public._connect_active_organization_id(p_practice_id);

  INSERT INTO public.connect_relationships (
    physician_profile_id, practice_id, organization_id,
    initiator_side, initiated_by_user_id, status, opportunity_id
  ) VALUES (
    p_physician_profile_id, p_practice_id, v_org_id,
    'practice', v_uid, 'pending', p_opportunity_id
  )
  RETURNING id INTO v_id;

  PERFORM public._connect_record_event(
    v_id, 'requested', v_uid, 'practice',
    jsonb_build_object('opportunity_id', p_opportunity_id, 'has_intro_note', v_intro IS NOT NULL)
  );

  IF v_intro IS NOT NULL THEN
    v_msg_id := public._connect_insert_message(v_id, 'practice', v_uid, v_intro, true);
  END IF;

  -- Existing MAT-10 trigger still creates physician connect_requested notification.
  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'pending',
    'initiator_side', 'practice',
    'practice_id', p_practice_id,
    'physician_profile_id', p_physician_profile_id,
    'intro_message_id', v_msg_id
  );
END;
$$;

-- =============================================================================
-- Messaging RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.connect_send_message(
  p_relationship_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.connect_relationships%ROWTYPE;
  v_side text;
  v_msg_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_relationship_id IS NULL THEN
    RAISE EXCEPTION 'relationship_id required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.connect_relationships WHERE id = p_relationship_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  v_side := public._connect_viewer_side(v_row);

  IF v_row.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'messaging is only available for accepted connections' USING ERRCODE = '22023';
  END IF;

  v_msg_id := public._connect_insert_message(p_relationship_id, v_side, v_uid, p_body, false);

  -- Sender auto-advances their shared cursor.
  INSERT INTO public.connect_participant_read_state (
    relationship_id, participant_side, last_read_message_id, last_read_at
  ) VALUES (
    p_relationship_id, v_side, v_msg_id, now()
  )
  ON CONFLICT (relationship_id, participant_side) DO UPDATE
  SET last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at;

  PERFORM public._connect_enqueue_message_notifications(v_row, v_msg_id, v_side);

  RETURN jsonb_build_object(
    'id', v_msg_id,
    'relationship_id', p_relationship_id,
    'sender_side', v_side,
    'body', public._connect_normalize_message_body(p_body),
    'is_intro', false,
    'created_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_list_messages(
  p_relationship_id uuid,
  p_limit integer DEFAULT 100,
  p_before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connect_relationships%ROWTYPE;
  v_side text;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
  v_result jsonb;
  v_opp_focus text;
BEGIN
  SELECT * INTO v_row FROM public.connect_relationships WHERE id = p_relationship_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  v_side := public._connect_viewer_side(v_row);

  IF v_row.opportunity_id IS NOT NULL THEN
    SELECT o.clinical_focus INTO v_opp_focus
    FROM public.employer_practice_recruiting_opportunities AS o
    WHERE o.id = v_row.opportunity_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at ASC, x.id ASC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      m.id,
      m.relationship_id,
      m.sender_side,
      m.body,
      m.is_intro,
      m.created_at,
      (m.sender_side = v_side) AS is_mine
    FROM public.connect_messages AS m
    WHERE m.relationship_id = p_relationship_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_limit
  ) AS x;

  RETURN jsonb_build_object(
    'relationship_id', v_row.id,
    'status', v_row.status,
    'viewer_side', v_side,
    'opportunity_id', v_row.opportunity_id,
    'origin_clinical_focus', v_opp_focus,
    'messages', v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_mark_thread_read(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connect_relationships%ROWTYPE;
  v_side text;
  v_last uuid;
BEGIN
  SELECT * INTO v_row FROM public.connect_relationships WHERE id = p_relationship_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  v_side := public._connect_viewer_side(v_row);

  SELECT m.id INTO v_last
  FROM public.connect_messages AS m
  WHERE m.relationship_id = p_relationship_id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_last IS NULL THEN
    RETURN jsonb_build_object('relationship_id', p_relationship_id, 'last_read_message_id', null);
  END IF;

  INSERT INTO public.connect_participant_read_state (
    relationship_id, participant_side, last_read_message_id, last_read_at
  ) VALUES (
    p_relationship_id, v_side, v_last, now()
  )
  ON CONFLICT (relationship_id, participant_side) DO UPDATE
  SET last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at;

  RETURN jsonb_build_object(
    'relationship_id', p_relationship_id,
    'participant_side', v_side,
    'last_read_message_id', v_last
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_thread_seen_state(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connect_relationships%ROWTYPE;
  v_side text;
  v_other text;
  v_latest record;
  v_other_last uuid;
  v_seen boolean := false;
BEGIN
  SELECT * INTO v_row FROM public.connect_relationships WHERE id = p_relationship_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;
  v_side := public._connect_viewer_side(v_row);
  v_other := CASE WHEN v_side = 'physician' THEN 'practice' ELSE 'physician' END;

  SELECT m.id, m.sender_side, m.created_at
  INTO v_latest
  FROM public.connect_messages AS m
  WHERE m.relationship_id = p_relationship_id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_latest.id IS NULL OR v_latest.sender_side IS DISTINCT FROM v_side THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;

  SELECT rs.last_read_message_id INTO v_other_last
  FROM public.connect_participant_read_state AS rs
  WHERE rs.relationship_id = p_relationship_id
    AND rs.participant_side = v_other;

  v_seen := public._connect_message_covers(v_latest.id, v_latest.created_at, v_other_last);

  RETURN jsonb_build_object(
    'state', CASE WHEN v_seen THEN 'seen' ELSE 'sent' END,
    'latest_message_id', v_latest.id
  );
END;
$$;

-- =============================================================================
-- Inbox list RPCs (enriched with last message + unread)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.connect_list_for_physician()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  v_profile := public._connect_caller_physician_profile();

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_at DESC, x.id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id,
      r.practice_id,
      r.status,
      r.initiator_side,
      r.opportunity_id,
      r.created_at,
      r.updated_at,
      r.responded_at,
      r.canceled_at,
      r.disconnected_at,
      r.disconnected_by_side,
      pr.practice_name,
      COALESCE(ep.public_display_name, pr.practice_name) AS display_name,
      pr.city AS practice_city,
      pr.state AS practice_state,
      public.connect_practice_is_eligible(r.practice_id) AS practice_eligible,
      lm.body AS last_message_preview,
      lm.created_at AS last_message_at,
      lm.sender_side AS last_message_sender_side,
      public._connect_has_unread(r.id, 'physician') AS has_unread,
      opp.clinical_focus AS origin_clinical_focus,
      COALESCE(lm.created_at, r.updated_at, r.created_at) AS sort_at
    FROM public.connect_relationships AS r
    INNER JOIN public.practices AS pr ON pr.id = r.practice_id
    LEFT JOIN public.employer_practice_profiles AS ep ON ep.practice_id = r.practice_id
    LEFT JOIN public.employer_practice_recruiting_opportunities AS opp
      ON opp.id = r.opportunity_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.created_at, m.sender_side
      FROM public.connect_messages AS m
      WHERE m.relationship_id = r.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) AS lm ON true
    WHERE r.physician_profile_id = v_profile.id
  ) AS x;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_list_for_practice(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_at DESC, x.id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id,
      r.practice_id,
      r.status,
      r.initiator_side,
      r.opportunity_id,
      r.created_at,
      r.updated_at,
      r.responded_at,
      r.canceled_at,
      r.disconnected_at,
      r.disconnected_by_side,
      r.physician_profile_id,
      CASE
        WHEN r.status = 'accepted' THEN public._connect_unlocked_physician_json(p)
        ELSE public._connect_anonymous_physician_json(p)
      END AS physician,
      lm.body AS last_message_preview,
      lm.created_at AS last_message_at,
      lm.sender_side AS last_message_sender_side,
      public._connect_has_unread(r.id, 'practice') AS has_unread,
      opp.clinical_focus AS origin_clinical_focus,
      COALESCE(lm.created_at, r.updated_at, r.created_at) AS sort_at
    FROM public.connect_relationships AS r
    INNER JOIN public.profiles AS p ON p.id = r.physician_profile_id
    LEFT JOIN public.employer_practice_recruiting_opportunities AS opp
      ON opp.id = r.opportunity_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.created_at, m.sender_side
      FROM public.connect_messages AS m
      WHERE m.relationship_id = r.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) AS lm ON true
    WHERE r.practice_id = p_practice_id
  ) AS x;

  RETURN v_result;
END;
$$;

-- Physician acceptance → notify practice editors (identity disclosed).
-- Replaces prior connect_accept while preserving recipient-only semantics.
CREATE OR REPLACE FUNCTION public.connect_accept(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_side text;
  v_phys public.profiles%ROWTYPE;
  v_title text;
  v_body text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_relationship_id IS NULL THEN
    RAISE EXCEPTION 'relationship_id required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'relationship is not pending' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  IF v_profile.deleted_at IS NOT NULL OR v_profile.onboarding_complete IS NOT TRUE THEN
    RAISE EXCEPTION 'physician is not eligible' USING ERRCODE = '22023';
  END IF;

  IF NOT public.connect_practice_is_eligible(v_row.practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  -- Recipient only (same semantics as Connect V1).
  IF v_row.initiator_side = 'physician' THEN
    IF NOT public.can_edit_practice(v_uid, v_row.practice_id) THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'practice';
  ELSE
    IF v_profile.user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'physician';
  END IF;

  UPDATE public.connect_relationships
  SET status = 'accepted',
      responded_at = now(),
      responded_by_user_id = v_uid,
      updated_at = now()
  WHERE id = p_relationship_id;

  PERFORM public._connect_record_event(p_relationship_id, 'accepted', v_uid, v_side, '{}'::jsonb);

  IF v_side = 'physician' THEN
    SELECT * INTO v_phys FROM public.profiles WHERE id = v_row.physician_profile_id;
    v_title := format(
      'Connect accepted by Dr. %s %s',
      COALESCE(nullif(btrim(v_phys.first_name), ''), 'Physician'),
      COALESCE(nullif(btrim(v_phys.last_name), ''), '')
    );
    v_body := format(
      'Dr. %s %s accepted your Connect request on Atlas.',
      COALESCE(nullif(btrim(v_phys.first_name), ''), 'Physician'),
      COALESCE(nullif(btrim(v_phys.last_name), ''), '')
    );
    PERFORM public._connect_enqueue_employer_emails(
      p_relationship_id,
      v_row.practice_id,
      'connect_accepted',
      btrim(v_title),
      btrim(regexp_replace(v_body, '\s+', ' ', 'g')),
      format('/practices/%s/manage/connect?thread=%s', v_row.practice_id, p_relationship_id),
      jsonb_build_object('connect_id', p_relationship_id, 'identity_disclosed', true),
      format('connect_accepted:%s', p_relationship_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'id', p_relationship_id,
    'status', 'accepted',
    'initiator_side', v_row.initiator_side,
    'practice_id', v_row.practice_id,
    'physician_profile_id', v_row.physician_profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_claim_employer_emails(p_limit integer DEFAULT 50)
RETURNS TABLE (
  outbox_id uuid,
  relationship_id uuid,
  practice_id uuid,
  recipient_user_id uuid,
  email text,
  email_kind text,
  title text,
  body text,
  deep_link text,
  payload jsonb,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_row record;
BEGIN
  FOR v_row IN
    SELECT o.*
    FROM public.connect_employer_email_outbox AS o
    WHERE o.status = 'pending'
    ORDER BY o.created_at ASC
    LIMIT v_limit
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    outbox_id := v_row.id;
    relationship_id := v_row.relationship_id;
    practice_id := v_row.practice_id;
    recipient_user_id := v_row.recipient_user_id;
    email := v_row.recipient_email;
    email_kind := v_row.email_kind;
    title := v_row.title;
    body := v_row.body;
    deep_link := v_row.deep_link;
    payload := v_row.payload;
    status := 'pending';
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_finalize_employer_email(
  p_outbox_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('sent', 'skipped', 'failed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.connect_employer_email_outbox
  SET status = p_status,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      error_detail = CASE WHEN p_status = 'failed' THEN left(COALESCE(p_error_detail, ''), 500) ELSE NULL END,
      sent_at = CASE WHEN p_status IN ('sent', 'skipped') THEN now() ELSE sent_at END
  WHERE id = p_outbox_id;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_claim_employer_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_claim_employer_emails(integer) TO service_role;
REVOKE ALL ON FUNCTION public.connect_finalize_employer_email(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_finalize_employer_email(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.connect_send_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_send_message(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.connect_list_messages(uuid, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_list_messages(uuid, integer, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.connect_mark_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_mark_thread_read(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.connect_thread_seen_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_thread_seen_state(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_initiate_by_physician(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_initiate_by_physician(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.connect_initiate_by_practice(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_initiate_by_practice(uuid, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public._connect_practice_editor_recipients(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._connect_enqueue_employer_emails(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._connect_insert_message(uuid, text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._connect_enqueue_message_notifications(public.connect_relationships, uuid, text) FROM PUBLIC, anon, authenticated;
