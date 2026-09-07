-- Read-only physician-ready V1 release audit. Do not apply as a migration.

-- A) Profile columns
SELECT 'profile_columns' AS check_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employer_practice_profiles'
  AND column_name IN (
    'practice_ownership_structure',
    'practice_ownership_other_text',
    'physician_fit_description',
    'future_practice_description',
    'physician_ready_at',
    'physician_ready_by',
    'infrastructure_last_reviewed_at'
  )
ORDER BY column_name;

-- B) Expected tables
SELECT 'tables' AS check_name, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'employer_practice_recruiting_opportunities',
    'employer_practice_recruiting_opportunity_reasons',
    'employer_leads_clinical_focus_map',
    'infrastructure_categories',
    'vendors',
    'vendor_categories',
    'vendor_products',
    'employer_practice_infrastructure',
    'employer_practice_infrastructure_category_reviews'
  )
ORDER BY table_name;

-- C) Opportunity columns (status must be absent)
SELECT 'opportunity_columns' AS check_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employer_practice_recruiting_opportunities'
ORDER BY ordinal_position;

-- D) Counts
SELECT
  'counts' AS check_name,
  (SELECT count(*) FROM public.vendors) AS vendor_count,
  (SELECT count(*) FROM public.vendor_categories) AS relationship_count,
  (SELECT count(*) FROM public.vendor_products) AS vendor_product_count,
  (SELECT count(*) FROM public.infrastructure_categories) AS category_count,
  (SELECT count(*) FROM public.employer_leads_clinical_focus_map) AS leads_map_count;

-- E) Duplicate vendors
SELECT 'dup_vendor_labels' AS check_name, lower(display_label) AS label, count(*) AS c
FROM public.vendors
GROUP BY lower(display_label)
HAVING count(*) > 1;

SELECT 'dup_vendor_slugs' AS check_name, slug, count(*) AS c
FROM public.vendors
GROUP BY slug
HAVING count(*) > 1;

-- F) RLS enabled
SELECT 'rls_enabled' AS check_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'employer_practice_recruiting_opportunities',
    'employer_practice_recruiting_opportunity_reasons',
    'employer_leads_clinical_focus_map',
    'infrastructure_categories',
    'vendors',
    'vendor_categories',
    'vendor_products',
    'employer_practice_infrastructure',
    'employer_practice_infrastructure_category_reviews'
  )
ORDER BY c.relname;

-- G) Policies on new tables
SELECT 'policies' AS check_name, schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'employer_practice_recruiting_opportunities',
    'employer_practice_recruiting_opportunity_reasons',
    'employer_leads_clinical_focus_map',
    'infrastructure_categories',
    'vendors',
    'vendor_categories',
    'vendor_products',
    'employer_practice_infrastructure',
    'employer_practice_infrastructure_category_reviews'
  )
ORDER BY tablename, policyname;

-- H) Functions exist
SELECT 'functions' AS check_name, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'public_get_employer_practice_overlay',
    'complete_employer_physician_ready',
    'complete_employer_initial_review'
  )
ORDER BY p.proname;
