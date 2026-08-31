-- Employer initial review completion + MatchMed-gated public display name.
-- practices.practice_name remains immutable CMS/source data.

ALTER TABLE public.employer_practice_profiles
  ADD COLUMN IF NOT EXISTS initial_review_completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS initial_review_completed_by uuid NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS public_display_name text NULL,
  ADD COLUMN IF NOT EXISTS proposed_display_name text NULL,
  ADD COLUMN IF NOT EXISTS display_name_proposed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS display_name_proposed_by uuid NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS display_name_reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS display_name_reviewed_by uuid NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS display_name_rejection_reason text NULL;

COMMENT ON COLUMN public.employer_practice_profiles.initial_review_completed_at IS
  'Set when the verified employer completes the first guided review of current-state Layer 3 fields.';
COMMENT ON COLUMN public.employer_practice_profiles.public_display_name IS
  'MatchMed-approved public display override. NULL uses practices.practice_name.';
COMMENT ON COLUMN public.employer_practice_profiles.proposed_display_name IS
  'Employer-proposed display name awaiting MatchMed approval.';

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_public_display_name_len;
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_public_display_name_len
  CHECK (public_display_name IS NULL OR (char_length(btrim(public_display_name)) BETWEEN 2 AND 120));

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_proposed_display_name_len;
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_proposed_display_name_len
  CHECK (proposed_display_name IS NULL OR (char_length(btrim(proposed_display_name)) BETWEEN 2 AND 120));

-- Block direct mutation of MatchMed-governed columns by non-admins.
CREATE OR REPLACE FUNCTION public.enforce_employer_practice_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.employer_profile_privileged_write', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.is_atlas_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.public_display_name IS DISTINCT FROM OLD.public_display_name THEN
      RAISE EXCEPTION 'not authorized to set public_display_name' USING ERRCODE = '42501';
    END IF;
    IF NEW.proposed_display_name IS DISTINCT FROM OLD.proposed_display_name
       OR NEW.display_name_proposed_at IS DISTINCT FROM OLD.display_name_proposed_at
       OR NEW.display_name_proposed_by IS DISTINCT FROM OLD.display_name_proposed_by THEN
      RAISE EXCEPTION 'use propose_employer_display_name' USING ERRCODE = '42501';
    END IF;
    IF NEW.display_name_reviewed_at IS DISTINCT FROM OLD.display_name_reviewed_at
       OR NEW.display_name_reviewed_by IS DISTINCT FROM OLD.display_name_reviewed_by
       OR NEW.display_name_rejection_reason IS DISTINCT FROM OLD.display_name_rejection_reason THEN
      RAISE EXCEPTION 'not authorized to modify display name review fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.initial_review_completed_at IS DISTINCT FROM OLD.initial_review_completed_at
       OR NEW.initial_review_completed_by IS DISTINCT FROM OLD.initial_review_completed_by THEN
      RAISE EXCEPTION 'use complete_employer_initial_review' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employer_practice_profiles_privileged_columns
  ON public.employer_practice_profiles;

CREATE TRIGGER employer_practice_profiles_privileged_columns
  BEFORE UPDATE ON public.employer_practice_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_employer_practice_profile_privileged_columns();

