-- Browser clients read practice_locations with the publishable key + user session.
-- Table-level SELECT was missing, which made list filters/map/detail locations empty.

GRANT SELECT ON public.practice_locations TO anon, authenticated;

ALTER TABLE public.practice_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read practice locations"
  ON public.practice_locations;

CREATE POLICY "Authenticated users can read practice locations"
  ON public.practice_locations
  FOR SELECT
  TO authenticated
  USING (true);
