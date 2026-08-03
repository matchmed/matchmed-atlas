-- =============================================================================
-- READ-ONLY inventory for employer_leads publication review.
-- Run in Supabase SQL Editor. No email/phone/POC/source returned.
-- =============================================================================

SELECT
  el.id,
  el.practice_name,
  (el.practice_id IS NOT NULL) AS has_practice_id,
  el.primary_location,
  el.practice_setting,
  el.ideal_hiring_timeline,
  el.received_at::date AS received_date,
  (
    el.additional_details IS NOT NULL
    AND length(btrim(el.additional_details)) > 0
  ) AS has_additional_details,
  CASE
    WHEN el.practice_id IS NULL THEN false
    WHEN el.practice_name IS NULL OR btrim(el.practice_name) = '' THEN false
    WHEN el.primary_location IS NULL OR btrim(el.primary_location) = '' THEN false
    WHEN COALESCE(length(btrim(el.additional_details)), 0) = 0
      AND el.practice_setting IS NULL
      AND el.clinical_surgical_mix IS NULL
      AND el.ideal_hiring_timeline IS NULL
      AND (
        el.subspecialties_interest IS NULL
        OR cardinality(el.subspecialties_interest) = 0
      )
      THEN false
    ELSE true
  END AS appears_complete_enough,
  -- Initial publication recommendation: default unpublished.
  -- Rows with appears_complete_enough = true are candidates for manual publish only.
  false AS proposed_is_published,
  CASE
    WHEN el.practice_id IS NULL THEN 'unlinked_admin_only'
    WHEN el.practice_name IS NULL OR btrim(el.practice_name) = '' THEN 'incomplete_missing_name'
    WHEN el.primary_location IS NULL OR btrim(el.primary_location) = '' THEN 'incomplete_missing_location'
    WHEN COALESCE(length(btrim(el.additional_details)), 0) = 0
      AND el.practice_setting IS NULL
      AND el.clinical_surgical_mix IS NULL
      AND el.ideal_hiring_timeline IS NULL
      AND (
        el.subspecialties_interest IS NULL
        OR cardinality(el.subspecialties_interest) = 0
      )
      THEN 'sparse_content'
    ELSE 'candidate_for_manual_publish'
  END AS review_bucket
FROM public.employer_leads AS el
ORDER BY el.received_at DESC NULLS LAST, el.id;

-- Summary counts
SELECT
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE practice_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE practice_id IS NULL) AS unlinked,
  COUNT(*) FILTER (
    WHERE practice_id IS NOT NULL
      AND practice_name IS NOT NULL AND btrim(practice_name) <> ''
      AND primary_location IS NOT NULL AND btrim(primary_location) <> ''
      AND NOT (
        COALESCE(length(btrim(additional_details)), 0) = 0
        AND practice_setting IS NULL
        AND clinical_surgical_mix IS NULL
        AND ideal_hiring_timeline IS NULL
        AND (subspecialties_interest IS NULL OR cardinality(subspecialties_interest) = 0)
      )
  ) AS candidate_for_manual_publish
FROM public.employer_leads;
