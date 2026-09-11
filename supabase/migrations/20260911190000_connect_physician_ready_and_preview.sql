-- Physician-Ready required for Connect eligibility + employer practice preview tokens.
-- Does not delete Connect history. Existing accepted relationships remain readable via
-- connect_list_for_practice / connect_get_physician_profile (those do not use is_eligible).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.connect_practice_is_eligible(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_practice_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.employer_organization_practices AS l
      INNER JOIN public.employer_organizations AS o
        ON o.id = l.organization_id
      INNER JOIN public.employer_practice_profiles AS epp
        ON epp.practice_id = l.practice_id
      WHERE l.practice_id = p_practice_id
        AND l.status = 'active'
        AND l.relationship = 'operates'
        AND o.status = 'verified'
        AND o.archived_at IS NULL
        AND epp.physician_ready_at IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.organization_memberships AS m
          WHERE m.organization_id = l.organization_id
            AND m.status = 'active'
            AND m.role IN ('owner', 'admin', 'editor')
        )
    )
  END;
$$;

COMMENT ON FUNCTION public.connect_practice_is_eligible(uuid) IS
  'Verified org operates link + active editor membership + physician_ready_at set.';

-- Membership edit check without requiring auth.uid() == p_user_id (for token redeem).
CREATE OR REPLACE FUNCTION public._employer_membership_can_edit_practice(
  p_user_id uuid,
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_practice_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.employer_organization_practices AS l
      INNER JOIN public.organization_memberships AS m
        ON m.organization_id = l.organization_id
      WHERE l.practice_id = p_practice_id
        AND l.status = 'active'
        AND l.relationship = 'operates'
        AND m.user_id = p_user_id
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'editor')
        AND (
          m.organization_id = l.organization_id
          OR (
            m.scope = 'organization_and_descendants'
            AND l.organization_id IN (SELECT public._organization_descendant_ids(m.organization_id))
          )
        )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public._employer_membership_can_edit_practice(uuid, uuid) FROM PUBLIC;

-- Short-lived preview tokens for cross-app physician-facing practice preview.
CREATE TABLE IF NOT EXISTS public.employer_practice_preview_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employer_practice_preview_tokens_practice_idx
  ON public.employer_practice_preview_tokens (practice_id, expires_at DESC);

ALTER TABLE public.employer_practice_preview_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.employer_practice_preview_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.employer_practice_preview_tokens FROM anon;
REVOKE ALL ON TABLE public.employer_practice_preview_tokens FROM authenticated;

CREATE OR REPLACE FUNCTION public.employer_create_practice_preview_token(p_practice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_raw text;
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

  v_raw := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.employer_practice_preview_tokens (token_hash, practice_id, user_id, expires_at)
  VALUES (
    encode(extensions.digest(v_raw, 'sha256'), 'hex'),
    p_practice_id,
    v_uid,
    now() + interval '15 minutes'
  );

  DELETE FROM public.employer_practice_preview_tokens
  WHERE expires_at < now() - interval '1 day';

  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.employer_fetch_practice_preview(
  p_token text,
  p_practice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
  v_row public.employer_practice_preview_tokens%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_affiliations jsonb;
  v_locations jsonb;
  v_overlay jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'invalid preview token' USING ERRCODE = '42501';
  END IF;

  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_row
  FROM public.employer_practice_preview_tokens AS t
  WHERE t.token_hash = v_hash
    AND t.practice_id = p_practice_id
    AND t.expires_at > now()
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'preview token expired or invalid' USING ERRCODE = '42501';
  END IF;

  IF NOT public._employer_membership_can_edit_practice(v_row.user_id, p_practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_practice FROM public.practices WHERE id = p_practice_id;
  IF v_practice.id IS NULL THEN
    RAISE EXCEPTION 'practice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.last_seen_year_at_org DESC NULLS LAST, x.id), '[]'::jsonb)
  INTO v_affiliations
  FROM (
    SELECT
      a.id,
      a.npi,
      a.status,
      a.first_seen_year_at_org,
      a.last_seen_year_at_org,
      a.tenure_years,
      a.grad_yr,
      jsonb_build_object(
        'id', d.id,
        'physician_name', d.physician_name,
        'npi', d.npi
      ) AS doctors
    FROM public.affiliations AS a
    LEFT JOIN public.doctors AS d ON d.id = a.doctor_id
    WHERE a.practice_id = p_practice_id
  ) AS x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.doctor_count DESC NULLS LAST), '[]'::jsonb)
  INTO v_locations
  FROM (
    SELECT
      pl.id,
      pl.address,
      pl.city,
      pl.state,
      pl.zip,
      pl.latitude,
      pl.longitude,
      pl.doctor_count,
      pl.rank_by_doctors
    FROM public.practice_locations AS pl
    WHERE pl.practice_id = p_practice_id
  ) AS x;

  v_overlay := public.public_get_employer_practice_overlay(p_practice_id);

  RETURN jsonb_build_object(
    'practice', jsonb_build_object(
      'id', v_practice.id,
      'practice_name', v_practice.practice_name,
      'city_st', v_practice.city_st,
      'phone', v_practice.phone,
      'website', v_practice.website,
      'retention_score', v_practice.retention_score,
      'retention_score_delta', v_practice.retention_score_delta,
      'experience_level', v_practice.experience_level,
      'experience_level_delta', v_practice.experience_level_delta,
      'latest_roster_size', v_practice.latest_roster_size,
      'total_physicians_all_time', v_practice.total_physicians_all_time,
      'short_tenure_departure_count', v_practice.short_tenure_departure_count,
      'med_yrs_grad', v_practice.med_yrs_grad,
      'veteran_count', v_practice.veteran_count,
      'tenure_0_1', v_practice.tenure_0_1,
      'tenure_2_3', v_practice.tenure_2_3,
      'tenure_4_5', v_practice.tenure_4_5,
      'tenure_6_7', v_practice.tenure_6_7,
      'tenure_8_plus', v_practice.tenure_8_plus,
      'org_pac_id', v_practice.org_pac_id
    ),
    'affiliations', COALESCE(v_affiliations, '[]'::jsonb),
    'locations', COALESCE(v_locations, '[]'::jsonb),
    'overlay', v_overlay,
    'preview', jsonb_build_object(
      'issued_for_user_id', v_row.user_id,
      'expires_at', v_row.expires_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.employer_create_practice_preview_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_create_practice_preview_token(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.employer_fetch_practice_preview(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_fetch_practice_preview(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.employer_fetch_practice_preview(text, uuid) TO authenticated;

-- Preserve consent-migration initiate body; add physician-ready error before eligibility.
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.employer_practice_profiles AS epp
    WHERE epp.practice_id = p_practice_id
      AND epp.physician_ready_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Practice profile must be physician-ready before connecting with physicians.'
      USING ERRCODE = '22023';
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
