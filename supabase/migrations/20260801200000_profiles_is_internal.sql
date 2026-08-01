-- Internal/test account flag for PostHog person property is_internal.
-- Not coupled to is_admin; default false for all existing and new profiles.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
