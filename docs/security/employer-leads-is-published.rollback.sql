-- Rollback is_published addition (only if safe / unused).
BEGIN;
DROP INDEX IF EXISTS public.employer_leads_is_published_idx;
ALTER TABLE public.employer_leads DROP COLUMN IF EXISTS is_published;
COMMIT;
