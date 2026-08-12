-- Rollback Stage C (20260803040000_stage_c_analysis_authz.sql)
-- Restores unrestricted authenticated SELECT on analysis tables.
-- Does not drop is_atlas_analysis_authorized() (still used by physician jobs RPCs).
-- Does not revoke EXECUTE on the helper (harmless boolean; revoke manually if desired).

DROP POLICY IF EXISTS practices_select_authorized ON public.practices;
CREATE POLICY auth_read ON public.practices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS doctors_select_authorized ON public.doctors;
CREATE POLICY auth_read ON public.doctors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS affiliations_select_authorized ON public.affiliations;
CREATE POLICY auth_read ON public.affiliations
  FOR SELECT TO authenticated USING (true);
