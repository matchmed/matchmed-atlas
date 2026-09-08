-- Authenticated list filter: practice IDs that are publicly verified + physician-ready.
-- IDs only — no Layer 3 content. Matches public overlay physician_ready gate.

CREATE OR REPLACE FUNCTION public.list_physician_ready_practice_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT epp.practice_id
  FROM public.employer_practice_profiles AS epp
  WHERE epp.physician_ready_at IS NOT NULL
    AND public.employer_overlay_publicly_visible(epp.practice_id);
$$;

COMMENT ON FUNCTION public.list_physician_ready_practice_ids() IS
  'Returns practice IDs with active verified employer overlay and physician_ready_at set. For authenticated list filters only.';

REVOKE ALL ON FUNCTION public.list_physician_ready_practice_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_physician_ready_practice_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_physician_ready_practice_ids() TO authenticated;
