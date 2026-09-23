-- Explicit Connect actor side, added as overloads.
-- Deployed origin/main still calls connect_disconnect(uuid). That signature
-- and the inferred messaging signatures stay until both MAT-18 apps are live.
-- MAT-18 passes p_actor_side with no default, so PostgREST can tell the
-- overloads apart. Does not edit already-applied migrations.

-- =============================================================================
-- Authorization
-- =============================================================================

CREATE OR REPLACE FUNCTION public._connect_assert_actor_side(
  p_relationship public.connect_relationships,
  p_actor_side text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_side text := lower(btrim(COALESCE(p_actor_side, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_side NOT IN ('physician', 'practice') THEN
    RAISE EXCEPTION 'actor_side must be physician or practice' USING ERRCODE = '22023';
  END IF;

  IF v_side = 'physician' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = p_relationship.physician_profile_id
        AND p.user_id = v_uid
        AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.can_edit_practice(v_uid, p_relationship.practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN v_side;
END;
$$;

REVOKE ALL ON FUNCTION public._connect_assert_actor_side(public.connect_relationships, text) FROM PUBLIC, anon, authenticated;

-- _connect_viewer_side() stays. The old messaging functions still use it.

-- =============================================================================
-- Messaging overloads. Old signatures are not dropped.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.connect_send_message(
  p_relationship_id uuid,
  p_body text,
  p_actor_side text
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

  v_side := public._connect_assert_actor_side(v_row, p_actor_side);

  IF v_row.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'messaging is only available for accepted connections' USING ERRCODE = '22023';
  END IF;

  v_msg_id := public._connect_insert_message(p_relationship_id, v_side, v_uid, p_body, false);

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
    'sender_user_id', v_uid,
    'body', public._connect_normalize_message_body(p_body),
    'is_intro', false,
    'created_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_list_messages(
  p_relationship_id uuid,
  p_actor_side text,
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

  v_side := public._connect_assert_actor_side(v_row, p_actor_side);

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
      m.sender_user_id,
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

CREATE OR REPLACE FUNCTION public.connect_mark_thread_read(
  p_relationship_id uuid,
  p_actor_side text
)
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

  v_side := public._connect_assert_actor_side(v_row, p_actor_side);

  SELECT m.id INTO v_last
  FROM public.connect_messages AS m
  WHERE m.relationship_id = p_relationship_id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_last IS NULL THEN
    RETURN jsonb_build_object(
      'relationship_id', p_relationship_id,
      'participant_side', v_side,
      'last_read_message_id', null
    );
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

CREATE OR REPLACE FUNCTION public.connect_thread_seen_state(
  p_relationship_id uuid,
  p_actor_side text
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
  v_other text;
  v_latest record;
  v_other_last uuid;
  v_seen boolean := false;
BEGIN
  SELECT * INTO v_row FROM public.connect_relationships WHERE id = p_relationship_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  v_side := public._connect_assert_actor_side(v_row, p_actor_side);
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
-- Disconnect has the same physician-first ambiguity.
-- Accept, decline, and cancel do not: their side is the recipient or the
-- initiator, taken from initiator_side, not from membership priority.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.connect_disconnect(
  p_relationship_id uuid,
  p_actor_side text
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'relationship is not accepted' USING ERRCODE = '22023';
  END IF;

  v_side := public._connect_assert_actor_side(v_row, p_actor_side);

  UPDATE public.connect_relationships
  SET
    status = 'disconnected',
    disconnected_at = now(),
    disconnected_by_side = v_side,
    disconnected_by_user_id = v_uid,
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public._connect_record_event(v_row.id, 'disconnected', v_uid, v_side, '{}'::jsonb);

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', 'disconnected',
    'disconnected_by_side', v_side,
    'practice_id', v_row.practice_id,
    'physician_profile_id', v_row.physician_profile_id
  );
END;
$$;

-- New explicit signatures.
REVOKE ALL ON FUNCTION public.connect_send_message(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_send_message(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_list_messages(uuid, text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_list_messages(uuid, text, integer, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_mark_thread_read(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_mark_thread_read(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_thread_seen_state(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_thread_seen_state(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_disconnect(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_disconnect(uuid, text) TO authenticated;

-- Old signatures, kept for the applications currently on origin/main.
REVOKE ALL ON FUNCTION public.connect_send_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_send_message(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_list_messages(uuid, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_list_messages(uuid, integer, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_mark_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_mark_thread_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_thread_seen_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_thread_seen_state(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_disconnect(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_disconnect(uuid) TO authenticated;
