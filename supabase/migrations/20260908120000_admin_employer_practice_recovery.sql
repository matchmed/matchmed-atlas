-- Admin practice recovery: Layer 3 reset / remove claim / full reset.
-- Additive. Does not alter CMS, scores, claims history status, or org hierarchy.

-- =============================================================================
-- Audit table (accountability only; counts/flags, no content snapshots)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_employer_layer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  action text NOT NULL,
  reason text NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_employer_layer_events_action_check
    CHECK (action IN (
      'reset_employer_layer',
      'remove_claim_verification',
      'full_reset_employer_practice'
    )),
  CONSTRAINT admin_employer_layer_events_reason_len
    CHECK (reason IS NULL OR char_length(btrim(reason)) <= 500)
);

CREATE INDEX IF NOT EXISTS admin_employer_layer_events_practice_idx
  ON public.admin_employer_layer_events (practice_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS admin_employer_layer_events_admin_idx
  ON public.admin_employer_layer_events (admin_user_id, performed_at DESC);

ALTER TABLE public.admin_employer_layer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_employer_layer_events_select_admin
  ON public.admin_employer_layer_events
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_atlas_admin()));

-- Inserts only via SECURITY DEFINER RPCs (no direct insert policy for authenticated).

REVOKE ALL ON TABLE public.admin_employer_layer_events FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_employer_layer_events FROM anon;
GRANT SELECT ON TABLE public.admin_employer_layer_events TO authenticated;

-- =============================================================================
-- Shared helpers (not granted to clients)
-- =============================================================================

