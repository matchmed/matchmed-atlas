-- Expand roster assertions for practice-reported former classifications.
-- Additive: report_retired, report_locums_contractor.

ALTER TABLE public.employer_roster_assertions
  DROP CONSTRAINT IF EXISTS employer_roster_assertions_assertion_check;

ALTER TABLE public.employer_roster_assertions
  ADD CONSTRAINT employer_roster_assertions_assertion_check
  CHECK (assertion IN (
    'confirm_current',
    'report_departed',
    'billing_only',
    'incorrect_association',
    'affiliated_elsewhere_in_org',
    'report_still_affiliated',
    'confirm_former',
    'report_retired',
    'report_locums_contractor',
    'other'
  ));

COMMENT ON CONSTRAINT employer_roster_assertions_assertion_check
  ON public.employer_roster_assertions IS
  'Layer 3 practice-reported roster context, including retired and locums/contractor.';
