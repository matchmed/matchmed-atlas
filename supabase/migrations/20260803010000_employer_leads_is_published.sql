-- Temporarily publish zero physician-facing jobs.
-- All existing and new employer_leads rows remain unpublished until explicitly set.
-- Does not grant new table privileges; RLS unchanged in this migration.

ALTER TABLE public.employer_leads
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employer_leads.is_published IS
  'Physician-facing jobs RPCs return only rows where is_published is true. Default false; linking a practice_id does not publish.';

CREATE INDEX IF NOT EXISTS employer_leads_is_published_idx
  ON public.employer_leads (is_published)
  WHERE is_published IS TRUE;
