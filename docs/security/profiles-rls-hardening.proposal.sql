-- =============================================================================
-- PROPOSAL ONLY — DO NOT APPLY AUTOMATICALLY.
-- profiles RLS hardening (coordinated with admin RPC app changes).
-- Generated: 2026-08-02
-- =============================================================================
-- Prerequisites (confirmed in production):
--   - profiles.user_id UNIQUE + FK to auth.users(id) ON DELETE CASCADE
--   - RLS enabled; authenticated has SELECT/INSERT/UPDATE table privileges
--   - Canonical own-row policies already exist and work:
--       profiles_insert_own, profiles_select_own, profiles_update_own
--   - Broad/duplicate policies still present (see Stage C / Rollback)
--
-- Explicit non-goals:
--   - Do not modify the 14 legacy email-only profile rows
--   - Do not add a service-role client
--   - Do not alter onboarding / Account Save / self soft-delete app flows
--
-- -----------------------------------------------------------------------------
-- TWO-STAGE (+ cleanup) ROLLOUT — app deploy and SQL are not atomic
-- -----------------------------------------------------------------------------
-- Stage A (backward-compatible SQL — apply FIRST):
--   Create is_atlas_admin(), profiles_select_admin, admin RPCs.
--   Leave broad policies and table-level INSERT/UPDATE grants intact.
--   Admin list/reports keep working via auth_read OR profiles_select_admin.
--   Admin UI can still use direct UPDATE OR new RPCs.
--
-- Stage B (application deploy — SECOND):
--   Deploy app that calls admin_set_profile_npi_verified / admin_soft_delete_profile.
--   Direct admin UPDATE still works until Stage C (safe overlap).
--
-- Stage C (lockdown — LAST, after Stage B is live and verified):
--   DROP broad policies; REVOKE/GRANT column privileges.
--   After this, admin mutations MUST use RPCs; normal users cannot touch
--   privilege columns even if they craft Data API requests.
--
-- One transaction: Stage A can be one transaction. Stage C should be a
-- separate transaction after app deploy. Do not combine A+C before the app
-- RPC clients are live — that would break admin NPI/delete until the app ships.
-- Combining A+C after the app is live is fine as a single maintenance window.
-- =============================================================================


-- #############################################################################
-- STAGE A — backward-compatible additions
-- #############################################################################

BEGIN;

-- -----------------------------------------------------------------------------
-- A1) Admin-check helper
-- -----------------------------------------------------------------------------
-- Why SECURITY DEFINER avoids recursive RLS:
--   Policy profiles_select_admin will call is_atlas_admin(). If that function
--   were SECURITY INVOKER, reading public.profiles inside it would re-enter RLS
--   (including profiles_select_admin), causing recursion or always-false checks.
--   As SECURITY DEFINER with an empty search_path, the function runs as its
--   owner. Table owners typically bypass RLS (unless FORCE ROW LEVEL SECURITY),
--   so the helper can read the caller's own is_admin flag without policy loops.
CREATE OR REPLACE FUNCTION public.is_atlas_admin()
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
        SELECT p.is_admin IS TRUE
        FROM public.profiles AS p
        WHERE p.user_id = (SELECT auth.uid())
        LIMIT 1
      ),
      false
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_atlas_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_atlas_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- A2) Admin SELECT policy (required once auth_read is removed in Stage C)
-- -----------------------------------------------------------------------------
-- Safe to add now: OR-combined with existing SELECT policies; no access regression.
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_atlas_admin());

-- Preserve (do not drop):
--   profiles_select_own
--   profiles_insert_own
--   profiles_update_own

