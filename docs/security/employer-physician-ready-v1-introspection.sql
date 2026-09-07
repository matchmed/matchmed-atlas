-- Read-only production introspection for physician-ready V1 planning.
-- Safe SELECTs only. Do not apply as a migration.

-- 1) Overlay function body (detect public_display_name drift)
SELECT pg_get_functiondef('public.public_get_employer_practice_overlay(uuid)'::regprocedure);

-- 2) employer_practice_profiles columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employer_practice_profiles'
ORDER BY ordinal_position;

-- 3) Confirm expected Layer-3 / claim tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'practice_claims',
    'employer_practice_profiles',
    'employer_practice_locations',
    'employer_roster_assertions',
    'employer_organizations',
    'organization_memberships',
    'employer_organization_practices',
    'employer_practice_recruiting_opportunities',
    'infrastructure_categories',
    'vendors'
  )
ORDER BY table_name;

-- 4) Existing complete_employer_initial_review definition
SELECT pg_get_functiondef('public.complete_employer_initial_review(uuid)'::regprocedure);

-- 5) Privileged-column trigger on employer_practice_profiles
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.employer_practice_profiles'::regclass
  AND NOT tgisinternal
ORDER BY tgname;
