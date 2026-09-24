-- Once a Connect relationship has an accepted event, physician identity stays
-- revealed for that relationship after disconnect. responded_at is not used:
-- decline sets it too. Declined or canceled rows with no accepted event stay anonymous.
-- Does not update outbox rows.

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
        WHEN r.status = 'accepted'
          OR EXISTS (
            SELECT 1
            FROM public.connect_relationship_events AS e
            WHERE e.relationship_id = r.id
              AND e.event_type = 'accepted'
          )
        THEN public._connect_unlocked_physician_json(p)
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

REVOKE ALL ON FUNCTION public.connect_list_for_practice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_list_for_practice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.connect_get_physician_profile(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'accepted'
     AND NOT EXISTS (
       SELECT 1
       FROM public.connect_relationship_events AS e
       WHERE e.relationship_id = v_row.id
         AND e.event_type = 'accepted'
     )
  THEN
    RAISE EXCEPTION 'physician profile is locked' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_edit_practice(v_uid, v_row.practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  IF v_profile.id IS NULL OR v_profile.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'physician profile unavailable' USING ERRCODE = 'P0002';
  END IF;

  RETURN public._connect_unlocked_physician_json(v_profile)
    || jsonb_build_object(
      'relationship_id', v_row.id,
      'practice_id', v_row.practice_id,
      'status', v_row.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.connect_get_physician_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_get_physician_profile(uuid) TO authenticated;
