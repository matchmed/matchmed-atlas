-- MAT-16: optional sponsor content imagery + B+L visual enrichment.
-- Additive schema only. Reuses sponsor_vendor_profiles.logo_url for directory/header logos.

ALTER TABLE public.sponsor_vendor_content
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS image_alt text NULL;

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_image_url_len;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_image_url_len
  CHECK (image_url IS NULL OR char_length(btrim(image_url)) BETWEEN 1 AND 500);

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_image_alt_len;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_image_alt_len
  CHECK (image_alt IS NULL OR char_length(btrim(image_alt)) BETWEEN 1 AND 160);

COMMENT ON COLUMN public.sponsor_vendor_content.image_url IS
  'Optional first-party sponsor image URL for card display. Null when no image.';
COMMENT ON COLUMN public.sponsor_vendor_content.image_alt IS
  'Accessible alt text required when image_url is set.';

-- Refresh page RPC to include image fields (active content only; no physician fields).
CREATE OR REPLACE FUNCTION public.get_atlas_sponsor_page(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'slug', v.slug,
    'display_label', v.display_label,
    'short_description', p.short_description,
    'logo_url', p.logo_url,
    'disclosure_text', COALESCE(
      NULLIF(btrim(p.disclosure_text), ''),
      v.display_label || ' is an Atlas industry partner. Partnership does not affect practice scores, rankings, Opportunities, physician visibility, or technology reporting.'
    ),
    'sections', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'section_type', c.section_type,
          'title', c.title,
          'description', c.description,
          'url', c.url,
          'event_date', c.event_date,
          'status_label', c.status_label,
          'cta_label', c.cta_label,
          'sort_order', c.sort_order,
          'image_url', c.image_url,
          'image_alt', c.image_alt
        )
        ORDER BY c.section_sort, c.sort_order, c.title
      )
      FROM (
        SELECT
          sc.section_type,
          CASE sc.section_type
            WHEN 'whats_new' THEN 1
            WHEN 'education' THEN 2
            WHEN 'clinical_evidence' THEN 3
            WHEN 'connect' THEN 4
            WHEN 'training_product_info' THEN 5
            ELSE 99
          END AS section_sort,
          sc.title,
          sc.description,
          sc.url,
          sc.event_date,
          sc.status_label,
          sc.cta_label,
          sc.sort_order,
          sc.image_url,
          sc.image_alt
        FROM public.sponsor_vendor_content AS sc
        WHERE sc.vendor_id = p.vendor_id
          AND sc.is_active = true
      ) AS c
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE v.slug = lower(btrim(p_slug))
    AND p.is_active = true
    AND v.active = true;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_atlas_sponsor_page(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_atlas_sponsor_page(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_atlas_sponsor_page(text) TO authenticated;

-- B+L official logo (colored wordmark from Bausch + Lomb Surgical site).
UPDATE public.sponsor_vendor_profiles AS p
SET
  logo_url = 'https://www.bauschsurgical.com/Assets/BauschSurgical/img/logo.svg',
  updated_at = now()
FROM public.vendors AS v
WHERE p.vendor_id = v.id
  AND v.slug = 'bausch_plus_lomb';

-- Attach imagery only where strong first-party assets exist.
UPDATE public.sponsor_vendor_content AS sc
SET
  image_url = x.image_url,
  image_alt = x.image_alt,
  updated_at = now()
FROM public.vendors AS v
JOIN (
  VALUES
    (
      'whats_new',
      'EyeGility™ Preloaded IOL Delivery System',
      'https://www.bauschsurgical.com/siteassets/img/catract/envista-iol.png',
      'enVista® intraocular lens'
    ),
    (
      'education',
      'ESCRS 2026',
      'https://ecp.bausch.com/siteassets/img/tupcomingcongress.png',
      'Upcoming congress and educational programs'
    ),
    (
      'education',
      'Redefining the Surgical Experience',
      'https://ecp.bausch.com/siteassets/img/educational-grants.png',
      'Bausch + Lomb educational programming'
    ),
    (
      'education',
      'Congress & Educational Programs',
      'https://ecp.bausch.com/siteassets/img/scienceinfocus.png',
      'Scientific and educational resources'
    ),
    (
      'clinical_evidence',
      'Scientific & Medical Resources',
      'https://ecp.bausch.com/siteassets/img/scienceinfocus.png',
      'Scientific and medical resources'
    ),
    (
      'training_product_info',
      'Cataract Surgery',
      'https://www.bauschsurgical.com/siteassets/img/main_manipulated/_ansel_image_cache/envista_aspire_featured_slides.jpg',
      'enVista Aspire™ cataract technology'
    ),
    (
      'training_product_info',
      'Surgical Platforms',
      'https://www.bauschsurgical.com/siteassets/img/main_manipulated/_ansel_image_cache/featured_slide_stellariselite.jpg',
      'Stellaris Elite® surgical platform'
    )
) AS x(section_type, title, image_url, image_alt)
  ON true
WHERE sc.vendor_id = v.id
  AND v.slug = 'bausch_plus_lomb'
  AND sc.section_type = x.section_type
  AND sc.title = x.title;
