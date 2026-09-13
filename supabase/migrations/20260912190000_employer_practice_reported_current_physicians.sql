-- Layer 3 practice-reported current physician affiliations.
-- Reuses employer_roster_assertions (confirm_current + active/superseded).
-- Does not alter CMS affiliations or Retention Index inputs.

ALTER TABLE public.employer_roster_assertions
  ADD COLUMN IF NOT EXISTS cms_confirmed_at timestamptz NULL;

COMMENT ON COLUMN public.employer_roster_assertions.cms_confirmed_at IS
  'Set when CMS later shows the same physician On roster at this practice. Audit only; does not rewrite CMS.';

-- ---------------------------------------------------------------------------
-- Reconcile: mark active confirm_current assertions when CMS catches up.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employer_reconcile_roster_assertions(p_practice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_count integer := 0;
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employer_roster_assertions AS era
  SET
    cms_confirmed_at = COALESCE(era.cms_confirmed_at, now()),
    updated_at = now()
  WHERE era.practice_id = p_practice_id
    AND era.status = 'active'
    AND era.assertion = 'confirm_current'
    AND era.cms_confirmed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.affiliations AS a
      WHERE a.practice_id = era.practice_id
        AND a.doctor_id = era.doctor_id
        AND public._public_is_current_roster_status(a.status)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.employer_reconcile_roster_assertions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_reconcile_roster_assertions(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Assert physician currently affiliated (no start/end dates).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employer_assert_current_physician(
  p_practice_id uuid,
  p_doctor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_existing_id uuid;
  v_new_id uuid;
  v_affiliation_id uuid;
  v_cms_current boolean := false;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_practice_id IS NULL OR p_doctor_id IS NULL THEN
    RAISE EXCEPTION 'practice_id and doctor_id required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_edit_practice(v_uid, p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctors AS d WHERE d.id = p_doctor_id) THEN
    RAISE EXCEPTION 'physician not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT a.id, public._public_is_current_roster_status(a.status)
  INTO v_affiliation_id, v_cms_current
  FROM public.affiliations AS a
  WHERE a.practice_id = p_practice_id
    AND a.doctor_id = p_doctor_id
  ORDER BY public._public_is_current_roster_status(a.status) DESC, a.last_seen_year_at_org DESC NULLS LAST
  LIMIT 1;

  SELECT era.id
  INTO v_existing_id
  FROM public.employer_roster_assertions AS era
  WHERE era.practice_id = p_practice_id
    AND era.doctor_id = p_doctor_id
    AND era.status = 'active'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.employer_roster_assertions
    SET status = 'superseded', updated_at = now()
    WHERE id = v_existing_id;
  END IF;

  INSERT INTO public.employer_roster_assertions (
    practice_id,
    doctor_id,
    affiliation_id,
    assertion,
    status,
    supersedes_id,
    asserted_by,
    cms_confirmed_at
  ) VALUES (
    p_practice_id,
    p_doctor_id,
    v_affiliation_id,
    'confirm_current',
    'active',
    v_existing_id,
    v_uid,
    CASE WHEN v_cms_current THEN now() ELSE NULL END
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'practice_id', p_practice_id,
    'doctor_id', p_doctor_id,
    'assertion', 'confirm_current',
    'cms_current_at_practice', COALESCE(v_cms_current, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.employer_assert_current_physician(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_assert_current_physician(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Retract active Layer 3 assertion (supersede without replacement).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employer_retract_roster_assertion(
  p_practice_id uuid,
  p_doctor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_existing public.employer_roster_assertions%ROWTYPE;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_practice_id IS NULL OR p_doctor_id IS NULL THEN
    RAISE EXCEPTION 'practice_id and doctor_id required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_edit_practice(v_uid, p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.employer_roster_assertions AS era
  WHERE era.practice_id = p_practice_id
    AND era.doctor_id = p_doctor_id
    AND era.status = 'active'
  LIMIT 1;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'no active assertion' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.employer_roster_assertions
  SET status = 'superseded', updated_at = now()
  WHERE id = v_existing.id;

  RETURN jsonb_build_object(
    'id', v_existing.id,
    'practice_id', p_practice_id,
    'doctor_id', p_doctor_id,
    'status', 'superseded',
    'retracted_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.employer_retract_roster_assertion(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_retract_roster_assertion(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Search Atlas physicians by name or NPI (for add-current flow).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employer_search_physicians_for_roster(
  p_practice_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_q text;
  v_digits text;
  v_limit integer;
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

  v_q := nullif(btrim(COALESCE(p_query, '')), '');
  IF v_q IS NULL OR char_length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));

  RETURN COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.physician_name, x.npi)
      FROM (
        SELECT
          d.id AS doctor_id,
          d.physician_name,
          d.npi,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'practice_id', a.practice_id,
                  'practice_name', p.practice_name,
                  'status', a.status,
                  'city_st', a.city_st,
                  'is_current', public._public_is_current_roster_status(a.status)
                )
                ORDER BY public._public_is_current_roster_status(a.status) DESC, a.last_seen_year_at_org DESC NULLS LAST
              )
              FROM public.affiliations AS a
              LEFT JOIN public.practices AS p ON p.id = a.practice_id
              WHERE a.doctor_id = d.id
                AND public._public_is_current_roster_status(a.status)
            ),
            '[]'::jsonb
          ) AS current_affiliations,
          EXISTS (
            SELECT 1
            FROM public.affiliations AS a2
            WHERE a2.practice_id = p_practice_id
              AND a2.doctor_id = d.id
              AND public._public_is_current_roster_status(a2.status)
          ) AS already_cms_current_here,
          EXISTS (
            SELECT 1
            FROM public.employer_roster_assertions AS era
            WHERE era.practice_id = p_practice_id
              AND era.doctor_id = d.id
              AND era.status = 'active'
              AND era.assertion = 'confirm_current'
          ) AS already_practice_reported_here
        FROM public.doctors AS d
        WHERE (
          (char_length(v_digits) >= 4 AND d.npi LIKE v_digits || '%')
          OR d.physician_name ILIKE '%' || v_q || '%'
        )
        ORDER BY
          CASE WHEN d.npi = v_digits THEN 0 WHEN d.npi LIKE v_digits || '%' THEN 1 ELSE 2 END,
          d.physician_name
        LIMIT v_limit
      ) AS x
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.employer_search_physicians_for_roster(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_search_physicians_for_roster(uuid, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Enrich overlay roster_assertions for merge/provenance (read-time CMS flag).
-- ---------------------------------------------------------------------------
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
    IF EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.practice_id = p_practice_id
        AND o.hiring_horizon = 'now'
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
                  'id', o.id,
                  'clinical_focus', o.clinical_focus,
                  'hiring_horizon', o.hiring_horizon,
                  'hiring_notes', o.hiring_notes,
                  'actively_recruiting_now', (o.hiring_horizon = 'now'),
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
                ORDER BY
                  CASE o.hiring_horizon
                    WHEN 'now' THEN 1
                    WHEN 'within_1_year' THEN 2
                    WHEN 'within_2_years' THEN 3
                    WHEN 'within_3_to_5_years' THEN 4
                    ELSE 5
                  END,
                  o.clinical_focus,
                  o.id
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
              AND rev.review_state = 'vendors_selected'
              AND EXISTS (
                SELECT 1
                FROM public.employer_practice_infrastructure AS ei
                WHERE ei.practice_id = p_practice_id
                  AND ei.category_id = c.id
              )
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
            'npi', d.npi,
            'assertion', era.assertion,
            'asserted_at', era.asserted_at,
            'cms_confirmed_at', era.cms_confirmed_at,
            'cms_current_at_practice', EXISTS (
              SELECT 1
              FROM public.affiliations AS a
              WHERE a.practice_id = era.practice_id
                AND a.doctor_id = era.doctor_id
                AND public._public_is_current_roster_status(a.status)
            )
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

GRANT EXECUTE ON FUNCTION public.public_get_employer_practice_overlay(uuid) TO anon, authenticated;
