-- Rollback for jobs-physician-rpc.proposal.sql
-- Does not drop is_atlas_analysis_authorized() if Stage A/C also use it.

BEGIN;

DROP FUNCTION IF EXISTS public.list_physician_jobs(integer, integer);
DROP FUNCTION IF EXISTS public.list_physician_jobs_for_practice(uuid);
DROP FUNCTION IF EXISTS public.count_physician_jobs();

COMMIT;

-- Optional: only if no other stage needs the helper:
-- DROP FUNCTION IF EXISTS public.is_atlas_analysis_authorized();
