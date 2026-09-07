-- Physician-ready V1 — overlay extension + complete_employer_physician_ready.
-- Restores public_display_name on overlay (live/prod drift fix).
-- New recruiting/ownership/infrastructure fields publish only when physician_ready_at IS NOT NULL.
-- No opportunity row-level status: physician_ready_at is the sole public publication gate.

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
  v_ready boolean := false;
  v_outlook text := 'open_to_conversations';
  v_active_focuses text[] := ARRAY[]::text[];
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

  v_reviewed_at := COALESCE(
    v_profile.physician_ready_at,
    v_profile.infrastructure_last_reviewed_at,
    v_profile.roster_last_reviewed_at
  );

  v_ready := v_profile.physician_ready_at IS NOT NULL;

  IF v_ready THEN
    SELECT COALESCE(array_agg(DISTINCT m.clinical_focus), ARRAY[]::text[])
    INTO v_active_focuses
    FROM public.employer_leads AS el
    CROSS JOIN LATERAL unnest(COALESCE(el.subspecialties_interest, ARRAY[]::text[])) AS s(specialty)
    INNER JOIN public.employer_leads_clinical_focus_map AS m
      ON m.lead_specialty = s.specialty
    WHERE el.practice_id = p_practice_id
      AND el.is_published IS TRUE;

    IF EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.practice_id = p_practice_id
        AND o.clinical_focus = ANY (v_active_focuses)
    ) THEN
      v_outlook := 'actively_recruiting';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'visible', true,
    'physician_ready', v_ready,
    'attribution_label', CASE
      WHEN v_reviewed_at IS NOT NULL THEN
        'Practice-reported · Reviewed ' || to_char(v_reviewed_at AT TIME ZONE 'UTC', 'FMMonth YYYY')
      ELSE
        'Practice-reported'
    END,
    'profile', CASE
      WHEN v_profile.practice_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'public_display_name', v_profile.public_display_name,
        'website', v_profile.website,
        'primary_phone', v_profile.primary_phone,
        'recruiting_contact_name', v_profile.recruiting_contact_name,
        'recruiting_email', v_profile.recruiting_email,
        'recruiting_phone', v_profile.recruiting_phone,
        'careers_url', v_profile.careers_url,
        'overview', v_profile.overview,
        'logo_storage_path', v_profile.logo_storage_path,
        'roster_last_reviewed_at', v_profile.roster_last_reviewed_at,
        'physician_ready_at', v_profile.physician_ready_at,
        'physician_fit_description', CASE WHEN v_ready THEN v_profile.physician_fit_description ELSE NULL END,
        'future_practice_description', CASE WHEN v_ready THEN v_profile.future_practice_description ELSE NULL END
      )
    END,
    'ownership', CASE
      WHEN v_ready AND v_profile.practice_ownership_structure IS NOT NULL THEN
        jsonb_build_object(
          'structure', v_profile.practice_ownership_structure,
          'other_text', v_profile.practice_ownership_other_text
        )
      ELSE NULL
    END,
    'recruiting_outlook', CASE
      WHEN v_ready THEN
        jsonb_build_object(
          'status', v_outlook,
          'opportunities', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'clinical_focus', o.clinical_focus,
                  'hiring_horizon', o.hiring_horizon,
                  'hiring_notes', o.hiring_notes,
                  'actively_recruiting_now', (o.clinical_focus = ANY (v_active_focuses)),
                  'base_compensation_min_usd', o.base_compensation_min_usd,
                  'base_compensation_max_usd', o.base_compensation_max_usd,
                  'base_compensation_max_is_open_ended', o.base_compensation_max_is_open_ended,
                  'productivity_structure_available', o.productivity_structure_available,
                  'signing_bonus_available', o.signing_bonus_available,
                  'relocation_assistance_available', o.relocation_assistance_available,
                  'reasons', COALESCE(
                    (
                      SELECT jsonb_agg(
                        jsonb_build_object(
                          'reason', r.reason,
                          'other_text', r.other_text
                        )
                        ORDER BY r.reason
                      )
                      FROM public.employer_practice_recruiting_opportunity_reasons AS r
                      WHERE r.opportunity_id = o.id
                    ),
                    '[]'::jsonb
                  ),
                  'last_confirmed_at', o.last_confirmed_at
                )
                ORDER BY o.clinical_focus
              )
              FROM public.employer_practice_recruiting_opportunities AS o
              WHERE o.practice_id = p_practice_id
            ),
            '[]'::jsonb
          )
        )
      ELSE NULL
    END,
    'infrastructure', CASE
      WHEN v_ready THEN
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'category_slug', c.slug,
                'category_label', c.display_label,
                'review_state', rev.review_state,
                'vendors', COALESCE(
                  (
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'vendor_slug', v.slug,
                        'vendor_label', COALESCE(v.display_label, ei.other_vendor_name),
                        'is_other', (ei.vendor_id IS NULL),
                        'other_vendor_name', ei.other_vendor_name
                      )
                      ORDER BY COALESCE(v.display_label, ei.other_vendor_name)
                    )
                    FROM public.employer_practice_infrastructure AS ei
                    LEFT JOIN public.vendors AS v ON v.id = ei.vendor_id
                    WHERE ei.practice_id = p_practice_id
                      AND ei.category_id = c.id
                  ),
                  '[]'::jsonb
                )
              )
              ORDER BY c.sort_order
            )
            FROM public.infrastructure_categories AS c
            INNER JOIN public.employer_practice_infrastructure_category_reviews AS rev
              ON rev.category_id = c.id
             AND rev.practice_id = p_practice_id
            WHERE c.active
              AND c.physician_facing
          ),
          '[]'::jsonb
        )
      ELSE NULL
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

