-- Stage B: authenticated security hotfix
-- Prerequisites (live): physician jobs RPCs; app no longer reads employer_leads on physician surfaces.
-- - shortlists: owner-only SELECT/INSERT/DELETE (physician_id = profiles.id)
-- - employer_leads: admin-only table access (physicians use list_physician_jobs* RPCs)
-- - practice_locations: authenticated SELECT retained; INSERT/UPDATE admin-only; dedupe read policies

-- B1) shortlists
DROP POLICY IF EXISTS auth_read ON public.shortlists;
DROP POLICY IF EXISTS auth_insert ON public.shortlists;
DROP POLICY IF EXISTS auth_delete ON public.shortlists;

CREATE POLICY shortlists_select_own
  ON public.shortlists
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = shortlists.physician_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY shortlists_insert_own
  ON public.shortlists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = shortlists.physician_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY shortlists_delete_own
  ON public.shortlists
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = shortlists.physician_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

-- B2) employer_leads — administrators only (is_atlas_admin)
DROP POLICY IF EXISTS auth_read ON public.employer_leads;
DROP POLICY IF EXISTS auth_update ON public.employer_leads;
DROP POLICY IF EXISTS employer_leads_select_admin ON public.employer_leads;
DROP POLICY IF EXISTS employer_leads_update_admin ON public.employer_leads;
DROP POLICY IF EXISTS employer_leads_insert_admin ON public.employer_leads;

CREATE POLICY employer_leads_select_admin
  ON public.employer_leads
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_atlas_admin()));

CREATE POLICY employer_leads_update_admin
  ON public.employer_leads
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_atlas_admin()))
  WITH CHECK ((SELECT public.is_atlas_admin()));

CREATE POLICY employer_leads_insert_admin
  ON public.employer_leads
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_atlas_admin()));

-- B3) practice_locations — read for authenticated; write admin-only
DROP POLICY IF EXISTS auth_insert ON public.practice_locations;
DROP POLICY IF EXISTS auth_update ON public.practice_locations;
DROP POLICY IF EXISTS "Authenticated users can read practice locations"
  ON public.practice_locations;
DROP POLICY IF EXISTS auth_read ON public.practice_locations;
DROP POLICY IF EXISTS practice_locations_select_authenticated
  ON public.practice_locations;
DROP POLICY IF EXISTS practice_locations_insert_admin
  ON public.practice_locations;
DROP POLICY IF EXISTS practice_locations_update_admin
  ON public.practice_locations;

CREATE POLICY practice_locations_select_authenticated
  ON public.practice_locations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY practice_locations_insert_admin
  ON public.practice_locations
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_atlas_admin()));

CREATE POLICY practice_locations_update_admin
  ON public.practice_locations
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_atlas_admin()))
  WITH CHECK ((SELECT public.is_atlas_admin()));
