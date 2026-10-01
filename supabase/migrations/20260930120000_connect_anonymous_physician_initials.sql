-- Anonymous physician JSON gains a server-derived initials string.
-- Full names stay on the profile row and on the unlocked identity payload.
-- training_status remains a discovery filter argument, not an anonymous response field.

CREATE OR REPLACE FUNCTION public._connect_physician_initials(p_first text, p_last text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN first_ch IS NULL AND last_ch IS NULL THEN '?'
    ELSE coalesce(first_ch, '') || coalesce(last_ch, '')
  END
  FROM (
    SELECT
      nullif(upper(substring(btrim(coalesce(p_first, '')) FROM 1 FOR 1)), '') AS first_ch,
      nullif(upper(substring(btrim(coalesce(p_last, '')) FROM 1 FOR 1)), '') AS last_ch
  ) AS parts;
$$;

REVOKE ALL ON FUNCTION public._connect_physician_initials(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_physician_initials(text, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._connect_anonymous_physician_json(p_profile public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'physician_profile_id', p_profile.id,
    'initials', public._connect_physician_initials(p_profile.first_name, p_profile.last_name),
    'clinical_focus', to_jsonb(p_profile.clinical_focus),
    'preferred_state', to_jsonb(p_profile.preferred_state),
    'start_year', p_profile.start_year,
    'practice_setting_preference', to_jsonb(p_profile.practice_setting_preference)
  );
$$;

CREATE OR REPLACE FUNCTION public.connect_list_anonymous_physicians(
  p_practice_id uuid,
  p_clinical_focus text DEFAULT NULL,
  p_preferred_state text DEFAULT NULL,
  p_training_status text DEFAULT NULL,
  p_start_year text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  lim integer;
  off integer;
  v_result jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public.connect_practice_is_eligible(p_practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  lim := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  off := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.physician_profile_id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      public._connect_anonymous_physician_json(p) AS payload,
      p.id AS physician_profile_id
    FROM public.profiles AS p
    WHERE p.user_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.onboarding_complete IS TRUE
      AND p.data_sharing IS TRUE
      AND (
        p_clinical_focus IS NULL
        OR p_clinical_focus = ANY (COALESCE(p.clinical_focus, ARRAY[]::text[]))
      )
      AND (
        p_preferred_state IS NULL
        OR p_preferred_state = ANY (COALESCE(p.preferred_state, ARRAY[]::text[]))
      )
      AND (
        p_training_status IS NULL
        OR p.training_status = p_training_status
      )
      AND (
        p_start_year IS NULL
        OR p.start_year::text = p_start_year
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.connect_relationships AS r
        WHERE r.physician_profile_id = p.id
          AND r.practice_id = p_practice_id
          AND r.status IN ('pending', 'accepted')
      )
    ORDER BY p.id
    LIMIT lim
    OFFSET off
  ) AS item;

  RETURN v_result;
END;
$$;