CREATE OR REPLACE FUNCTION public.complete_employer_physician_ready(p_practice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.employer_practice_profiles%ROWTYPE;
  v_opp_count int;
  v_missing_reasons int;
  v_category_count int;
  v_review_count int;
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

  SELECT * INTO v_profile
  FROM public.employer_practice_profiles
  WHERE practice_id = p_practice_id
  FOR UPDATE;

  IF v_profile.practice_ownership_structure IS NULL THEN
    RAISE EXCEPTION 'ownership structure required' USING ERRCODE = '22023';
  END IF;

  IF v_profile.practice_ownership_structure = 'other'
     AND nullif(btrim(COALESCE(v_profile.practice_ownership_other_text, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ownership other text required' USING ERRCODE = '22023';
  END IF;

  IF v_profile.roster_last_reviewed_at IS NULL THEN
    RAISE EXCEPTION 'physician roster must be reviewed' USING ERRCODE = '22023';
  END IF;

  IF nullif(btrim(COALESCE(v_profile.recruiting_contact_name, '')), '') IS NULL
     OR nullif(btrim(COALESCE(v_profile.recruiting_email, '')), '') IS NULL
     OR nullif(btrim(COALESCE(v_profile.recruiting_phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'recruiting contact name, email, and phone are required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_opp_count
  FROM public.employer_practice_recruiting_opportunities
  WHERE practice_id = p_practice_id;

  IF v_opp_count < 1 THEN
    RAISE EXCEPTION 'at least one recruiting specialty is required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_missing_reasons
  FROM public.employer_practice_recruiting_opportunities AS o
  WHERE o.practice_id = p_practice_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunity_reasons AS r
      WHERE r.opportunity_id = o.id
    );

  IF v_missing_reasons > 0 THEN
    RAISE EXCEPTION 'each recruiting specialty needs at least one reason for opportunity' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_category_count
  FROM public.infrastructure_categories
  WHERE active;

  SELECT count(*) INTO v_review_count
  FROM public.employer_practice_infrastructure_category_reviews AS rev
  INNER JOIN public.infrastructure_categories AS c ON c.id = rev.category_id
  WHERE rev.practice_id = p_practice_id
    AND c.active;

  IF v_review_count < v_category_count THEN
    RAISE EXCEPTION 'every infrastructure category requires an explicit review state' USING ERRCODE = '22023';
  END IF;

  -- vendors_selected must have at least one infrastructure row for that category
  IF EXISTS (
    SELECT 1
    FROM public.employer_practice_infrastructure_category_reviews AS rev
    WHERE rev.practice_id = p_practice_id
      AND rev.review_state = 'vendors_selected'
      AND NOT EXISTS (
        SELECT 1
        FROM public.employer_practice_infrastructure AS ei
        WHERE ei.practice_id = rev.practice_id
          AND ei.category_id = rev.category_id
      )
  ) THEN
    RAISE EXCEPTION 'vendors_selected categories must include at least one vendor or Other entry' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.employer_profile_privileged_write', '1', true);

  UPDATE public.employer_practice_profiles
  SET
    physician_ready_at = COALESCE(physician_ready_at, now()),
    physician_ready_by = COALESCE(physician_ready_by, (SELECT auth.uid())),
    initial_review_completed_at = COALESCE(initial_review_completed_at, now()),
    initial_review_completed_by = COALESCE(initial_review_completed_by, (SELECT auth.uid())),
    infrastructure_last_reviewed_at = COALESCE(infrastructure_last_reviewed_at, now()),
    infrastructure_last_reviewed_by = COALESCE(infrastructure_last_reviewed_by, (SELECT auth.uid())),
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE practice_id = p_practice_id;

  PERFORM set_config('app.employer_profile_privileged_write', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_employer_physician_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_employer_physician_ready(uuid) TO authenticated;

-- Overlay remains executable by anon + authenticated (existing grants).
GRANT EXECUTE ON FUNCTION public.public_get_employer_practice_overlay(uuid) TO anon, authenticated;
