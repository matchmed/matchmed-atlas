-- =============================================================================
-- STAGE A / Part B — anonymous base-table privilege revocation (proposal mirror)
-- Tracked migration: supabase/migrations/20260803060000_anon_base_table_revoke.sql
-- Rollback: docs/security/stage-a-anon-revoke.rollback.sql
-- Prerequisites: Stage A public RPCs verified. Do not change authenticated grants
-- or public_* RPC EXECUTE grants.
-- =============================================================================

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.practices FROM anon;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.doctors FROM anon;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.affiliations FROM anon;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.practice_locations FROM anon;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.profiles FROM anon;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.shortlists FROM anon;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.employer_leads FROM anon;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.practice_error_reports FROM anon;
