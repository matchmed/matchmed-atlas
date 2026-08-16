-- Remove Retention Score from the anonymous public practice RPC.
-- Authenticated analysis continues to read practices.retention_score via RLS,
-- not this RPC. Signature is unchanged (uuid → jsonb), so CREATE OR REPLACE
-- does not require DROP and existing EXECUTE grants are preserved.
-- REVOKE/GRANT below match the prior public_get_practice contract.

CREATE OR REPLACE FUNCTION public.public_get_practice(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
           'id', p.id,
           'practice_name', p.practice_name,
           'phone', p.phone,
           'website', p.website,
           'latest_roster_size', p.latest_roster_size,
           'latest_cms_observation_year', (
             SELECT MAX(a.last_seen_year_at_org)
             FROM public.affiliations AS a
             WHERE a.practice_id = p.id
               AND public._public_is_current_roster_status(a.status)
           )
         )
  INTO result
  FROM public.practices AS p
  WHERE p.id = p_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_practice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_practice(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_get_practice(uuid) TO authenticated;
