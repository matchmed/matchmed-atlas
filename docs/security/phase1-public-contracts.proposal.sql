-- =============================================================================
-- PROPOSAL ONLY — DO NOT APPLY until Phase 0 catalog + status precheck are done.
-- Phase 1 revised public contracts (2026-08-01).
-- =============================================================================
-- Prerequisites before apply:
--   1) Paste production SQL Editor catalog into Phase 0 report.
--   2) Run affiliation status distinct query (below) and set ON_ROSTER_STATUSES.
--   3) Create + verify RPCs (this file, Part A) while anon table SELECT remains.
--   4) Only then consider Part B (separate): REVOKE anon SELECT on base tables.
--
-- Explicitly out of scope for this file:
--   - Changing authenticated table grants / RLS
--   - Integrating is_atlas_analysis_authorized into policies (deferred)
--   - Proxy / UI / PostHog
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PRECHECK (run read-only in SQL Editor; paste results into Phase 0 report)
-- ---------------------------------------------------------------------------
-- SELECT status, COUNT(*) AS n
-- FROM public.affiliations
-- GROUP BY status
-- ORDER BY n DESC;
--
-- After results are known, replace the body of public._public_is_current_roster_status
-- so it matches ONLY verified current-roster values (exact strings).

-- ###########################################################################
-- PART A — create RPCs + grants (safe to review; leave anon table SELECT as-is)
-- ###########################################################################

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Private helper: current-roster predicate (PROVISIONAL — replace after precheck)
CREATE OR REPLACE FUNCTION public._public_is_current_roster_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- PROVISIONAL: mirrors application code
  -- (lower(status) = 'on roster') in src/app/practices/[id]/page.tsx
  -- and src/app/physicians/[id]/page.tsx.
  -- REPLACE with exact verified literals after DISTINCT status precheck, e.g.:
  --   SELECT p_status = ANY (ARRAY['On Roster'::text]);
  SELECT lower(btrim(COALESCE(p_status, ''))) = 'on roster';
$$;

REVOKE ALL ON FUNCTION public._public_is_current_roster_status(text) FROM PUBLIC;
-- No EXECUTE grant to anon/authenticated: internal helper only.

