-- Rollback Stage A public-search RPCs (20260803050000_stage_a_public_search_rpcs.sql)
-- Leaves extensions.pg_trgm installed.
-- Does NOT drop public.is_atlas_analysis_authorized() (Stage C / jobs RPCs depend on it).

DROP FUNCTION IF EXISTS public.public_search(text);
DROP FUNCTION IF EXISTS public.public_get_practice(uuid);
DROP FUNCTION IF EXISTS public.public_get_practice_locations(uuid);
DROP FUNCTION IF EXISTS public.public_get_practice_roster(uuid);
DROP FUNCTION IF EXISTS public.public_get_physician(uuid);
DROP FUNCTION IF EXISTS public.public_platform_counts();
DROP FUNCTION IF EXISTS public._public_ilike_pattern(text);
DROP FUNCTION IF EXISTS public._public_normalize_search_query(text);
DROP FUNCTION IF EXISTS public._public_is_current_roster_status(text);

DROP INDEX IF EXISTS public.practices_practice_name_trgm_idx;
DROP INDEX IF EXISTS public.doctors_physician_name_trgm_idx;
DROP INDEX IF EXISTS public.affiliations_practice_id_status_idx;
DROP INDEX IF EXISTS public.affiliations_doctor_id_status_idx;
