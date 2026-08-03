-- Phase 0 companion: run read-only in Supabase SQL Editor (production).
-- Do not apply application migrations from this file. SELECT / catalog only.

-- 1) Extensions
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_trgm', 'unaccent', 'uuid-ossp', 'pgcrypto')
ORDER BY extname;

-- 2) RLS flags for core tables
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'practices','doctors','affiliations','practice_locations',
    'profiles','shortlists','employer_leads','practice_error_reports'
  )
ORDER BY c.relname;

-- 3) Policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'practices','doctors','affiliations','practice_locations',
    'profiles','shortlists','employer_leads','practice_error_reports'
  )
ORDER BY tablename, policyname;

-- 4) Table grants
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'practices','doctors','affiliations','practice_locations',
    'profiles','shortlists','employer_leads','practice_error_reports'
  )
  AND grantee IN ('anon','authenticated','service_role','postgres','public')
ORDER BY table_name, grantee, privilege_type;

-- 5) Column grants (if any)
SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name IN (
    'practices','doctors','affiliations','practice_locations','profiles'
  )
  AND grantee IN ('anon','authenticated','public')
ORDER BY table_name, column_name, grantee;

-- 6) Indexes on search / identity columns
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('practices','doctors','affiliations','practice_locations','profiles')
ORDER BY tablename, indexname;

-- 7) Views / matviews in public
SELECT table_type, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type IN ('VIEW', 'BASE TABLE')
ORDER BY table_type, table_name;

SELECT matviewname
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;

-- 8) Functions executable by anon/authenticated
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
       r.rolname AS owner,
       p.proconfig AS config_search_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
ORDER BY p.proname;

SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('anon','authenticated','public')
ORDER BY routine_name, grantee;
