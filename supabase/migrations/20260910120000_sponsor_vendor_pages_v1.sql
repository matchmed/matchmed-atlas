-- MAT-16: Sponsor vendor pages (Atlas industry partnership surface).
-- Additive only. Does not alter practice technology selections, scoring, Opportunities, or Connect.
-- Sponsorship enriches a vendor destination; it does not create practice–vendor relationships.

-- ---------------------------------------------------------------------------
-- Sponsor profile (1:1 with vendors)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_vendor_profiles (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  short_description text NULL,
  logo_url text NULL,
  disclosure_text text NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_vendor_profiles_short_description_len
    CHECK (short_description IS NULL OR char_length(btrim(short_description)) BETWEEN 1 AND 400),
  CONSTRAINT sponsor_vendor_profiles_logo_url_len
    CHECK (logo_url IS NULL OR char_length(btrim(logo_url)) BETWEEN 1 AND 500),
  CONSTRAINT sponsor_vendor_profiles_disclosure_len
    CHECK (disclosure_text IS NULL OR char_length(btrim(disclosure_text)) BETWEEN 1 AND 600)
);

COMMENT ON TABLE public.sponsor_vendor_profiles IS
  'MAT-16 paying sponsor status and page header metadata. Keyed by vendors.id. Independent of practice technology selections.';

CREATE INDEX IF NOT EXISTS sponsor_vendor_profiles_active_sort_idx
  ON public.sponsor_vendor_profiles (is_active, sort_order, vendor_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Sponsor page content rows (five section types)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_vendor_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.sponsor_vendor_profiles(vendor_id) ON DELETE CASCADE,
  section_type text NOT NULL
    CHECK (section_type IN (
      'whats_new',
      'education',
      'clinical_evidence',
      'connect',
      'training_product_info'
    )),
  title text NOT NULL,
  description text NULL,
  url text NULL,
  event_date date NULL,
  status_label text NULL,
  cta_label text NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_vendor_content_title_len
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT sponsor_vendor_content_description_len
    CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 1 AND 800),
  CONSTRAINT sponsor_vendor_content_url_len
    CHECK (url IS NULL OR char_length(btrim(url)) BETWEEN 1 AND 500),
  CONSTRAINT sponsor_vendor_content_status_label_len
    CHECK (status_label IS NULL OR char_length(btrim(status_label)) BETWEEN 1 AND 40),
  CONSTRAINT sponsor_vendor_content_cta_label_len
    CHECK (cta_label IS NULL OR char_length(btrim(cta_label)) BETWEEN 1 AND 80)
);

COMMENT ON TABLE public.sponsor_vendor_content IS
  'MAT-16 sponsor page cards by section. Outbound urls only — no physician identity transmission.';

CREATE INDEX IF NOT EXISTS sponsor_vendor_content_vendor_section_idx
  ON public.sponsor_vendor_content (vendor_id, section_type, sort_order)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- RLS: authenticated read of active rows; admin writes
-- ---------------------------------------------------------------------------
ALTER TABLE public.sponsor_vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_vendor_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sponsor_vendor_profiles_select_active ON public.sponsor_vendor_profiles;
CREATE POLICY sponsor_vendor_profiles_select_active
  ON public.sponsor_vendor_profiles
  FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS sponsor_vendor_profiles_admin_all ON public.sponsor_vendor_profiles;
CREATE POLICY sponsor_vendor_profiles_admin_all
  ON public.sponsor_vendor_profiles
  FOR ALL
  TO authenticated
  USING (public.is_atlas_admin())
  WITH CHECK (public.is_atlas_admin());

DROP POLICY IF EXISTS sponsor_vendor_content_select_active ON public.sponsor_vendor_content;
CREATE POLICY sponsor_vendor_content_select_active
  ON public.sponsor_vendor_content
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.sponsor_vendor_profiles AS p
      WHERE p.vendor_id = sponsor_vendor_content.vendor_id
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS sponsor_vendor_content_admin_all ON public.sponsor_vendor_content;
CREATE POLICY sponsor_vendor_content_admin_all
  ON public.sponsor_vendor_content
  FOR ALL
  TO authenticated
  USING (public.is_atlas_admin())
  WITH CHECK (public.is_atlas_admin());

GRANT SELECT ON public.sponsor_vendor_profiles TO authenticated;
GRANT SELECT ON public.sponsor_vendor_content TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sponsor_vendor_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sponsor_vendor_content TO authenticated;
REVOKE ALL ON TABLE public.sponsor_vendor_profiles FROM anon;
REVOKE ALL ON TABLE public.sponsor_vendor_content FROM anon;

-- ---------------------------------------------------------------------------
-- RPCs: list active sponsors + get page by vendor slug
-- SECURITY DEFINER so public practice pages can resolve sponsor linkability
-- without exposing the full vendor catalog. Returns no physician fields.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_active_atlas_sponsors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_order, x.display_label), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      v.slug,
      v.display_label,
      p.short_description,
      p.logo_url,
      p.sort_order
    FROM public.sponsor_vendor_profiles AS p
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.is_active = true
      AND v.active = true
  ) AS x;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_active_sponsor_slugs()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(v.slug ORDER BY v.slug), ARRAY[]::text[])
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.is_active = true
    AND v.active = true;
