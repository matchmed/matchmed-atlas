-- Allow practice editors to hard-delete employer-asserted locations.
-- Matches insert/update authorization: can_edit_practice or Atlas admin.

CREATE POLICY employer_practice_locations_delete
  ON public.employer_practice_locations
  FOR DELETE
  TO authenticated
  USING (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

GRANT DELETE ON public.employer_practice_locations TO authenticated;
