-- Rollback anon base-table privilege revocation
-- (20260803060000_anon_base_table_revoke.sql)
-- Restores the pre-revoke grant posture observed in production catalog.
-- Does NOT grant INSERT/UPDATE/DELETE (they were not present).
-- Does NOT touch authenticated grants or public_* RPC EXECUTE grants.

GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.practices TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.doctors TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.affiliations TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.practice_locations TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profiles TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.shortlists TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.employer_leads TO anon;

-- practice_error_reports: no anon SELECT existed pre-revoke
GRANT REFERENCES, TRIGGER, TRUNCATE ON TABLE public.practice_error_reports TO anon;