-- Private search normalization (not granted to clients)
CREATE OR REPLACE FUNCTION public._public_normalize_search_query(q text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  cleaned text;
BEGIN
  IF q IS NULL THEN
    RAISE EXCEPTION 'invalid search query' USING ERRCODE = '22023';
  END IF;
  IF q ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN
    RAISE EXCEPTION 'invalid search query' USING ERRCODE = '22023';
  END IF;
  cleaned := lower(btrim(q));
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  IF char_length(cleaned) < 3 THEN
    RAISE EXCEPTION 'search query too short' USING ERRCODE = '22023';
  END IF;
  IF char_length(cleaned) > 64 THEN
    RAISE EXCEPTION 'search query too long' USING ERRCODE = '22023';
  END IF;
  RETURN cleaned;
END;
$$;

REVOKE ALL ON FUNCTION public._public_normalize_search_query(text) FROM PUBLIC;

-- Analysis authorization helper — PRIVATE; no client EXECUTE grants.
-- Policy / authorized-loader integration deferred to a later phase.
CREATE OR REPLACE FUNCTION public.is_atlas_analysis_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.deleted_at IS NULL
      AND (
        p.onboarding_complete IS TRUE
        OR p.is_admin IS TRUE
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_atlas_analysis_authorized() FROM PUBLIC;
-- Intentionally NOT granted to anon or authenticated in Phase 1.

-- 1) Public unified search
CREATE OR REPLACE FUNCTION public.public_search(q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nq text;
  practice_hits jsonb;
  physician_hits jsonb;
BEGIN
  nq := public._public_normalize_search_query(q);

  SELECT COALESCE(
           jsonb_agg(to_jsonb(x) ORDER BY x.practice_name, x.id),
           '[]'::jsonb
         )
  INTO practice_hits
  FROM (
    SELECT
      p.id,
      p.practice_name,
      (
        SELECT pl.city
        FROM public.practice_locations AS pl
        WHERE pl.practice_id = p.id
        ORDER BY pl.doctor_count DESC NULLS LAST,
                 pl.rank_by_doctors ASC NULLS LAST,
                 pl.id
        LIMIT 1
      ) AS city,
      (
        SELECT pl.state
        FROM public.practice_locations AS pl
        WHERE pl.practice_id = p.id
        ORDER BY pl.doctor_count DESC NULLS LAST,
                 pl.rank_by_doctors ASC NULLS LAST,
                 pl.id
        LIMIT 1
      ) AS state,
      (
        SELECT COUNT(*)::integer
        FROM public.practice_locations AS pl
        WHERE pl.practice_id = p.id
      ) AS location_count
    FROM public.practices AS p
    WHERE p.practice_name ILIKE '%' || nq || '%'
    ORDER BY
      CASE
        WHEN lower(p.practice_name) = nq THEN 0
        WHEN lower(p.practice_name) LIKE nq || '%' THEN 1
        ELSE 2
      END,
      p.practice_name ASC,
      p.id ASC
    LIMIT 5
  ) AS x;

  SELECT COALESCE(
           jsonb_agg(to_jsonb(x) ORDER BY x.physician_name, x.id),
           '[]'::jsonb
         )
  INTO physician_hits
  FROM (
    SELECT
      d.id,
      d.physician_name,
      pr.practice_name AS current_practice_name,
      COALESCE(
        NULLIF(split_part(COALESCE(a.city_st, ''), ',', 1), ''),
        (
          SELECT pl.city
          FROM public.practice_locations AS pl
          WHERE pl.practice_id = a.practice_id
          ORDER BY pl.doctor_count DESC NULLS LAST,
                   pl.rank_by_doctors ASC NULLS LAST
          LIMIT 1
        )
      ) AS city,
      COALESCE(
        NULLIF(btrim(split_part(COALESCE(a.city_st, ''), ',', 2)), ''),
        (
          SELECT pl.state
          FROM public.practice_locations AS pl
          WHERE pl.practice_id = a.practice_id
          ORDER BY pl.doctor_count DESC NULLS LAST,
                   pl.rank_by_doctors ASC NULLS LAST
          LIMIT 1
        )
      ) AS state
    FROM public.doctors AS d
    LEFT JOIN LATERAL (
      SELECT aff.practice_id, aff.city_st
      FROM public.affiliations AS aff
      WHERE aff.doctor_id = d.id
        AND public._public_is_current_roster_status(aff.status)
      ORDER BY aff.last_seen_year_at_org DESC NULLS LAST, aff.id
      LIMIT 1
    ) AS a ON TRUE
    LEFT JOIN public.practices AS pr ON pr.id = a.practice_id
    WHERE d.physician_name ILIKE '%' || nq || '%'
    ORDER BY
      CASE
        WHEN lower(d.physician_name) = nq THEN 0
        WHEN lower(d.physician_name) LIKE nq || '%' THEN 1
        ELSE 2
      END,
      d.physician_name ASC,
      d.id ASC
    LIMIT 5
  ) AS x;

  RETURN jsonb_build_object(
    'practices', practice_hits,
    'physicians', physician_hits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_search(text) TO anon;
GRANT EXECUTE ON FUNCTION public.public_search(text) TO authenticated;

-- 2) Public practice identity (no org_pac_id)
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

-- 3) Public practice locations (no lat/long)
CREATE OR REPLACE FUNCTION public.public_get_practice_locations(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
           jsonb_agg(to_jsonb(x) ORDER BY x.sort_doctor_count DESC NULLS LAST,
                                         x.sort_rank ASC NULLS LAST,
                                         x.id),
           '[]'::jsonb
         )
  FROM (
    SELECT
      pl.id,
      pl.address,
      pl.city,
      pl.state,
      pl.zip,
      pl.doctor_count AS sort_doctor_count,
      pl.rank_by_doctors AS sort_rank
    FROM public.practice_locations AS pl
    WHERE pl.practice_id = p_id
  ) AS x;
$$;

REVOKE ALL ON FUNCTION public.public_get_practice_locations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_practice_locations(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_get_practice_locations(uuid) TO authenticated;

-- 4) Public current practice roster
CREATE OR REPLACE FUNCTION public.public_get_practice_roster(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
           jsonb_agg(to_jsonb(x) ORDER BY x.physician_name, x.id),
           '[]'::jsonb
         )
  FROM (
    SELECT
      d.id,
      d.physician_name
    FROM public.affiliations AS a
    JOIN public.doctors AS d ON d.id = a.doctor_id
    WHERE a.practice_id = p_id
      AND public._public_is_current_roster_status(a.status)
  ) AS x;
$$;

REVOKE ALL ON FUNCTION public.public_get_practice_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_practice_roster(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_get_practice_roster(uuid) TO authenticated;

-- 5+6) Public physician identity + current affiliation
CREATE OR REPLACE FUNCTION public.public_get_physician(p_id uuid)
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
           'id', d.id,
           'physician_name', d.physician_name,
           'npi', d.npi,
           'current_practice_id', a.practice_id,
           'current_practice_name', pr.practice_name,
           'city', COALESCE(
             NULLIF(split_part(COALESCE(a.city_st, ''), ',', 1), ''),
             (
               SELECT pl.city
               FROM public.practice_locations AS pl
               WHERE pl.practice_id = a.practice_id
               ORDER BY pl.doctor_count DESC NULLS LAST,
                        pl.rank_by_doctors ASC NULLS LAST
               LIMIT 1
             )
           ),
           'state', COALESCE(
             NULLIF(btrim(split_part(COALESCE(a.city_st, ''), ',', 2)), ''),
             (
               SELECT pl.state
               FROM public.practice_locations AS pl
               WHERE pl.practice_id = a.practice_id
               ORDER BY pl.doctor_count DESC NULLS LAST,
                        pl.rank_by_doctors ASC NULLS LAST
               LIMIT 1
             )
           ),
           'latest_cms_observation_year', a.last_seen_year_at_org
         )
  INTO result
  FROM public.doctors AS d
  LEFT JOIN LATERAL (
    SELECT aff.practice_id, aff.city_st, aff.last_seen_year_at_org
    FROM public.affiliations AS aff
    WHERE aff.doctor_id = d.id
      AND public._public_is_current_roster_status(aff.status)
    ORDER BY aff.last_seen_year_at_org DESC NULLS LAST, aff.id
    LIMIT 1
  ) AS a ON TRUE
  LEFT JOIN public.practices AS pr ON pr.id = a.practice_id
  WHERE d.id = p_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_physician(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_physician(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_get_physician(uuid) TO authenticated;

-- 7) Public rounded platform counts (raw counts; UI may round)
CREATE OR REPLACE FUNCTION public.public_platform_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'practice_count', (SELECT COUNT(*)::bigint FROM public.practices),
    'physician_count', (SELECT COUNT(*)::bigint FROM public.doctors),
    'as_of', (SELECT timezone('utc', now()))
  );
