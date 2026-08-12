-- Rollback Stage B (20260803030000_stage_b_auth_hotfix.sql)
-- WARNING: restores USING (true) cross-user exposure on shortlists/employer_leads
-- and open practice_locations writes.

DROP POLICY IF EXISTS shortlists_select_own ON public.shortlists;
DROP POLICY IF EXISTS shortlists_insert_own ON public.shortlists;
DROP POLICY IF EXISTS shortlists_delete_own ON public.shortlists;

CREATE POLICY auth_read ON public.shortlists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.shortlists
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_delete ON public.shortlists
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS employer_leads_select_admin ON public.employer_leads;
DROP POLICY IF EXISTS employer_leads_update_admin ON public.employer_leads;
DROP POLICY IF EXISTS employer_leads_insert_admin ON public.employer_leads;

CREATE POLICY auth_read ON public.employer_leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_update ON public.employer_leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS practice_locations_select_authenticated ON public.practice_locations;
DROP POLICY IF EXISTS practice_locations_insert_admin ON public.practice_locations;
DROP POLICY IF EXISTS practice_locations_update_admin ON public.practice_locations;

CREATE POLICY "Authenticated users can read practice locations"
  ON public.practice_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read ON public.practice_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.practice_locations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.practice_locations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
