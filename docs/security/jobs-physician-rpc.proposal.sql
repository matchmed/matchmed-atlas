-- Sanitized physician-facing jobs RPCs.
-- Prerequisites: employer_leads.is_published (20260803010000).
-- Returns only published, practice-linked listings; no contact/source fields.
-- Auth: onboarded non-deleted profile, or admin (is_atlas_analysis_authorized).

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

CREATE OR REPLACE FUNCTION public.list_physician_jobs(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lim integer;
  off integer;
  result jsonb;
BEGIN
  IF NOT (SELECT public.is_atlas_analysis_authorized()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  lim := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  off := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.received_at DESC NULLS LAST, x.id), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      el.id,
      el.practice_name,
      el.practice_id,
      el.primary_location,
      el.practice_setting,
      el.clinical_surgical_mix,
      el.ideal_hiring_timeline,
      el.subspecialties_interest,
      el.additional_details,
      el.received_at
    FROM public.employer_leads AS el
    WHERE el.is_published IS TRUE
      AND el.practice_id IS NOT NULL
    ORDER BY el.received_at DESC NULLS LAST, el.id
    LIMIT lim
    OFFSET off
  ) AS x;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_physician_jobs(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_physician_jobs(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_physician_jobs_for_practice(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT (SELECT public.is_atlas_analysis_authorized()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.received_at DESC NULLS LAST, x.id), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      el.id,
      el.practice_name,
      el.practice_id,
      el.primary_location,
      el.practice_setting,
      el.clinical_surgical_mix,
      el.ideal_hiring_timeline,
      el.subspecialties_interest,
      el.additional_details,
      el.received_at
    FROM public.employer_leads AS el
    WHERE el.practice_id = p_practice_id
      AND el.is_published IS TRUE
    ORDER BY el.received_at DESC NULLS LAST, el.id
    LIMIT 50
  ) AS x;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_physician_jobs_for_practice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_physician_jobs_for_practice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_physician_jobs()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT public.is_atlas_analysis_authorized()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COUNT(*)::bigint
    FROM public.employer_leads AS el
    WHERE el.is_published IS TRUE
      AND el.practice_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_physician_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_physician_jobs() TO authenticated;
