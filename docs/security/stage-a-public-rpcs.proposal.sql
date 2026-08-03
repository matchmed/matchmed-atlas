-- =============================================================================
-- STAGE A — Public search RPC contracts (proposal mirror)
-- Tracked migration: supabase/migrations/20260803050000_stage_a_public_search_rpcs.sql
-- Rollback: docs/security/stage-a-public-rpcs.rollback.sql
-- Anon table REVOKE is NOT included (docs/security/stage-a-anon-revoke.proposal.sql).
-- Does NOT redefine is_atlas_analysis_authorized() (Stage C / jobs depend on it).
-- =============================================================================

-- Stage A / public-search RPCs (Part A only)
-- Creates safe anonymous contracts for unified search, public practice/physician
-- identity, locations, current roster, and rounded platform counts.
-- Does NOT revoke anon base-table privileges (separate later migration).
-- Does NOT redefine is_atlas_analysis_authorized() (already live from Stage C).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Exact production roster literal
CREATE OR REPLACE FUNCTION public._public_is_current_roster_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p_status = 'On roster';
$$;

REVOKE ALL ON FUNCTION public._public_is_current_roster_status(text) FROM PUBLIC;

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

-- Escape ILIKE metacharacters for a normalized query (private helper).
CREATE OR REPLACE FUNCTION public._public_ilike_pattern(nq text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '%' || replace(replace(replace(nq, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

REVOKE ALL ON FUNCTION public._public_ilike_pattern(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.public_search(q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nq text;
  nq_pat text;
  practice_hits jsonb;
  physician_hits jsonb;
BEGIN
  nq := public._public_normalize_search_query(q);
  nq_pat := public._public_ilike_pattern(nq);

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.practice_name, x.id), '[]'::jsonb)
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
    WHERE p.practice_name ILIKE nq_pat ESCAPE '\'
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

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.physician_name, x.id), '[]'::jsonb)
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
                   pl.rank_by_doctors ASC NULLS LAST,
                   pl.id
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
                   pl.rank_by_doctors ASC NULLS LAST,
                   pl.id
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
    WHERE d.physician_name ILIKE nq_pat ESCAPE '\'
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

CREATE OR REPLACE FUNCTION public.public_get_practice_locations(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', x.id,
               'address', x.address,
               'city', x.city,
               'state', x.state,
               'zip', x.zip
             )
             ORDER BY x.sort_doctor_count DESC NULLS LAST,
                      x.sort_rank ASC NULLS LAST,
                      x.id
           ),
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

CREATE OR REPLACE FUNCTION public.public_get_practice_roster(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.physician_name, x.id), '[]'::jsonb)
  FROM (
    SELECT
      d.id,
      d.physician_name
    FROM public.affiliations AS a
    JOIN public.doctors AS d ON d.id = a.doctor_id
    WHERE a.practice_id = p_id
      AND public._public_is_current_roster_status(a.status)
    GROUP BY d.id, d.physician_name
  ) AS x;
$$;

REVOKE ALL ON FUNCTION public.public_get_practice_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_practice_roster(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_get_practice_roster(uuid) TO authenticated;

-- Physician identity + zero/one/many current affiliations (deduped by practice_id).
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
           'current_affiliations', COALESCE((
             SELECT jsonb_agg(to_jsonb(aff_row) ORDER BY aff_row.practice_name, aff_row.practice_id)
             FROM (
               SELECT DISTINCT ON (aff.practice_id)
                 aff.practice_id,
                 pr.practice_name,
                 COALESCE(
                   NULLIF(split_part(COALESCE(aff.city_st, ''), ',', 1), ''),
                   (
                     SELECT pl.city
                     FROM public.practice_locations AS pl
                     WHERE pl.practice_id = aff.practice_id
                     ORDER BY pl.doctor_count DESC NULLS LAST,
                              pl.rank_by_doctors ASC NULLS LAST,
                              pl.id
                     LIMIT 1
                   )
                 ) AS city,
                 COALESCE(
                   NULLIF(btrim(split_part(COALESCE(aff.city_st, ''), ',', 2)), ''),
                   (
                     SELECT pl.state
                     FROM public.practice_locations AS pl
                     WHERE pl.practice_id = aff.practice_id
                     ORDER BY pl.doctor_count DESC NULLS LAST,
                              pl.rank_by_doctors ASC NULLS LAST,
                              pl.id
                     LIMIT 1
                   )
                 ) AS state,
                 aff.last_seen_year_at_org AS latest_cms_observation_year
               FROM public.affiliations AS aff
               LEFT JOIN public.practices AS pr ON pr.id = aff.practice_id
               WHERE aff.doctor_id = d.id
                 AND public._public_is_current_roster_status(aff.status)
               ORDER BY aff.practice_id,
                        aff.last_seen_year_at_org DESC NULLS LAST,
                        aff.id
             ) AS aff_row
           ), '[]'::jsonb)
         )
  INTO result
  FROM public.doctors AS d
  WHERE d.id = p_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_physician(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_physician(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_get_physician(uuid) TO authenticated;

-- Floor to nearest 100 so exact inventory size is not disclosed.
CREATE OR REPLACE FUNCTION public.public_platform_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'practice_count', (
      SELECT ((COUNT(*)::bigint) / 100) * 100 FROM public.practices
    ),
    'physician_count', (
      SELECT ((COUNT(*)::bigint) / 100) * 100 FROM public.doctors
    ),
    'as_of', (SELECT timezone('utc', now()))
  );
$$;

REVOKE ALL ON FUNCTION public.public_platform_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_platform_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.public_platform_counts() TO authenticated;

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
