-- Physician-ready V1 — profile ownership, narrative, and completion columns.
-- Additive only. Does not change claim, org, or CMS tables.

ALTER TABLE public.employer_practice_profiles
  ADD COLUMN IF NOT EXISTS practice_ownership_structure text NULL,
  ADD COLUMN IF NOT EXISTS practice_ownership_other_text text NULL,
  ADD COLUMN IF NOT EXISTS physician_fit_description text NULL,
  ADD COLUMN IF NOT EXISTS future_practice_description text NULL,
  ADD COLUMN IF NOT EXISTS physician_ready_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS physician_ready_by uuid NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS infrastructure_last_reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS infrastructure_last_reviewed_by uuid NULL REFERENCES auth.users(id);

COMMENT ON COLUMN public.employer_practice_profiles.practice_ownership_structure IS
  'Employer-reported ownership structure. Does not affect MatchMed scores or CMS identity.';
COMMENT ON COLUMN public.employer_practice_profiles.practice_ownership_other_text IS
  'Optional short description when practice_ownership_structure = other. Physician-visible as practice-reported.';
COMMENT ON COLUMN public.employer_practice_profiles.physician_fit_description IS
  'Optional employer narrative: what kind of physician tends to thrive here (max 300).';
COMMENT ON COLUMN public.employer_practice_profiles.future_practice_description IS
  'Optional employer narrative: what the practice is building over 3-5 years (max 300).';
COMMENT ON COLUMN public.employer_practice_profiles.physician_ready_at IS
  'Set when the verified employer completes the physician-ready profile checklist. Sole public publication gate for recruiting/comp/ownership/infrastructure Layer 3 fields.';
COMMENT ON COLUMN public.employer_practice_profiles.infrastructure_last_reviewed_at IS
  'When the employer last completed an infrastructure-category review pass.';

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_ownership_structure_check;
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_ownership_structure_check
  CHECK (
    practice_ownership_structure IS NULL
    OR practice_ownership_structure IN (
      'solo',
      'physician_owned_group_practice',
      'pe_mso_owned',
      'hmo',
      'nonacademic_hospital_health_system',
      'academic_institution',
      'other'
    )
  );

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_ownership_other_text_len;
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_ownership_other_text_len
  CHECK (
    practice_ownership_other_text IS NULL
    OR char_length(btrim(practice_ownership_other_text)) BETWEEN 1 AND 120
  );

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_ownership_other_consistency;
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_ownership_other_consistency
  CHECK (
    practice_ownership_structure = 'other'
    OR practice_ownership_other_text IS NULL
  );

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_physician_fit_len;
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_physician_fit_len
  CHECK (
    physician_fit_description IS NULL
    OR char_length(physician_fit_description) <= 300
  );

ALTER TABLE public.employer_practice_profiles
  DROP CONSTRAINT IF EXISTS employer_practice_profiles_future_practice_len;
ALTER TABLE public.employer_practice_profiles
  ADD CONSTRAINT employer_practice_profiles_future_practice_len
  CHECK (
    future_practice_description IS NULL
    OR char_length(future_practice_description) <= 300
  );

-- Extend privileged-column guard so physician_ready_* cannot be set via direct UPDATE.
CREATE OR REPLACE FUNCTION public.enforce_employer_practice_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.employer_profile_privileged_write', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.is_atlas_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.public_display_name IS DISTINCT FROM OLD.public_display_name THEN
      RAISE EXCEPTION 'not authorized to set public_display_name' USING ERRCODE = '42501';
    END IF;
    IF NEW.proposed_display_name IS DISTINCT FROM OLD.proposed_display_name
       OR NEW.display_name_proposed_at IS DISTINCT FROM OLD.display_name_proposed_at
       OR NEW.display_name_proposed_by IS DISTINCT FROM OLD.display_name_proposed_by THEN
      RAISE EXCEPTION 'use propose_employer_display_name' USING ERRCODE = '42501';
    END IF;
    IF NEW.display_name_reviewed_at IS DISTINCT FROM OLD.display_name_reviewed_at
       OR NEW.display_name_reviewed_by IS DISTINCT FROM OLD.display_name_reviewed_by
       OR NEW.display_name_rejection_reason IS DISTINCT FROM OLD.display_name_rejection_reason THEN
      RAISE EXCEPTION 'not authorized to modify display name review fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.initial_review_completed_at IS DISTINCT FROM OLD.initial_review_completed_at
       OR NEW.initial_review_completed_by IS DISTINCT FROM OLD.initial_review_completed_by THEN
      RAISE EXCEPTION 'use complete_employer_initial_review' USING ERRCODE = '42501';
    END IF;
    IF NEW.physician_ready_at IS DISTINCT FROM OLD.physician_ready_at
       OR NEW.physician_ready_by IS DISTINCT FROM OLD.physician_ready_by THEN
      RAISE EXCEPTION 'use complete_employer_physician_ready' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
