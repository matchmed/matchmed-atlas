-- Rollback 20260803020000_physician_jobs_rpcs.sql
-- Leaves is_atlas_analysis_authorized() in place if Stage A/C also need it.

DROP FUNCTION IF EXISTS public.list_physician_jobs(integer, integer);
DROP FUNCTION IF EXISTS public.list_physician_jobs_for_practice(uuid);
DROP FUNCTION IF EXISTS public.count_physician_jobs();

-- Optional only if no other migration depends on it:
-- DROP FUNCTION IF EXISTS public.is_atlas_analysis_authorized();