$$;

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
          'sort_order', c.sort_order
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
          sc.sort_order
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

REVOKE ALL ON FUNCTION public.list_active_atlas_sponsors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_active_atlas_sponsors() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_active_atlas_sponsors() TO authenticated;

REVOKE ALL ON FUNCTION public.list_active_sponsor_slugs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_sponsor_slugs() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_atlas_sponsor_page(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_atlas_sponsor_page(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_atlas_sponsor_page(text) TO authenticated;

COMMENT ON FUNCTION public.list_active_atlas_sponsors() IS
  'MAT-16 active paying sponsors for /partners directory. No physician fields.';
COMMENT ON FUNCTION public.list_active_sponsor_slugs() IS
  'MAT-16 active sponsor slug set for practice technology link resolution. Safe for anon.';
COMMENT ON FUNCTION public.get_atlas_sponsor_page(text) IS
  'MAT-16 sponsor page payload by vendors.slug. Active sponsors only; no physician fields.';

-- ---------------------------------------------------------------------------
-- Demo fixture: Bausch + Lomb (first illustrative active sponsor)
-- Content is configurable seed data — not hard-coded product logic.
-- ---------------------------------------------------------------------------
INSERT INTO public.sponsor_vendor_profiles (
  vendor_id,
  is_active,
  short_description,
  logo_url,
  disclosure_text,
  sort_order
)
SELECT
  v.id,
  true,
  'Illustrative Atlas industry partner page (demo content for layout and navigation).',
  NULL,
  'Bausch + Lomb is an Atlas industry partner. Partnership does not affect practice scores, rankings, Opportunities, physician visibility, or technology reporting.',
  10
FROM public.vendors AS v
WHERE v.slug = 'bausch_plus_lomb'
ON CONFLICT (vendor_id) DO UPDATE
SET
  is_active = EXCLUDED.is_active,
  short_description = EXCLUDED.short_description,
  disclosure_text = EXCLUDED.disclosure_text,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Clear prior seed rows for idempotent re-apply in local resets (by vendor + titles).
DELETE FROM public.sponsor_vendor_content AS sc
USING public.vendors AS v
WHERE sc.vendor_id = v.id
  AND v.slug = 'bausch_plus_lomb';

INSERT INTO public.sponsor_vendor_content (
  vendor_id, section_type, title, description, url, event_date, status_label, cta_label, sort_order, is_active
)
SELECT v.id, x.section_type, x.title, x.description, x.url, x.event_date::date, x.status_label, x.cta_label, x.sort_order, true
FROM public.vendors AS v
CROSS JOIN (
  VALUES
    ('whats_new', '[Demo] Sample product update card', 'Placeholder card for how Whats New items will appear. Replace with sponsor-approved copy before treating as live marketing.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 10),
    ('whats_new', '[Demo] Sample upcoming announcement', 'Placeholder for an upcoming announcement listing. Not a verified product launch claim.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 20),
    ('education', '[Demo] Sample education program', 'Placeholder for wet labs, webinars, or surgeon education listings hosted on the partner site.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 10),
    ('education', '[Demo] Sample trainee program', 'Placeholder for resident/fellow education listings. Demo content only.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 20),
    ('clinical_evidence', '[Demo] Sample evidence link', 'Placeholder for sponsor-provided publications or abstracts. Atlas does not independently make clinical claims.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 10),
    ('clinical_evidence', '[Demo] Sample scientific materials', 'Placeholder for scientific materials maintained by the partner. Demo content only.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 20),
    ('connect', '[Demo] Talk to a peer surgeon', 'Example outbound CTA. Atlas does not share your identity automatically. Any contact happens on the partner site after you click.', 'https://www.bausch.com', NULL, 'Demo', 'Talk to a peer surgeon', 10),
    ('connect', '[Demo] Find your local representative', 'Example outbound CTA. Locate a representative on the partner site. Contact is initiated by you.', 'https://www.bausch.com', NULL, 'Demo', 'Find your local representative', 20),
    ('connect', '[Demo] Ask about training', 'Example outbound CTA for training inquiries on the partner site.', 'https://www.bausch.com', NULL, 'Demo', 'Ask about training', 30),
    ('training_product_info', '[Demo] Sample product information', 'Placeholder for practical product/platform resources. Demo content only.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 10),
    ('training_product_info', '[Demo] Sample training resources', 'Placeholder for training and onboarding resource listings. Demo content only.', 'https://www.bausch.com', NULL, 'Demo', 'Open partner site', 20)
) AS x(section_type, title, description, url, event_date, status_label, cta_label, sort_order)
WHERE v.slug = 'bausch_plus_lomb';
