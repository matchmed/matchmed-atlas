-- =============================================================================
-- PROPOSAL ONLY — rollback for Phase 1 Part A (and optional Part B).
-- Run only if Phase 1 objects were applied and must be removed.
-- Does not restore unknown pre-existing functions of the same name.
-- =============================================================================

BEGIN;

-- Drop public RPCs (CASCADE not used; drop dependents explicitly via order)
DROP FUNCTION IF EXISTS public.public_search(text);
DROP FUNCTION IF EXISTS public.public_get_practice(uuid);
DROP FUNCTION IF EXISTS public.public_get_practice_locations(uuid);
DROP FUNCTION IF EXISTS public.public_get_practice_roster(uuid);
DROP FUNCTION IF EXISTS public.public_get_physician(uuid);
DROP FUNCTION IF EXISTS public.public_platform_counts();

-- Private helpers
DROP FUNCTION IF EXISTS public._public_normalize_search_query(text);
DROP FUNCTION IF EXISTS public._public_is_current_roster_status(text);
DROP FUNCTION IF EXISTS public.is_atlas_analysis_authorized();

-- Indexes created by Phase 1 (safe IF EXISTS)
DROP INDEX IF EXISTS public.practices_practice_name_trgm_idx;
DROP INDEX IF EXISTS public.doctors_physician_name_trgm_idx;
DROP INDEX IF EXISTS public.affiliations_practice_id_status_idx;
DROP INDEX IF EXISTS public.affiliations_doctor_id_status_idx;

COMMIT;

-- ---------------------------------------------------------------------------
-- If Part B (REVOKE anon SELECT) was applied, restore anon SELECT grants to
-- match the pre-Phase-1 production posture observed in Data API probes:
-- anon could SELECT (0 rows via RLS) on these tables. practice_error_reports
-- had no anon SELECT — do not grant it here.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- GRANT SELECT ON TABLE public.practices TO anon;
-- GRANT SELECT ON TABLE public.doctors TO anon;
-- GRANT SELECT ON TABLE public.affiliations TO anon;
-- GRANT SELECT ON TABLE public.practice_locations TO anon;
-- GRANT SELECT ON TABLE public.profiles TO anon;
-- GRANT SELECT ON TABLE public.shortlists TO anon;
-- GRANT SELECT ON TABLE public.employer_leads TO anon;
-- COMMIT;

-- Note: CREATE EXTENSION pg_trgm is left in place (shared dependency).
-- Do not DROP EXTENSION extensions.pg_trgm in rollback.