$$;

REVOKE ALL ON FUNCTION public.public_platform_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_platform_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.public_platform_counts() TO authenticated;

-- Supporting indexes (idempotent). Authenticated access unchanged.
CREATE INDEX IF NOT EXISTS practices_practice_name_trgm_idx
  ON public.practices
  USING gin (practice_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS doctors_physician_name_trgm_idx
  ON public.doctors
  USING gin (physician_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS affiliations_practice_id_status_idx
  ON public.affiliations (practice_id, status);

CREATE INDEX IF NOT EXISTS affiliations_doctor_id_status_idx
  ON public.affiliations (doctor_id, status);

COMMIT;

-- ###########################################################################
-- PART B — OPTIONAL LATER (only after Part A RPCs verified via Data API)
-- Does NOT change authenticated grants. Do not run in the same change window
-- as Part A without a verified rollback plan.
-- ###########################################################################
-- BEGIN;
-- REVOKE SELECT ON TABLE public.practices FROM anon;
-- REVOKE SELECT ON TABLE public.doctors FROM anon;
-- REVOKE SELECT ON TABLE public.affiliations FROM anon;
-- REVOKE SELECT ON TABLE public.practice_locations FROM anon;
-- REVOKE SELECT ON TABLE public.profiles FROM anon;
-- REVOKE SELECT ON TABLE public.shortlists FROM anon;
-- REVOKE SELECT ON TABLE public.employer_leads FROM anon;
-- COMMIT;
