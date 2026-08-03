-- Anon base-table privilege revocation (Part B)
-- Prerequisites: Stage A public-search RPCs verified anonymously.
-- Does NOT change authenticated grants/policies.
-- Does NOT alter public_* RPC EXECUTE grants.

-- Live inventory (2026-08-03): anon held SELECT + REFERENCES + TRIGGER + TRUNCATE
-- on practices/doctors/affiliations/practice_locations/profiles/shortlists/employer_leads;
-- practice_error_reports held REFERENCES + TRIGGER + TRUNCATE (no SELECT).
-- INSERT/UPDATE/DELETE were absent; still revoked defensively.

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