-- -----------------------------------------------------------------------------
-- A3) Narrow admin RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_profile_npi_verified(
  target_profile_id uuid,
  verified boolean
)
RETURNS TABLE (id uuid, npi_verified boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  out_id uuid;
  out_verified boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles AS p
  SET npi_verified = verified
  WHERE p.id = target_profile_id
  RETURNING p.id, p.npi_verified
  INTO out_id, out_verified;

  IF out_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  id := out_id;
  npi_verified := out_verified;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_profile_npi_verified(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_npi_verified(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_profile(
  target_profile_id uuid
)
RETURNS TABLE (id uuid, deleted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  out_id uuid;
  out_deleted_at timestamptz;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles AS p
  SET deleted_at = now()
  WHERE p.id = target_profile_id
  RETURNING p.id, p.deleted_at
  INTO out_id, out_deleted_at;

  IF out_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  id := out_id;
  deleted_at := out_deleted_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_soft_delete_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_profile(uuid) TO authenticated;

COMMIT;

-- After Stage A: deploy application that uses the RPCs (Stage B), then run Stage C.


-- #############################################################################
-- STAGE C — lockdown (apply ONLY after Stage B app is live)
-- #############################################################################

BEGIN;

-- -----------------------------------------------------------------------------
-- C1) Drop broad / duplicate permissive policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS auth_read ON public.profiles;

-- -----------------------------------------------------------------------------
-- C2) Column privileges for authenticated
-- -----------------------------------------------------------------------------
-- Keep table-level SELECT; RLS controls which rows are visible.
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;

GRANT INSERT (
  user_id,
  email,
  first_name,
  last_name,
  phone,
  npi,
  training_status,
  clinical_focus,
  current_practice,
  start_year,
  preferred_state,
  procedures_performed,
  procedures_desired,
  terms_accepted,
  data_sharing,
  signup_date,
  onboarding_complete,
  practice_setting_preference
) ON TABLE public.profiles TO authenticated;

GRANT UPDATE (
  user_id,
  email,
  first_name,
  last_name,
  phone,
  npi,
  training_status,
  clinical_focus,
  current_practice,
  start_year,
  preferred_state,
  procedures_performed,
  procedures_desired,
  terms_accepted,
  data_sharing,
  signup_date,
  onboarding_complete,
  practice_setting_preference,
  deleted_at
) ON TABLE public.profiles TO authenticated;

-- Explicitly not granted to authenticated for INSERT/UPDATE:
--   id, airtable_id, npi_verified, created_at, is_admin, is_internal
-- user_id is granted on UPDATE only because the application uses upsert.
-- PostgREST ON CONFLICT DO UPDATE commonly includes conflict-target columns in
-- the SET list; without UPDATE(user_id), draft/complete/Account upserts can 403
-- even when the value is unchanged. RLS (profiles_update_own) still requires
-- user_id = auth.uid() on both USING and WITH CHECK, so a caller cannot
-- reassign the row to another UUID.

COMMIT;


-- #############################################################################
-- EMERGENCY ROLLBACK ONLY — recreates the prior permissive policies
-- #############################################################################
-- WARNING: Restoring these re-opens cross-user SELECT/INSERT/UPDATE holes.
-- Prefer fixing forward. Capture was based on production definitions provided
-- in the hardening review (WITH CHECK true / USING true / auth.uid() = user_id).
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
--
-- DROP FUNCTION IF EXISTS public.admin_set_profile_npi_verified(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.admin_soft_delete_profile(uuid);
-- DROP FUNCTION IF EXISTS public.is_atlas_admin();
--
-- -- Recreate broad policies (roles omitted → PUBLIC, matching typical Supabase)
-- CREATE POLICY "Users can insert own profile"
--   ON public.profiles
--   FOR INSERT
--   WITH CHECK (true);
--
-- CREATE POLICY "Users can read own profile"
--   ON public.profiles
--   FOR SELECT
--   USING (auth.uid() = user_id);
--
-- CREATE POLICY "Users can update own profile"
--   ON public.profiles
--   FOR UPDATE
--   USING (true)
--   WITH CHECK (true);
--
-- CREATE POLICY auth_read
--   ON public.profiles
--   FOR SELECT
--   USING (true);
--
-- -- Restore broad column access if Stage C grants were applied:
-- GRANT INSERT, UPDATE ON TABLE public.profiles TO authenticated;
--
-- COMMIT;
--
-- Also redeploy the previous admin page that uses direct .update() if RPCs
-- were dropped.
