-- Connect uses the existing practice/industry contact consent as its source of truth.
-- Owner approved consolidating consent; no profile values are backfilled here.
-- Keep legacy JSON keys for existing employer clients, sourced from data_sharing.
-- CREATE OR REPLACE preserves function signatures and existing EXECUTE grants.

COMMENT ON COLUMN public.profiles.open_to_practice_connections IS
  'Legacy compatibility column; Connect consent is controlled by data_sharing. Not synchronized.';

CREATE OR REPLACE FUNCTION public._connect_anonymous_physician_json(p_profile public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'physician_profile_id', p_profile.id,
    'training_status', p_profile.training_status,
    'clinical_focus', to_jsonb(p_profile.clinical_focus),
    'preferred_state', to_jsonb(p_profile.preferred_state),
    'start_year', p_profile.start_year,
    'practice_setting_preference', to_jsonb(p_profile.practice_setting_preference),
    'open_to_practice_connections', p_profile.data_sharing
  );
$$;

CREATE OR REPLACE FUNCTION public._connect_unlocked_physician_json(p_profile public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'physician_profile_id', p_profile.id,
    'first_name', p_profile.first_name,
    'last_name', p_profile.last_name,
    'email', p_profile.email,
    'phone', p_profile.phone,
    'npi', p_profile.npi,
    'npi_verified', p_profile.npi_verified,
    'training_status', p_profile.training_status,
    'clinical_focus', to_jsonb(p_profile.clinical_focus),
    'preferred_state', to_jsonb(p_profile.preferred_state),
    'start_year', p_profile.start_year,
    'practice_setting_preference', to_jsonb(p_profile.practice_setting_preference),
    'current_practice', p_profile.current_practice,
    'procedures_performed', to_jsonb(p_profile.procedures_performed),
    'procedures_desired', to_jsonb(p_profile.procedures_desired),
    'open_to_practice_connections', p_profile.data_sharing
  );
$$;

CREATE OR REPLACE FUNCTION public.connect_initiate_by_practice(
  p_practice_id uuid,
  p_physician_profile_id uuid,
  p_opportunity_id uuid DEFAULT NULL
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

  IF NOT public.connect_practice_is_eligible(p_practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_target
  FROM public.profiles AS p
  WHERE p.id = p_physician_profile_id;

  IF v_target.id IS NULL
     OR v_target.user_id IS NULL
     OR v_target.deleted_at IS NOT NULL
     OR v_target.onboarding_complete IS NOT TRUE THEN
    RAISE EXCEPTION 'physician is not eligible' USING ERRCODE = '22023';
  END IF;

  IF v_target.data_sharing IS NOT TRUE THEN
    RAISE EXCEPTION 'Physician is not open to professional connections.' USING ERRCODE = '22023';
  END IF;

  PERFORM public._connect_validate_opportunity(p_opportunity_id, p_practice_id);

  IF EXISTS (
    SELECT 1
    FROM public.connect_relationships AS r
    WHERE r.physician_profile_id = p_physician_profile_id
      AND r.practice_id = p_practice_id
      AND r.status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'active Connect relationship already exists' USING ERRCODE = '23505';
  END IF;

  v_org_id := public._connect_active_organization_id(p_practice_id);

  INSERT INTO public.connect_relationships (
    physician_profile_id,
    practice_id,
    organization_id,
    initiator_side,
    initiated_by_user_id,
    status,
    opportunity_id
  ) VALUES (
    p_physician_profile_id,
    p_practice_id,
    v_org_id,
    'practice',
    v_uid,
    'pending',
    p_opportunity_id
  )
  RETURNING id INTO v_id;

  PERFORM public._connect_record_event(
    v_id,
    'requested',
    v_uid,
    'practice',
    jsonb_build_object('opportunity_id', p_opportunity_id)
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'pending',
    'initiator_side', 'practice',
    'practice_id', p_practice_id,
    'physician_profile_id', p_physician_profile_id
  );
END;
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

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.physician_profile_id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      p.id AS physician_profile_id,
      p.training_status,
      p.clinical_focus,
      p.preferred_state,
      p.start_year,
      p.practice_setting_preference
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
  ) AS x;

  RETURN v_result;
END;
$$;
