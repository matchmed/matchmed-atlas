-- Phase 12: public employer Layer 3 overlay RPC + logo storage bucket.
-- Gated by employer_overlay_publicly_visible(); no new anon table grants.

-- =============================================================================
-- Storage bucket (private; RLS on storage.objects)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employer-practice-logos',
  'employer-practice-logos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Editors with can_edit_practice may upload/update/delete their practice logo objects.
CREATE POLICY employer_practice_logos_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employer-practice-logos'
    AND public.can_edit_practice(
      (SELECT auth.uid()),
      (split_part(name, '/', 1))::uuid
    )
  );

CREATE POLICY employer_practice_logos_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'employer-practice-logos'
    AND public.can_edit_practice(
      (SELECT auth.uid()),
      (split_part(name, '/', 1))::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'employer-practice-logos'
    AND public.can_edit_practice(
      (SELECT auth.uid()),
      (split_part(name, '/', 1))::uuid
    )
  );

CREATE POLICY employer_practice_logos_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'employer-practice-logos'
    AND public.can_edit_practice(
      (SELECT auth.uid()),
      (split_part(name, '/', 1))::uuid
    )
  );

CREATE POLICY employer_practice_logos_editor_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employer-practice-logos'
    AND public.can_edit_practice(
      (SELECT auth.uid()),
      (split_part(name, '/', 1))::uuid
    )
  );

-- Public read when verified overlay is visible (anon + authenticated).
CREATE POLICY employer_practice_logos_public_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'employer-practice-logos'
    AND public.employer_overlay_publicly_visible(
      (split_part(name, '/', 1))::uuid
    )
  );

-- =============================================================================
-- Public overlay RPC
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

REVOKE ALL ON FUNCTION public.public_get_employer_practice_overlay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_employer_practice_overlay(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_get_employer_practice_overlay(uuid) TO authenticated;
