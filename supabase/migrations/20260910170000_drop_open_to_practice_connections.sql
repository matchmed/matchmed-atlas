-- Drop retired profiles.open_to_practice_connections.
-- Consent SoT is profiles.data_sharing. Physician-initiated Connect unchanged.
-- Removes misleading JSON alias key from Connect physician payloads.

CREATE OR REPLACE FUNCTION public._connect_anonymous_physician_json(p_profile public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'physician_profile_id', p_profile.id,
    'training_status', p_profile.training_status,
    'clinical_focus', to_jsonb(p_profile.clinical_focus),
    'preferred_state', to_jsonb(p_profile.preferred_state),
    'start_year', p_profile.start_year,
    'practice_setting_preference', to_jsonb(p_profile.practice_setting_preference)
  );
$$;

CREATE OR REPLACE FUNCTION public._connect_unlocked_physician_json(p_profile public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'physician_profile_id', p_profile.id,
    'first_name', p_profile.first_name,
    'last_name', p_profile.last_name,
    'email', p_profile.email,
    'phone', p_profile.phone,
    'npi', p_profile.npi,
    'npi_verified', p_profile.npi_verified,
    'training_status', p_profile.training_status,
    'clinical_focus', to_jsonb(p_profile.clinical_focus),
    'preferred_state', to_jsonb(p_profile.preferred_state),
    'start_year', p_profile.start_year,
    'practice_setting_preference', to_jsonb(p_profile.practice_setting_preference),
    'current_practice', p_profile.current_practice,
    'procedures_performed', to_jsonb(p_profile.procedures_performed),
    'procedures_desired', to_jsonb(p_profile.procedures_desired)
  );
$$;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS open_to_practice_connections;
