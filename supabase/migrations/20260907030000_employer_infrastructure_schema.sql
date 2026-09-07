-- Physician-ready V1 — infrastructure taxonomy + employer selections.
-- vendor_products is scaffolded empty; vendor-level selection is sufficient for V1.

CREATE TABLE IF NOT EXISTS public.infrastructure_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  display_label text NOT NULL,
  physician_facing boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infrastructure_categories_slug_key UNIQUE (slug),
  CONSTRAINT infrastructure_categories_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  CONSTRAINT infrastructure_categories_label_len
    CHECK (char_length(btrim(display_label)) BETWEEN 2 AND 80)
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  display_label text NOT NULL,
  legal_name text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendors_slug_key UNIQUE (slug),
  CONSTRAINT vendors_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  CONSTRAINT vendors_display_label_len
    CHECK (char_length(btrim(display_label)) BETWEEN 1 AND 120)
);

COMMENT ON COLUMN public.vendors.display_label IS
  'Common practice-facing label (e.g. ZEISS, ModMed). Separate from legal_name.';
COMMENT ON COLUMN public.vendors.slug IS
  'Stable canonical identity. Must not depend on display_label.';

CREATE TABLE IF NOT EXISTS public.vendor_categories (
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.infrastructure_categories(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, category_id)
);

COMMENT ON COLUMN public.vendor_categories.sort_order IS
  'Display ordering within a category only. Does not imply quality ranking.';

CREATE TABLE IF NOT EXISTS public.vendor_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  category_id uuid NULL REFERENCES public.infrastructure_categories(id) ON DELETE SET NULL,
  display_label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_products_label_len
    CHECK (char_length(btrim(display_label)) BETWEEN 1 AND 120)
);

COMMENT ON TABLE public.vendor_products IS
  'Optional product/platform catalog. Scaffolded for V1; vendor-level selection is sufficient for completion.';

CREATE TABLE IF NOT EXISTS public.employer_practice_infrastructure_category_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.infrastructure_categories(id) ON DELETE CASCADE,
  review_state text NOT NULL,
  reported_by uuid NULL REFERENCES auth.users(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_infra_review_state_check
    CHECK (review_state IN (
      'vendors_selected',
      'none_not_applicable',
      'unknown',
      'in_house_no_external'
    )),
  CONSTRAINT employer_infra_review_unique UNIQUE (practice_id, category_id)
);

COMMENT ON TABLE public.employer_practice_infrastructure_category_reviews IS
  'Explicit per-category review state required for physician-ready. in_house_no_external used for Billing/IT.';

