-- Employer self-service leave and unclaim (V1).
-- Leave revokes caller membership only; unclaim deactivates operates link + revokes caller.
-- Does not delete Layer 3 data or touch CMS tables.

CREATE OR REPLACE FUNCTION public.self_leave_organization(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_membership_id uuid;
  v_manager_count int;
  v_has_active_link boolean;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT m.id
  INTO v_membership_id
  FROM public.organization_memberships AS m
  WHERE m.organization_id = p_organization_id
    AND m.user_id = v_uid
    AND m.status = 'active';

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'no active membership on this organization' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::int
  INTO v_manager_count
  FROM public.organization_memberships AS m
  WHERE m.organization_id = p_organization_id
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin', 'editor');

  SELECT EXISTS (
    SELECT 1
    FROM public.employer_organization_practices AS l
    WHERE l.organization_id = p_organization_id
      AND l.status = 'active'
      AND l.relationship = 'operates'
  )
  INTO v_has_active_link;

  IF v_manager_count = 1 AND v_has_active_link THEN
    RAISE EXCEPTION
      'You are the only authorized manager for a claimed practice. Use Unclaim practice instead of Leave.'
      USING ERRCODE = '22023', HINT = 'use_unclaim_instead';
  END IF;

  UPDATE public.organization_memberships
  SET
    status = 'revoked',
    revoked_at = now(),
    revoked_by = v_uid
  WHERE id = v_membership_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership revoke failed' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

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

REVOKE ALL ON FUNCTION public.self_leave_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employer_unclaim_practice(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.self_leave_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employer_unclaim_practice(uuid, text) TO authenticated;