CREATE OR REPLACE FUNCTION public._admin_clear_employer_profile_public_fields(p_practice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cleared integer := 0;
  v_row public.employer_practice_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.employer_practice_profiles
  WHERE practice_id = p_practice_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_cleared :=
    (CASE WHEN v_row.website IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.primary_phone IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.logo_storage_path IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.recruiting_contact_name IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.recruiting_email IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.recruiting_phone IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.careers_url IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.overview IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.physician_fit_description IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.future_practice_description IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.practice_ownership_structure IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.practice_ownership_other_text IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.public_display_name IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.proposed_display_name IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.display_name_proposed_at IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.display_name_proposed_by IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.display_name_reviewed_at IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.display_name_reviewed_by IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.display_name_rejection_reason IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.physician_ready_at IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.physician_ready_by IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.initial_review_completed_at IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.initial_review_completed_by IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.roster_last_reviewed_at IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.roster_last_reviewed_by IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.infrastructure_last_reviewed_at IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN v_row.infrastructure_last_reviewed_by IS NOT NULL THEN 1 ELSE 0 END);

  PERFORM set_config('app.employer_profile_privileged_write', '1', true);

  UPDATE public.employer_practice_profiles
  SET
    website = NULL,
    primary_phone = NULL,
    logo_storage_path = NULL,
    recruiting_contact_name = NULL,
    recruiting_email = NULL,
    recruiting_phone = NULL,
    careers_url = NULL,
    overview = NULL,
    physician_fit_description = NULL,
    future_practice_description = NULL,
    practice_ownership_structure = NULL,
    practice_ownership_other_text = NULL,
    public_display_name = NULL,
    proposed_display_name = NULL,
    display_name_proposed_at = NULL,
    display_name_proposed_by = NULL,
    display_name_reviewed_at = NULL,
    display_name_reviewed_by = NULL,
    display_name_rejection_reason = NULL,
    physician_ready_at = NULL,
    physician_ready_by = NULL,
    initial_review_completed_at = NULL,
    initial_review_completed_by = NULL,
    roster_last_reviewed_at = NULL,
    roster_last_reviewed_by = NULL,
    infrastructure_last_reviewed_at = NULL,
    infrastructure_last_reviewed_by = NULL,
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE practice_id = p_practice_id;

  RETURN v_cleared;
END;
$$;

CREATE OR REPLACE FUNCTION public._admin_delete_employer_layer3_children(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_opp_ids uuid[];
  v_reasons integer := 0;
  v_opps integer := 0;
  v_infra integer := 0;
  v_reviews integer := 0;
  v_locations integer := 0;
  v_assertions integer := 0;
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_opp_ids
  FROM public.employer_practice_recruiting_opportunities
  WHERE practice_id = p_practice_id;

  IF cardinality(v_opp_ids) > 0 THEN
    SELECT count(*)::integer INTO v_reasons
    FROM public.employer_practice_recruiting_opportunity_reasons
    WHERE opportunity_id = ANY (v_opp_ids);
  END IF;

  DELETE FROM public.employer_practice_recruiting_opportunities
  WHERE practice_id = p_practice_id;
  GET DIAGNOSTICS v_opps = ROW_COUNT;

  DELETE FROM public.employer_practice_infrastructure
  WHERE practice_id = p_practice_id;
  GET DIAGNOSTICS v_infra = ROW_COUNT;

  DELETE FROM public.employer_practice_infrastructure_category_reviews
  WHERE practice_id = p_practice_id;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  DELETE FROM public.employer_practice_locations
  WHERE practice_id = p_practice_id;
  GET DIAGNOSTICS v_locations = ROW_COUNT;

  DELETE FROM public.employer_roster_assertions
  WHERE practice_id = p_practice_id;
  GET DIAGNOSTICS v_assertions = ROW_COUNT;

  RETURN jsonb_build_object(
    'recruiting_opportunities_deleted', v_opps,
    'opportunity_reasons_deleted', v_reasons,
    'infrastructure_selections_deleted', v_infra,
    'infrastructure_reviews_deleted', v_reviews,
    'employer_locations_deleted', v_locations,
    'roster_assertions_deleted', v_assertions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._admin_deactivate_practice_operates_links(
  p_practice_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.employer_organization_practices
  SET
    status = 'inactive',
    inactive_at = now(),
    inactive_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Admin remove claim / verification')
  WHERE practice_id = p_practice_id
    AND status = 'active'
    AND relationship = 'operates';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_clear_employer_profile_public_fields(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._admin_delete_employer_layer3_children(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._admin_deactivate_practice_operates_links(uuid, text) FROM PUBLIC;

-- =============================================================================
-- Action 1: Clear practice-reported data (wipe Layer 3; keep claim/verification)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_employer_layer(
  p_practice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_children jsonb;
  v_profile_cleared integer;
  v_ready_was boolean;
  v_summary jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.practices WHERE id = p_practice_id) THEN
    RAISE EXCEPTION 'practice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT physician_ready_at IS NOT NULL
  INTO v_ready_was
  FROM public.employer_practice_profiles
  WHERE practice_id = p_practice_id;

  v_children := public._admin_delete_employer_layer3_children(p_practice_id);
  v_profile_cleared := public._admin_clear_employer_profile_public_fields(p_practice_id);

  v_summary := v_children || jsonb_build_object(
    'profile_fields_cleared', v_profile_cleared,
    'physician_ready_cleared', COALESCE(v_ready_was, false),
    'claim_relationship_preserved', true
  );

  INSERT INTO public.admin_employer_layer_events (
    admin_user_id, practice_id, action, reason, summary
  ) VALUES (
    v_uid,
    p_practice_id,
    'reset_employer_layer',
    NULLIF(btrim(p_reason), ''),
    v_summary
  );

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'success', true
  ) || v_summary;
END;
$$;

-- =============================================================================
-- Action 2: Remove claim / verification (Option B profile clear; keep children)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_remove_claim_verification(
  p_practice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_links integer;
  v_profile_cleared integer;
  v_ready_was boolean;
  v_summary jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.practices WHERE id = p_practice_id) THEN
    RAISE EXCEPTION 'practice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT physician_ready_at IS NOT NULL
  INTO v_ready_was
  FROM public.employer_practice_profiles
  WHERE practice_id = p_practice_id;

  -- Option B: clear public-facing profile state so stale content cannot auto-resurface.
  v_profile_cleared := public._admin_clear_employer_profile_public_fields(p_practice_id);

  -- Deactivate operates link(s) only; do not revoke memberships or rewrite claims.
  v_links := public._admin_deactivate_practice_operates_links(p_practice_id, p_reason);

  v_summary := jsonb_build_object(
    'active_org_practice_links_deactivated', v_links,
    'profile_fields_cleared', v_profile_cleared,
    'physician_ready_cleared', COALESCE(v_ready_was, false),
    'practice_access_removed', true,
    'claim_history_preserved', true,
    'layer3_structured_content_preserved', true,
    'memberships_unchanged', true
  );

  INSERT INTO public.admin_employer_layer_events (
    admin_user_id, practice_id, action, reason, summary
  ) VALUES (
    v_uid,
    p_practice_id,
    'remove_claim_verification',
    NULLIF(btrim(p_reason), ''),
    v_summary
  );

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'success', true
  ) || v_summary;
END;
$$;

-- =============================================================================
-- Action 3: Full reset (wipe Layer 3 + remove claim/verification)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_full_reset_employer_practice(
  p_practice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_children jsonb;
  v_profile_cleared integer;
  v_links integer;
  v_ready_was boolean;
  v_summary jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.practices WHERE id = p_practice_id) THEN
    RAISE EXCEPTION 'practice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT physician_ready_at IS NOT NULL
  INTO v_ready_was
  FROM public.employer_practice_profiles
  WHERE practice_id = p_practice_id;

  v_children := public._admin_delete_employer_layer3_children(p_practice_id);
  v_profile_cleared := public._admin_clear_employer_profile_public_fields(p_practice_id);
  v_links := public._admin_deactivate_practice_operates_links(p_practice_id, p_reason);

  v_summary := v_children || jsonb_build_object(
    'profile_fields_cleared', v_profile_cleared,
    'physician_ready_cleared', COALESCE(v_ready_was, false),
    'active_org_practice_links_deactivated', v_links,
    'verified_relationship_removed', true,
    'claim_history_preserved', true,
    'memberships_unchanged', true
  );

  INSERT INTO public.admin_employer_layer_events (
    admin_user_id, practice_id, action, reason, summary
  ) VALUES (
    v_uid,
    p_practice_id,
    'full_reset_employer_practice',
    NULLIF(btrim(p_reason), ''),
    v_summary
  );

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'success', true
  ) || v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_employer_layer(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_remove_claim_verification(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_full_reset_employer_practice(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_reset_employer_layer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_claim_verification(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_full_reset_employer_practice(uuid, text) TO authenticated;