CREATE TABLE IF NOT EXISTS public.employer_practice_infrastructure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.infrastructure_categories(id) ON DELETE CASCADE,
  vendor_id uuid NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  vendor_product_id uuid NULL REFERENCES public.vendor_products(id) ON DELETE SET NULL,
  other_vendor_name text NULL,
  reported_by uuid NULL REFERENCES auth.users(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_infra_other_vendor_len
    CHECK (other_vendor_name IS NULL OR char_length(btrim(other_vendor_name)) BETWEEN 1 AND 120),
  CONSTRAINT employer_infra_vendor_xor_other
    CHECK (
      (vendor_id IS NOT NULL AND other_vendor_name IS NULL)
      OR (vendor_id IS NULL AND other_vendor_name IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS employer_infra_practice_idx
  ON public.employer_practice_infrastructure (practice_id);
CREATE INDEX IF NOT EXISTS employer_infra_practice_category_idx
  ON public.employer_practice_infrastructure (practice_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS employer_infra_unique_vendor
  ON public.employer_practice_infrastructure (practice_id, category_id, vendor_id)
  WHERE vendor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employer_infra_unique_other
  ON public.employer_practice_infrastructure (practice_id, category_id, lower(btrim(other_vendor_name)))
  WHERE other_vendor_name IS NOT NULL;

-- RLS: taxonomy readable by authenticated; employer selections gated by can_edit_practice.
ALTER TABLE public.infrastructure_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_practice_infrastructure_category_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_practice_infrastructure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS infrastructure_categories_select ON public.infrastructure_categories;
CREATE POLICY infrastructure_categories_select
  ON public.infrastructure_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS vendors_select ON public.vendors;
CREATE POLICY vendors_select
  ON public.vendors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS vendor_categories_select ON public.vendor_categories;
CREATE POLICY vendor_categories_select
  ON public.vendor_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS vendor_products_select ON public.vendor_products;
CREATE POLICY vendor_products_select
  ON public.vendor_products FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS infrastructure_taxonomy_admin_write ON public.infrastructure_categories;
CREATE POLICY infrastructure_taxonomy_admin_write
  ON public.infrastructure_categories FOR ALL TO authenticated
  USING (public.is_atlas_admin()) WITH CHECK (public.is_atlas_admin());

DROP POLICY IF EXISTS vendors_admin_write ON public.vendors;
CREATE POLICY vendors_admin_write
  ON public.vendors FOR ALL TO authenticated
  USING (public.is_atlas_admin()) WITH CHECK (public.is_atlas_admin());

DROP POLICY IF EXISTS vendor_categories_admin_write ON public.vendor_categories;
CREATE POLICY vendor_categories_admin_write
  ON public.vendor_categories FOR ALL TO authenticated
  USING (public.is_atlas_admin()) WITH CHECK (public.is_atlas_admin());

DROP POLICY IF EXISTS vendor_products_admin_write ON public.vendor_products;
CREATE POLICY vendor_products_admin_write
  ON public.vendor_products FOR ALL TO authenticated
  USING (public.is_atlas_admin()) WITH CHECK (public.is_atlas_admin());

DROP POLICY IF EXISTS employer_infra_review_select ON public.employer_practice_infrastructure_category_reviews;
CREATE POLICY employer_infra_review_select
  ON public.employer_practice_infrastructure_category_reviews FOR SELECT TO authenticated
  USING (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

DROP POLICY IF EXISTS employer_infra_review_insert ON public.employer_practice_infrastructure_category_reviews;
CREATE POLICY employer_infra_review_insert
  ON public.employer_practice_infrastructure_category_reviews FOR INSERT TO authenticated
  WITH CHECK (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

DROP POLICY IF EXISTS employer_infra_review_update ON public.employer_practice_infrastructure_category_reviews;
CREATE POLICY employer_infra_review_update
  ON public.employer_practice_infrastructure_category_reviews FOR UPDATE TO authenticated
  USING (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id))
  WITH CHECK (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

DROP POLICY IF EXISTS employer_infra_review_delete ON public.employer_practice_infrastructure_category_reviews;
CREATE POLICY employer_infra_review_delete
  ON public.employer_practice_infrastructure_category_reviews FOR DELETE TO authenticated
  USING (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

DROP POLICY IF EXISTS employer_infra_select ON public.employer_practice_infrastructure;
CREATE POLICY employer_infra_select
  ON public.employer_practice_infrastructure FOR SELECT TO authenticated
  USING (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

DROP POLICY IF EXISTS employer_infra_insert ON public.employer_practice_infrastructure;
CREATE POLICY employer_infra_insert
  ON public.employer_practice_infrastructure FOR INSERT TO authenticated
  WITH CHECK (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

DROP POLICY IF EXISTS employer_infra_update ON public.employer_practice_infrastructure;
CREATE POLICY employer_infra_update
  ON public.employer_practice_infrastructure FOR UPDATE TO authenticated
  USING (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id))
  WITH CHECK (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

DROP POLICY IF EXISTS employer_infra_delete ON public.employer_practice_infrastructure;
CREATE POLICY employer_infra_delete
  ON public.employer_practice_infrastructure FOR DELETE TO authenticated
  USING (public.is_atlas_admin() OR public.can_edit_practice((SELECT auth.uid()), practice_id));

GRANT SELECT ON public.infrastructure_categories TO authenticated;
GRANT SELECT ON public.vendors TO authenticated;
GRANT SELECT ON public.vendor_categories TO authenticated;
GRANT SELECT ON public.vendor_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_practice_infrastructure_category_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_practice_infrastructure TO authenticated;

REVOKE ALL ON TABLE public.infrastructure_categories FROM anon;
REVOKE ALL ON TABLE public.vendors FROM anon;
REVOKE ALL ON TABLE public.vendor_categories FROM anon;
REVOKE ALL ON TABLE public.vendor_products FROM anon;
REVOKE ALL ON TABLE public.employer_practice_infrastructure_category_reviews FROM anon;
REVOKE ALL ON TABLE public.employer_practice_infrastructure FROM anon;
