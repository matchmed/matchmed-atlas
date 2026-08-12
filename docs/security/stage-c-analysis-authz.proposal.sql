-- =============================================================================
-- STAGE C — Full-analysis authorization RLS (proposal mirror)
-- Tracked migration: supabase/migrations/20260803040000_stage_c_analysis_authz.sql
-- Rollback: docs/security/stage-c-analysis-authz.rollback.sql
-- Scope: practices, doctors, affiliations ONLY.
-- practice_locations intentionally unchanged (Stage B authenticated read retained).
-- No Stage A public RPCs / anon privilege revocation.
-- =============================================================================

-- Helper is SECURITY DEFINER so the profiles lookup does not recurse through
-- profiles RLS. Idempotent redefine matches production jobs RPC migration.
CREATE OR REPLACE FUNCTION public.is_atlas_analysis_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN false
    ELSE COALESCE(
      (
        SELECT
          p.deleted_at IS NULL
          AND (
            p.onboarding_complete IS TRUE
            OR p.is_admin IS TRUE
          )
        FROM public.profiles AS p
        WHERE p.user_id = (SELECT auth.uid())
        LIMIT 1
      ),
      false
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_atlas_analysis_authorized() FROM PUBLIC;
-- Required so authenticated RLS policy expressions can evaluate the helper.
-- Function returns boolean only; does not expose profile rows to clients.
GRANT EXECUTE ON FUNCTION public.is_atlas_analysis_authorized() TO authenticated;

DROP POLICY IF EXISTS auth_read ON public.practices;
DROP POLICY IF EXISTS practices_select_authorized ON public.practices;
CREATE POLICY practices_select_authorized
  ON public.practices
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_atlas_analysis_authorized()));

DROP POLICY IF EXISTS auth_read ON public.doctors;
DROP POLICY IF EXISTS doctors_select_authorized ON public.doctors;
CREATE POLICY doctors_select_authorized
  ON public.doctors
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_atlas_analysis_authorized()));

DROP POLICY IF EXISTS auth_read ON public.affiliations;
DROP POLICY IF EXISTS affiliations_select_authorized ON public.affiliations;
CREATE POLICY affiliations_select_authorized
  ON public.affiliations
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_atlas_analysis_authorized()));
