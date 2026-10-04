-- MAT-26 follow-up. Ship together with 20261003170000_sponsor_publication_v1.sql.
-- The first migration creates the brief tables and keeps them unreadable by
-- authenticated callers. This migration adds the only admin read used by the
-- Atlas publication boundary. It does not grant table access.

CREATE OR REPLACE FUNCTION public.admin_get_brief_publication_candidate(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._require_sponsor_admin();
  IF p_revision_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'revision_id', r.id,
    'publication_state', r.publication_state,
    'published_at', r.published_at,
    'public_sharing_enabled', r.public_sharing_enabled,
    'logo_url', p.logo_url,
    'pdf_asset_path', r.pdf_asset_path,
    'pdf_external_url', CASE
      WHEN r.pdf_asset_path IS NOT NULL AND r.pdf_asset_path ~* '^https://' THEN r.pdf_asset_path
      ELSE NULL
    END,
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'position', bi.position,
          'source_url', bi.source_url,
          'cta_url', bi.cta_url
        )
        ORDER BY bi.position
      )
      FROM public.sponsor_brief_items AS bi
      WHERE bi.revision_id = r.id
        AND bi.included_publicly = true
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.sponsor_brief_revisions AS r
  JOIN public.sponsor_brief_issues AS i ON i.id = r.issue_id
  JOIN public.sponsor_vendor_profiles AS p ON p.vendor_id = r.vendor_id
  WHERE r.id = p_revision_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_brief_publication_candidate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_brief_publication_candidate(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_get_brief_publication_candidate(uuid) IS
  'Admin-only brief publication candidate. Requires 20261003170000_sponsor_publication_v1.sql. Both migrations ship together.';

-- Preview gains the stored publication time so an admin can see a future
-- brief is scheduled. This does not change who can publish or what is public.
CREATE OR REPLACE FUNCTION public.admin_get_sponsor_preview(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT jsonb_build_object(
    'slug', p.public_slug,
    'vendor_slug', v.slug,
    'display_label', v.display_label,
    'is_active', p.is_active,
    'directory_visible', p.directory_visible,
    'atlas_enabled', p.atlas_enabled,
    'employers_enabled', p.employers_enabled,
    'content', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'publication_state', c.publication_state,
        'audience', c.audience,
        'verification_state', c.verification_state,
        'url', c.url
      ) ORDER BY c.revision_number, c.title)
      FROM public.sponsor_vendor_content AS c
      WHERE c.vendor_id = p.vendor_id
    ), '[]'::jsonb),
    'briefs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'issue_slug', i.issue_slug,
        'revision_number', r.revision_number,
        'title', r.title,
        'publication_state', r.publication_state,
        'published_at', r.published_at,
        'public_sharing_enabled', r.public_sharing_enabled
      ) ORDER BY i.issue_slug, r.revision_number)
      FROM public.sponsor_brief_revisions AS r
      JOIN public.sponsor_brief_issues AS i ON i.id = r.issue_id
      WHERE r.vendor_id = p.vendor_id
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.public_slug = lower(btrim(COALESCE(p_slug, '')));
  RETURN result;
END;
$$;
