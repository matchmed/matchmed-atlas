-- Physician onboarding acknowledgement that Atlas is industry-supported.
-- Existing rows stay false; do not backfill completed physicians.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS industry_partnership_acknowledged boolean NOT NULL DEFAULT false;

-- Additive: needed if production uses column-level INSERT/UPDATE grants on profiles.
-- Table-level grants already covering all columns remain valid.
GRANT INSERT (industry_partnership_acknowledged) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (industry_partnership_acknowledged) ON TABLE public.profiles TO authenticated;