CREATE OR REPLACE FUNCTION public.propose_employer_display_name(
  p_practice_id uuid,
  p_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice((SELECT auth.uid()), p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_trimmed := btrim(p_name);
  IF v_trimmed IS NULL OR char_length(v_trimmed) < 2 OR char_length(v_trimmed) > 120 THEN
    RAISE EXCEPTION 'display name must be 2-120 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.employer_practice_profiles (practice_id)
  VALUES (p_practice_id)
  ON CONFLICT (practice_id) DO NOTHING;

  PERFORM set_config('app.employer_profile_privileged_write', '1', true);

  UPDATE public.employer_practice_profiles
  SET
    proposed_display_name = v_trimmed,
    display_name_proposed_at = now(),
    display_name_proposed_by = (SELECT auth.uid()),
    display_name_rejection_reason = NULL,
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE practice_id = p_practice_id;

  PERFORM set_config('app.employer_profile_privileged_write', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_employer_initial_review(p_practice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice((SELECT auth.uid()), p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.employer_practice_profiles (practice_id)
  VALUES (p_practice_id)
  ON CONFLICT (practice_id) DO NOTHING;

  PERFORM set_config('app.employer_profile_privileged_write', '1', true);

  UPDATE public.employer_practice_profiles
  SET
    initial_review_completed_at = now(),
    initial_review_completed_by = (SELECT auth.uid()),
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE practice_id = p_practice_id
    AND initial_review_completed_at IS NULL;

  PERFORM set_config('app.employer_profile_privileged_write', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_employer_display_name(p_practice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proposed text;
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT btrim(ep.proposed_display_name) INTO v_proposed
  FROM public.employer_practice_profiles AS ep
  WHERE ep.practice_id = p_practice_id
  FOR UPDATE;

  IF v_proposed IS NULL OR v_proposed = '' THEN
    RAISE EXCEPTION 'no proposed display name' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.employer_profile_privileged_write', '1', true);

  UPDATE public.employer_practice_profiles
  SET
    public_display_name = v_proposed,
    proposed_display_name = NULL,
    display_name_reviewed_at = now(),
    display_name_reviewed_by = (SELECT auth.uid()),
    display_name_rejection_reason = NULL,
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE practice_id = p_practice_id;

  PERFORM set_config('app.employer_profile_privileged_write', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_employer_display_name(
  p_practice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.employer_profile_privileged_write', '1', true);

  UPDATE public.employer_practice_profiles
  SET
    proposed_display_name = NULL,
    display_name_reviewed_at = now(),
    display_name_reviewed_by = (SELECT auth.uid()),
    display_name_rejection_reason = NULLIF(btrim(p_reason), ''),
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE practice_id = p_practice_id
    AND proposed_display_name IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no pending display name proposal' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.employer_profile_privileged_write', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.propose_employer_display_name(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_employer_initial_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_employer_display_name(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_employer_display_name(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.propose_employer_display_name(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_employer_initial_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_employer_display_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_employer_display_name(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_get_employer_practice_overlay(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.employer_practice_profiles%ROWTYPE;
  v_reviewed_at timestamptz;
BEGIN
  IF p_practice_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.employer_overlay_publicly_visible(p_practice_id) THEN
    RETURN jsonb_build_object('visible', false);
  END IF;

  SELECT *
  INTO v_profile
  FROM public.employer_practice_profiles AS ep
  WHERE ep.practice_id = p_practice_id;

  v_reviewed_at := v_profile.roster_last_reviewed_at;

  RETURN jsonb_build_object(
    'visible', true,
    'attribution_label', CASE
      WHEN v_reviewed_at IS NOT NULL THEN
        'Reported by practice, ' || to_char(v_reviewed_at AT TIME ZONE 'UTC', 'FMMonth YYYY')
      ELSE
        'Reported by practice'
    END,
    'profile', CASE
      WHEN v_profile.practice_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'public_display_name', v_profile.public_display_name,
        'website', v_profile.website,
        'primary_phone', v_profile.primary_phone,
        'recruiting_email', v_profile.recruiting_email,
        'recruiting_phone', v_profile.recruiting_phone,
        'careers_url', v_profile.careers_url,
        'overview', v_profile.overview,
        'logo_storage_path', v_profile.logo_storage_path,
        'roster_last_reviewed_at', v_profile.roster_last_reviewed_at
      )
    END,
    'locations', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', el.id,
            'status', el.status,
            'address', el.address,
            'city', el.city,
            'state', el.state,
            'zip', el.zip,
            'phone', el.phone,
            'is_primary', el.is_primary
          )
          ORDER BY el.is_primary DESC, el.city, el.id
        )
        FROM public.employer_practice_locations AS el
        WHERE el.practice_id = p_practice_id
          AND el.status = 'active'
      ),
      '[]'::jsonb
    ),
    'roster_assertions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'doctor_id', era.doctor_id,
            'physician_name', d.physician_name,
            'assertion', era.assertion
          )
          ORDER BY d.physician_name, era.doctor_id
        )
        FROM public.employer_roster_assertions AS era
        INNER JOIN public.doctors AS d ON d.id = era.doctor_id
        WHERE era.practice_id = p_practice_id
          AND era.status = 'active'
      ),
      '[]'::jsonb
    )
  );
END;
$$;
