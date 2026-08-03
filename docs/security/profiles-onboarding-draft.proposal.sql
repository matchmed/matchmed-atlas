-- PROPOSAL ONLY — do not apply without owner review and a production schema export.
-- Purpose: support idempotent profiles upserts keyed on user_id for onboarding drafts
-- and account saves (application code already assumes onConflict: 'user_id').
--
-- Repository status (2026-08-02):
-- - No tracked CREATE TABLE for public.profiles
-- - No tracked UNIQUE / PRIMARY KEY definitions for profiles
-- - No tracked RLS policies or grants for profiles
-- - No tracked trigger that creates profile rows on auth.users insert
-- - Only related tracked change: is_internal column
--   (supabase/migrations/20260801200000_profiles_is_internal.sql)
--
-- Run the inventory queries first against production. Apply only statements that
-- are missing. Do not invent column nullability from UI forms.

-- =============================================================================
-- 0) Inventory (read-only) — paste results before applying anything below
-- =============================================================================

-- SELECT
--   c.column_name, c.data_type, c.is_nullable, c.column_default
-- FROM information_schema.columns c
-- WHERE c.table_schema = 'public' AND c.table_name = 'profiles'
-- ORDER BY c.ordinal_position;

-- SELECT
--   i.relname AS index_name,
--   ix.indisunique AS is_unique,
--   ix.indisprimary AS is_primary,
--   pg_get_indexdef(ix.indexrelid) AS index_def
-- FROM pg_index ix
-- JOIN pg_class t ON t.oid = ix.indrelid
-- JOIN pg_namespace n ON n.oid = t.relnamespace
-- JOIN pg_class i ON i.oid = ix.indexrelid
-- WHERE n.nspname = 'public' AND t.relname = 'profiles';

-- SELECT pol.polname, pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
--        pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
-- FROM pg_policy pol
-- JOIN pg_class c ON c.oid = pol.polrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'profiles';

-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'profiles';

-- SELECT tgname, pg_get_triggerdef(t.oid)
-- FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'profiles' AND NOT t.tgisinternal;

-- =============================================================================
-- 1) Unique constraint on user_id — REQUIRED for onConflict: 'user_id'
-- =============================================================================
-- Why: PostgREST upsert ON CONFLICT (user_id) fails without a unique index/constraint.
-- Application paths: onboarding draft create, step save, completion, account save.

-- Only if inventory shows no unique index on user_id:
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS profiles_user_id_uidx
--   ON public.profiles (user_id);
--
-- Prefer a constraint if no concurrent requirement:
-- ALTER TABLE public.profiles
--   ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);

-- If duplicates already exist, resolve them before adding the constraint:
-- SELECT user_id, count(*) FROM public.profiles
-- WHERE user_id IS NOT NULL
-- GROUP BY user_id HAVING count(*) > 1;

-- =============================================================================
-- 2) Grants — REQUIRED for browser client upsert/select of own row
-- =============================================================================
-- Why: authenticated role must be able to INSERT/UPDATE/SELECT own profiles.
-- Do not grant to anon.

-- GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
-- -- Include DELETE only if product policy requires hard deletes (current app uses soft delete).

-- =============================================================================
-- 3) RLS — REQUIRED so users can only touch their own row
-- =============================================================================
-- Why: browser uses publishable key; RLS is the authorization boundary.
-- Policies below are proposals; confirm names do not collide with production.

-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY profiles_select_own
--   ON public.profiles
--   FOR SELECT
--   TO authenticated
--   USING (user_id = (SELECT auth.uid()));

-- CREATE POLICY profiles_insert_own
--   ON public.profiles
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (user_id = (SELECT auth.uid()));

-- CREATE POLICY profiles_update_own
--   ON public.profiles
--   FOR UPDATE
--   TO authenticated
--   USING (user_id = (SELECT auth.uid()))
--   WITH CHECK (user_id = (SELECT auth.uid()));

-- Admin NPI verify / soft-delete currently updates by profile id from the browser.
-- If production relies on a separate is_admin policy for those updates, preserve it.
-- Example (only if admins must update other users' rows):
-- CREATE POLICY profiles_admin_update
--   ON public.profiles
--   FOR UPDATE
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles AS me
--       WHERE me.user_id = (SELECT auth.uid()) AND me.is_admin IS TRUE
--     )
--   )
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.profiles AS me
--       WHERE me.user_id = (SELECT auth.uid()) AND me.is_admin IS TRUE
--     )
--   );

-- =============================================================================
-- 4) Optional: reject completed-profile regression via trigger
-- =============================================================================
-- Why: application avoids resetting completed profiles, but DB can enforce it.
-- Owner confirmation required before applying.

-- CREATE OR REPLACE FUNCTION public.profiles_prevent_incomplete_regression()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SET search_path = ''
-- AS $$
-- BEGIN
--   IF OLD.onboarding_complete IS TRUE AND NEW.onboarding_complete IS DISTINCT FROM TRUE THEN
--     RAISE EXCEPTION 'profiles.onboarding_complete cannot be cleared'
--       USING ERRCODE = 'check_violation';
--   END IF;
--   RETURN NEW;
-- END;
-- $$;

-- DROP TRIGGER IF EXISTS profiles_before_incomplete_regression ON public.profiles;
-- CREATE TRIGGER profiles_before_incomplete_regression
--   BEFORE UPDATE ON public.profiles
--   FOR EACH ROW
--   EXECUTE FUNCTION public.profiles_before_incomplete_regression();

-- =============================================================================
-- 5) Explicit non-goals for this proposal
-- =============================================================================
-- - Do NOT create auth.users → profiles insert triggers here without product owner
--   approval (app now creates draft rows on onboarding load).
-- - Do NOT change email uniqueness or link-by-email semantics (email fallback removed
--   in app; legacy email-only rows need a one-time migration plan).
-- - Do NOT apply from CI without a production inventory paste.
