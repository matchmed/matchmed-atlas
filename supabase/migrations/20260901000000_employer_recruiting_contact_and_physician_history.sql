-- Employer recruiting contact name + CMS physician history read RPC.
-- No changes to practices, practice_locations, or affiliations source data.

ALTER TABLE public.employer_practice_profiles
  ADD COLUMN IF NOT EXISTS recruiting_contact_name text NULL;

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_recruiting_contact_name_len;

-- NULL is valid; blank/whitespace-only values normalize to NULL via trigger below.
-- Non-null values must already be trimmed and <= 120 characters.
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_recruiting_contact_name_len
    CHECK (
      recruiting_contact_name IS NULL
      OR char_length(recruiting_contact_name) <= 120
    );

CREATE OR REPLACE FUNCTION public._normalize_employer_recruiting_contact_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.recruiting_contact_name IS NOT NULL THEN
    NEW.recruiting_contact_name := nullif(btrim(NEW.recruiting_contact_name), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employer_practice_profiles_normalize_recruiting_contact_name
  ON public.employer_practice_profiles;

CREATE TRIGGER employer_practice_profiles_normalize_recruiting_contact_name
  BEFORE INSERT OR UPDATE OF recruiting_contact_name
  ON public.employer_practice_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._normalize_employer_recruiting_contact_name();

-- =============================================================================
-- Public overlay: expose recruiting contact name when overlay is visible
-- =============================================================================

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
        'website', v_profile.website,
        'primary_phone', v_profile.primary_phone,
        'recruiting_contact_name', v_profile.recruiting_contact_name,
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

-- =============================================================================
-- Employer-authorized CMS physician history (read-only on affiliations)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.employer_get_practice_physician_history(p_practice_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT public.can_edit_practice((SELECT auth.uid()), p_practice_id) THEN '[]'::jsonb
    ELSE COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.is_current_cms_roster DESC, x.physician_name, x.doctor_id)
        FROM (
          SELECT
            a.id AS affiliation_id,
            d.id AS doctor_id,
            d.physician_name,
            a.status AS cms_status,
            public._public_is_current_roster_status(a.status) AS is_current_cms_roster,
            a.first_seen_year_at_org,
            a.last_seen_year_at_org,
            a.tenure_years,
            'cms'::text AS source
          FROM public.affiliations AS a
          INNER JOIN public.doctors AS d ON d.id = a.doctor_id
          WHERE a.practice_id = p_practice_id
        ) AS x
      ),
      '[]'::jsonb
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.employer_get_practice_physician_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_get_practice_physician_history(uuid) TO authenticated;
