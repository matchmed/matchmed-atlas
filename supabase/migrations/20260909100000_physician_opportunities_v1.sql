-- MAT-12: Physician-facing Opportunities (canonical Layer 3 recruiting).
-- Additive: list/count RPCs + overlay hiring-now semantics without employer_leads.
-- Does not mutate employer_leads or convert legacy lead provenance.

-- ---------------------------------------------------------------------------
-- Overlay: hiring_horizon='now' means Hiring now; expose opportunity id.
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

GRANT EXECUTE ON FUNCTION public.public_get_employer_practice_overlay(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Geography helper: states for a practice (employer active locations, else CMS).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._physician_opportunity_practice_states(p_practice_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.employer_practice_locations AS epl
      WHERE epl.practice_id = p_practice_id
        AND epl.status = 'active'
    ) THEN
      COALESCE(
        (
          SELECT array_agg(DISTINCT upper(btrim(epl.state)) ORDER BY upper(btrim(epl.state)))
          FROM public.employer_practice_locations AS epl
          WHERE epl.practice_id = p_practice_id
            AND epl.status = 'active'
            AND nullif(btrim(epl.state), '') IS NOT NULL
        ),
        ARRAY[]::text[]
      )
    ELSE
      COALESCE(
        (
          SELECT array_agg(DISTINCT upper(btrim(pl.state)) ORDER BY upper(btrim(pl.state)))
          FROM public.practice_locations AS pl
          WHERE pl.practice_id = p_practice_id
            AND nullif(btrim(pl.state), '') IS NOT NULL
        ),
        ARRAY[]::text[]
      )
  END;
$$;

REVOKE ALL ON FUNCTION public._physician_opportunity_practice_states(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._physician_opportunity_matches_state(
  p_practice_id uuid,
  p_state text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_state IS NULL OR btrim(p_state) = '' THEN true
    ELSE upper(btrim(p_state)) = ANY (public._physician_opportunity_practice_states(p_practice_id))
  END;
$$;

REVOKE ALL ON FUNCTION public._physician_opportunity_matches_state(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._physician_opportunity_horizon_rank(p_horizon text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_horizon
    WHEN 'now' THEN 1
    WHEN 'within_1_year' THEN 2
    WHEN 'within_2_years' THEN 3
    WHEN 'within_3_to_5_years' THEN 4
    ELSE 5
  END;
$$;

REVOKE ALL ON FUNCTION public._physician_opportunity_horizon_rank(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Physician-safe Opportunity list / count RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_physician_opportunities(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0,
  p_clinical_focus text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_hiring_horizon text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lim integer;
  off integer;
  result jsonb;
BEGIN
  IF NOT (SELECT public.is_atlas_analysis_authorized()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  lim := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  off := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.horizon_rank, x.clinical_focus, x.id), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      o.id,
      o.practice_id,
      COALESCE(nullif(btrim(epp.public_display_name), ''), pr.practice_name) AS practice_name,
      o.clinical_focus,
      o.hiring_horizon,
      public._physician_opportunity_horizon_rank(o.hiring_horizon) AS horizon_rank,
      (o.hiring_horizon = 'now') AS hiring_now,
      o.hiring_notes,
      o.base_compensation_min_usd,
      o.base_compensation_max_usd,
      o.base_compensation_max_is_open_ended,
      o.productivity_structure_available,
      o.signing_bonus_available,
      o.relocation_assistance_available,
      o.last_confirmed_at,
      epp.physician_ready_at,
      public._physician_opportunity_practice_states(o.practice_id) AS practice_states,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object('reason', r.reason, 'other_text', r.other_text)
            ORDER BY r.reason
          )
          FROM public.employer_practice_recruiting_opportunity_reasons AS r
          WHERE r.opportunity_id = o.id
        ),
        '[]'::jsonb
      ) AS reasons,
      CASE
        WHEN epp.physician_ready_at IS NOT NULL THEN
          'Practice-reported · Reviewed ' || to_char(epp.physician_ready_at AT TIME ZONE 'UTC', 'FMMonth YYYY')
        ELSE
          'Practice-reported'
      END AS attribution_label
    FROM public.employer_practice_recruiting_opportunities AS o
    INNER JOIN public.employer_practice_profiles AS epp
      ON epp.practice_id = o.practice_id
    INNER JOIN public.practices AS pr
      ON pr.id = o.practice_id
    WHERE epp.physician_ready_at IS NOT NULL
      AND public.employer_overlay_publicly_visible(o.practice_id)
      AND (
        p_clinical_focus IS NULL
        OR btrim(p_clinical_focus) = ''
        OR o.clinical_focus = p_clinical_focus
      )
      AND (
        p_hiring_horizon IS NULL
        OR btrim(p_hiring_horizon) = ''
        OR o.hiring_horizon = p_hiring_horizon
      )
      AND public._physician_opportunity_matches_state(o.practice_id, p_state)
    ORDER BY
      public._physician_opportunity_horizon_rank(o.hiring_horizon),
      o.clinical_focus,
      o.id
    LIMIT lim
    OFFSET off
  ) AS x;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_physician_opportunities_for_practice(
  p_practice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (SELECT public.is_atlas_analysis_authorized()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.horizon_rank, x.clinical_focus, x.id), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      o.id,
      o.practice_id,
      COALESCE(nullif(btrim(epp.public_display_name), ''), pr.practice_name) AS practice_name,
      o.clinical_focus,
      o.hiring_horizon,
      public._physician_opportunity_horizon_rank(o.hiring_horizon) AS horizon_rank,
      (o.hiring_horizon = 'now') AS hiring_now,
      o.hiring_notes,
      o.base_compensation_min_usd,
      o.base_compensation_max_usd,
      o.base_compensation_max_is_open_ended,
      o.productivity_structure_available,
      o.signing_bonus_available,
      o.relocation_assistance_available,
      o.last_confirmed_at,
      epp.physician_ready_at,
      public._physician_opportunity_practice_states(o.practice_id) AS practice_states,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object('reason', r.reason, 'other_text', r.other_text)
            ORDER BY r.reason
          )
          FROM public.employer_practice_recruiting_opportunity_reasons AS r
          WHERE r.opportunity_id = o.id
        ),
        '[]'::jsonb
      ) AS reasons,
      CASE
        WHEN epp.physician_ready_at IS NOT NULL THEN
          'Practice-reported · Reviewed ' || to_char(epp.physician_ready_at AT TIME ZONE 'UTC', 'FMMonth YYYY')
        ELSE
          'Practice-reported'
      END AS attribution_label
    FROM public.employer_practice_recruiting_opportunities AS o
    INNER JOIN public.employer_practice_profiles AS epp
      ON epp.practice_id = o.practice_id
    INNER JOIN public.practices AS pr
      ON pr.id = o.practice_id
    WHERE o.practice_id = p_practice_id
      AND epp.physician_ready_at IS NOT NULL
      AND public.employer_overlay_publicly_visible(o.practice_id)
    ORDER BY
      public._physician_opportunity_horizon_rank(o.hiring_horizon),
      o.clinical_focus,
      o.id
    LIMIT 50
  ) AS x;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_physician_opportunities(
  p_clinical_focus text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_hiring_horizon text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT (SELECT public.is_atlas_analysis_authorized()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer
  INTO n
  FROM public.employer_practice_recruiting_opportunities AS o
  INNER JOIN public.employer_practice_profiles AS epp
    ON epp.practice_id = o.practice_id
  WHERE epp.physician_ready_at IS NOT NULL
    AND public.employer_overlay_publicly_visible(o.practice_id)
    AND (
      p_clinical_focus IS NULL
      OR btrim(p_clinical_focus) = ''
      OR o.clinical_focus = p_clinical_focus
    )
    AND (
      p_hiring_horizon IS NULL
      OR btrim(p_hiring_horizon) = ''
      OR o.hiring_horizon = p_hiring_horizon
    )
    AND public._physician_opportunity_matches_state(o.practice_id, p_state);

  RETURN COALESCE(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_physician_opportunities(integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_physician_opportunities(integer, integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_physician_opportunities(integer, integer, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_physician_opportunities_for_practice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_physician_opportunities_for_practice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_physician_opportunities_for_practice(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.count_physician_opportunities(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_physician_opportunities(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_physician_opportunities(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.list_physician_opportunities(integer, integer, text, text, text) IS
  'MAT-12 physician Opportunity list over physician-ready Layer 3 recruiting rows. Auth: is_atlas_analysis_authorized.';
COMMENT ON FUNCTION public.count_physician_opportunities(text, text, text) IS
  'MAT-12 physician Opportunity count with the same publication gates as list_physician_opportunities.';
