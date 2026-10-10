-- Public partnership inquiries from the Partners site.
-- A vendor search result is not a sponsorship.
-- This migration does not create vendors, sponsor profiles, or published content.
-- MatchMed reviews rows as the database owner in the SQL editor.
-- The Data API cannot read this table. No admin dashboard is added.

CREATE TABLE public.partner_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NULL REFERENCES public.vendors (id) ON DELETE RESTRICT,
  company_name_snapshot text NOT NULL,
  proposed_company_name text NULL,
  contact_name text NOT NULL,
  work_email text NOT NULL,
  role_title text NULL,
  interest_area text NOT NULL,
  message text NULL,
  source text NOT NULL,
  consented_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'new',
  contacted_at timestamptz NULL,
  internal_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_inquiries_company_mode CHECK (
    (
      vendor_id IS NOT NULL
      AND proposed_company_name IS NULL
    )
    OR (
      vendor_id IS NULL
      AND proposed_company_name IS NOT NULL
      AND company_name_snapshot = proposed_company_name
    )
  ),
  CONSTRAINT partner_inquiries_snapshot_len CHECK (char_length(company_name_snapshot) BETWEEN 1 AND 160),
  CONSTRAINT partner_inquiries_proposed_len CHECK (
    proposed_company_name IS NULL OR char_length(proposed_company_name) BETWEEN 1 AND 160
  ),
  CONSTRAINT partner_inquiries_contact_len CHECK (char_length(contact_name) BETWEEN 1 AND 120),
  CONSTRAINT partner_inquiries_email_len CHECK (char_length(work_email) BETWEEN 3 AND 254),
  CONSTRAINT partner_inquiries_role_len CHECK (
    role_title IS NULL OR char_length(role_title) BETWEEN 1 AND 120
  ),
  CONSTRAINT partner_inquiries_message_len CHECK (
    message IS NULL OR char_length(message) BETWEEN 1 AND 1000
  ),
  CONSTRAINT partner_inquiries_interest_area CHECK (
    interest_area IN (
      'physician_engagement',
      'practice_engagement',
      'professional_education',
      'product_equipment_support',
      'workforce_intelligence',
      'events_ongoing_engagement',
      'other'
    )
  ),
  CONSTRAINT partner_inquiries_source CHECK (
    source IN ('partners_home', 'aao_business_card', 'direct', 'unknown')
  ),
  CONSTRAINT partner_inquiries_status CHECK (
    status IN ('new', 'contacted', 'qualified', 'not_a_fit', 'closed')
  )
);

COMMENT ON TABLE public.partner_inquiries IS
  'Partnership inquiries from the public Partners site. Review them as the database owner in the SQL editor. The Data API cannot read this table. A vendor listed by search is not a MatchMed sponsor.';

COMMENT ON COLUMN public.partner_inquiries.company_name_snapshot IS
  'Copied from vendors.display_label for an existing company, or the normalized proposed name. Callers cannot supply this value.';

CREATE INDEX partner_inquiries_created_at_idx
  ON public.partner_inquiries (created_at DESC);

CREATE INDEX partner_inquiries_vendor_id_idx
  ON public.partner_inquiries (vendor_id);

CREATE OR REPLACE FUNCTION public.partner_inquiries_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_inquiries_set_updated_at ON public.partner_inquiries;
CREATE TRIGGER partner_inquiries_set_updated_at
  BEFORE UPDATE ON public.partner_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.partner_inquiries_touch_updated_at();

REVOKE ALL ON FUNCTION public.partner_inquiries_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_inquiries_touch_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.partner_inquiries_touch_updated_at() FROM authenticated;

ALTER TABLE public.partner_inquiries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.partner_inquiries FROM PUBLIC;
REVOKE ALL ON TABLE public.partner_inquiries FROM anon;
REVOKE ALL ON TABLE public.partner_inquiries FROM authenticated;
REVOKE ALL ON TABLE public.partner_inquiries FROM service_role;

-- No table policies. Direct reads and writes stay denied.

