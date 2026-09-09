-- MAT-14 Connect V1 lifecycle: terminate active relationships on unclaim / claim removal.
-- admin_reset_employer_layer keeps the claim, so Connect rows remain.

CREATE OR REPLACE FUNCTION public.employer_unclaim_practice(
  p_practice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_link_id uuid;
  v_org_id uuid;
  v_other_managers int;
  v_membership_id uuid;
  v_reason text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT l.id, l.organization_id
  INTO v_link_id, v_org_id
  FROM public.employer_organization_practices AS l
  WHERE l.practice_id = p_practice_id
    AND l.status = 'active'
    AND l.relationship = 'operates'
  LIMIT 1;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'no active operates link for practice' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_admin_organization(v_uid, v_org_id) THEN
    RAISE EXCEPTION 'not authorized to unclaim this practice' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int
  INTO v_other_managers
  FROM public.organization_memberships AS m
  WHERE m.organization_id = v_org_id
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin', 'editor')
    AND m.user_id <> v_uid;

  IF v_other_managers > 0 THEN
    RAISE EXCEPTION
      'Other authorized managers remain on this organization. Unclaim is only available when you are the last manager.'
      USING ERRCODE = '22023';
  END IF;

  v_reason := NULLIF(btrim(p_reason), '');
  IF v_reason IS NULL THEN
    v_reason := 'Employer unclaim';
  END IF;

  PERFORM public._connect_terminate_for_practice(
    p_practice_id, v_uid, 'practice', v_reason
  );

  UPDATE public.employer_organization_practices
  SET
    status = 'inactive',
    inactive_at = now(),
    inactive_reason = v_reason
  WHERE id = v_link_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice link deactivation failed' USING ERRCODE = 'P0002';
  END IF;

  SELECT m.id
  INTO v_membership_id
  FROM public.organization_memberships AS m
  WHERE m.organization_id = v_org_id
    AND m.user_id = v_uid
    AND m.status = 'active';

  IF v_membership_id IS NOT NULL THEN
    UPDATE public.organization_memberships
    SET
      status = 'revoked',
      revoked_at = now(),
      revoked_by = v_uid
    WHERE id = v_membership_id
      AND status = 'active';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_organization_practice_link(
  p_link_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_practice_id uuid;
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT practice_id INTO v_practice_id
  FROM public.employer_organization_practices
  WHERE id = p_link_id
    AND status = 'active';

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'active practice link not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._connect_terminate_for_practice(
    v_practice_id,
    (SELECT auth.uid()),
    'admin',
    COALESCE(NULLIF(btrim(p_reason), ''), 'admin_deactivate_operates_link')
  );

  UPDATE public.employer_organization_practices
  SET
    status = 'inactive',
    inactive_at = now(),
    inactive_reason = NULLIF(btrim(p_reason), '')
  WHERE id = p_link_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active practice link not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

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
  v_connect_terminated integer;
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

  v_connect_terminated := public._connect_terminate_for_practice(
    p_practice_id,
    v_uid,
    'admin',
    COALESCE(NULLIF(btrim(p_reason), ''), 'admin_remove_claim_verification')
  );

  v_profile_cleared := public._admin_clear_employer_profile_public_fields(p_practice_id);
  v_links := public._admin_deactivate_practice_operates_links(p_practice_id, p_reason);

  v_summary := jsonb_build_object(
    'active_org_practice_links_deactivated', v_links,
    'profile_fields_cleared', v_profile_cleared,
    'physician_ready_cleared', COALESCE(v_ready_was, false),
    'practice_access_removed', true,
    'claim_history_preserved', true,
    'layer3_structured_content_preserved', true,
    'memberships_unchanged', true,
    'connect_relationships_terminated', v_connect_terminated
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
  v_connect_terminated integer;
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

  v_connect_terminated := public._connect_terminate_for_practice(
    p_practice_id,
    v_uid,
    'admin',
    COALESCE(NULLIF(btrim(p_reason), ''), 'admin_full_reset_employer_practice')
  );

  v_children := public._admin_delete_employer_layer3_children(p_practice_id);
  v_profile_cleared := public._admin_clear_employer_profile_public_fields(p_practice_id);
  v_links := public._admin_deactivate_practice_operates_links(p_practice_id, p_reason);

  v_summary := v_children || jsonb_build_object(
    'profile_fields_cleared', v_profile_cleared,
    'physician_ready_cleared', COALESCE(v_ready_was, false),
    'active_org_practice_links_deactivated', v_links,
    'verified_relationship_removed', true,
    'claim_history_preserved', true,
    'memberships_unchanged', true,
    'connect_relationships_terminated', v_connect_terminated
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

REVOKE ALL ON FUNCTION public.employer_unclaim_practice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_unclaim_practice(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.deactivate_organization_practice_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_organization_practice_link(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_remove_claim_verification(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_remove_claim_verification(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_full_reset_employer_practice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_full_reset_employer_practice(uuid, text) TO authenticated;