CREATE OR REPLACE FUNCTION public.search_partner_inquiry_vendors(p_query text)
RETURNS TABLE (id uuid, display_label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nq text;
  pat text;
BEGIN
  IF p_query IS NULL OR p_query ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN
    RAISE EXCEPTION 'invalid search query' USING ERRCODE = '22023';
  END IF;
  nq := lower(regexp_replace(btrim(p_query), '\s+', ' ', 'g'));
  IF char_length(nq) < 2 THEN
    RAISE EXCEPTION 'search query too short' USING ERRCODE = '22023';
  END IF;
  IF char_length(nq) > 80 THEN
    RAISE EXCEPTION 'search query too long' USING ERRCODE = '22023';
  END IF;
  pat := '%' || replace(replace(replace(nq, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  RETURN QUERY
  SELECT v.id, v.display_label
  FROM public.vendors AS v
  WHERE v.active IS TRUE
    AND lower(v.display_label) LIKE pat ESCAPE '\'
  ORDER BY
    CASE
      WHEN lower(v.display_label) = nq THEN 0
      WHEN lower(v.display_label) LIKE (replace(replace(replace(nq, '\', '\\'), '%', '\%'), '_', '\_') || '%') ESCAPE '\' THEN 1
      ELSE 2
    END,
    v.display_label ASC,
    v.id ASC
  LIMIT 8;
END;
$$;

COMMENT ON FUNCTION public.search_partner_inquiry_vendors(text) IS
  'Active vendor id and display label only. Inclusion does not mean the company sponsors MatchMed. No legal name, slug, category, or sponsor state is returned.';

REVOKE ALL ON FUNCTION public.search_partner_inquiry_vendors(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_partner_inquiry_vendors(text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_partner_inquiry_vendors(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_partner_inquiry(
  p_vendor_id uuid,
  p_proposed_company_name text,
  p_contact_name text,
  p_work_email text,
  p_role_title text,
  p_interest_area text,
  p_message text,
  p_source text,
  p_consent boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_email text;
  v_role text;
  v_message text;
  v_proposed text;
  v_snapshot text;
BEGIN
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'invalid inquiry' USING ERRCODE = '22023';
  END IF;

  v_name := regexp_replace(btrim(COALESCE(p_contact_name, '')), '\s+', ' ', 'g');
  v_email := lower(btrim(COALESCE(p_work_email, '')));
  v_role := NULLIF(regexp_replace(btrim(COALESCE(p_role_title, '')), '\s+', ' ', 'g'), '');
  v_message := NULLIF(regexp_replace(btrim(COALESCE(p_message, '')), '\s+', ' ', 'g'), '');
  v_proposed := NULLIF(regexp_replace(btrim(COALESCE(p_proposed_company_name, '')), '\s+', ' ', 'g'), '');

  IF char_length(v_name) < 1 OR char_length(v_name) > 120
     OR char_length(v_email) < 3 OR char_length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
     OR (v_role IS NOT NULL AND char_length(v_role) > 120)
     OR (v_message IS NOT NULL AND char_length(v_message) > 1000)
     OR (v_proposed IS NOT NULL AND char_length(v_proposed) > 160) THEN
    RAISE EXCEPTION 'invalid inquiry' USING ERRCODE = '22023';
  END IF;

  IF p_interest_area IS NULL OR p_interest_area NOT IN (
    'physician_engagement',
    'practice_engagement',
    'professional_education',
    'product_equipment_support',
    'workforce_intelligence',
    'events_ongoing_engagement',
    'other'
  ) THEN
    RAISE EXCEPTION 'invalid inquiry' USING ERRCODE = '22023';
  END IF;

  IF p_source IS NULL OR p_source NOT IN (
    'partners_home',
    'aao_business_card',
    'direct',
    'unknown'
  ) THEN
    RAISE EXCEPTION 'invalid inquiry' USING ERRCODE = '22023';
  END IF;

  IF p_vendor_id IS NOT NULL AND v_proposed IS NOT NULL THEN
    RAISE EXCEPTION 'invalid inquiry' USING ERRCODE = '22023';
  END IF;
  IF p_vendor_id IS NULL AND v_proposed IS NULL THEN
    RAISE EXCEPTION 'invalid inquiry' USING ERRCODE = '22023';
  END IF;

  IF p_vendor_id IS NOT NULL THEN
    SELECT v.display_label
      INTO v_snapshot
    FROM public.vendors AS v
    WHERE v.id = p_vendor_id
      AND v.active IS TRUE;
    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'invalid inquiry' USING ERRCODE = '22023';
    END IF;
    v_proposed := NULL;
  ELSE
    v_snapshot := v_proposed;
  END IF;

  INSERT INTO public.partner_inquiries (
    vendor_id,
    company_name_snapshot,
    proposed_company_name,
    contact_name,
    work_email,
    role_title,
    interest_area,
    message,
    source,
    consented_at,
    status,
    contacted_at,
    internal_notes
  ) VALUES (
    p_vendor_id,
    v_snapshot,
    v_proposed,
    v_name,
    v_email,
    v_role,
    p_interest_area,
    v_message,
    p_source,
    now(),
    'new',
    NULL,
    NULL
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.submit_partner_inquiry(uuid, text, text, text, text, text, text, text, boolean) IS
  'Stores one partnership inquiry. Copies an existing vendor label from the database. Does not create vendors or sponsor records. Returns only generic success.';

REVOKE ALL ON FUNCTION public.submit_partner_inquiry(uuid, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partner_inquiry(uuid, text, text, text, text, text, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_partner_inquiry(uuid, text, text, text, text, text, text, text, boolean) TO authenticated;
