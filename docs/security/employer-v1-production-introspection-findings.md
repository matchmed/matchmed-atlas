# Employer V1 — production schema introspection findings

**Project:** `yisjyqnxaimdaeiylbuy` (linked production)  
**Executed:** 2026-08-28  
**Method:** `npx supabase db query --linked` (read-only SELECT)

---

## Summary

| Check | Result |
|-------|--------|
| Conflicting `employer_*` tables (besides `employer_leads`) | **None** |
| Production `organizations` table | **Exists, empty (0 rows), ingestion-shaped** |
| `practices.organization_id` → `organizations` | **FK exists; all 6,700 practices NULL** |
| `org_pac_id` uniqueness | **1:1 with practice rows (6,700 distinct, 0 duplicates, 0 null)** |
| `is_atlas_admin()` | **Live; checks `profiles.is_admin`** |
| Storage buckets | **None configured** |
| Auth without profiles | **10 auth users without `profiles` row** |

**Recommendation:** Proceed with new `employer_organizations` table. Do **not** reuse production `organizations` (different purpose; naming collision with `practices.organization_id`).

---

## 1. `organizations` table

**Columns:**

| Column | Type | Nullable |
|--------|------|----------|
| id | uuid | NO (default `uuid_generate_v4()`) |
| name | text | NO |
| org_type | text | YES |
| ownership_source | text | YES |
| confidence | text | YES |
| notes | text | YES |
| created_at | timestamptz | YES |
| updated_at | timestamptz | YES |

**Row count:** 0  
**Indexes:** PK only (`organizations_pkey`)  
**RLS:** enabled; **no policies** in `pg_policies`  
**Grants:** anon/authenticated have REFERENCES/TRIGGER/TRUNCATE only — **no SELECT**

**Interpretation:** Ingestion / entity-resolution placeholder (type, ownership source, confidence). Not used by Atlas app. Not suitable for employer admin hierarchy without semantic collision.

---

## 2. `practices.organization_id`

- FK: `practices_organization_id_fkey` → `organizations(id)`
- `practices_with_organization_id`: **0**
- `practices_without_organization_id`: **6,700**

Ingestion column reserved for future CMS grouping; inactive today.

---

## 3. `employer_*` tables

Only `employer_leads` exists.

**`employer_leads` columns (production):**  
`id`, `airtable_id`, `practice_id`, `practice_name`, `point_of_contact`, `email`, `phone`, `primary_location`, `source`, `message_id`, `practice_setting`, `clinical_surgical_mix`, `ideal_hiring_timeline`, `subspecialties_interest` (array), `additional_details`, `received_at`, `created_at`, `updated_at`, `is_published` (NOT NULL).

---

## 4. `practices` scale and identity

| Metric | Value |
|--------|-------|
| Practice rows | 6,700 |
| Distinct `org_pac_id` | 6,700 |
| Duplicate `org_pac_id` | 0 |
| Null `org_pac_id` | 0 |

**Incoming FKs to `practices`:** `affiliations`, `employer_leads`, `practice_error_reports`, `practice_locations`, `shortlists`

**Outgoing FKs from `practices`:** `organization_id` → `organizations`, `specialty_id` → `specialties`

---

## 5. Auth helpers (production definitions)

**`is_atlas_admin()`** — `SECURITY DEFINER`, `search_path = ''`  
Returns true when `profiles.is_admin IS TRUE` for `auth.uid()`.

**`is_atlas_analysis_authorized()`** — same pattern  
Returns true when profile not deleted and (`onboarding_complete` OR `is_admin`).

---

## 6. RLS policies (core tables)

| Table | Policies |
|-------|----------|
| practices | `practices_select_authorized` (SELECT, authenticated) |
| doctors | `doctors_select_authorized` |
| affiliations | `affiliations_select_authorized` |
| practice_locations | select authenticated; insert/update admin |
| profiles | select own, select admin, insert own, update own |
| shortlists | select/insert/delete own |
| employer_leads | select/insert/update admin |
| practice_error_reports | insert own; select/update admin |
| organizations | **none** |

**Grants:** `authenticated` has SELECT on `practices` (RLS-gated). `anon` has no SELECT on `practices` (post anon-revoke).

---

## 7. Auth / profiles cardinality

| Metric | Value |
|--------|-------|
| auth.users | 46 |
| profiles | 50 |
| auth users without profile | 10 |

Employer-only users without `profiles` rows are already possible in production.

---

## 8. Public / admin RPCs present

- `public_search`, `public_get_practice`, `public_get_practice_locations`, `public_get_practice_roster`, `public_get_physician`, `public_platform_counts`
- `list_physician_jobs`, `list_physician_jobs_for_practice`
- `is_atlas_admin`, `is_atlas_analysis_authorized`
- `admin_set_profile_npi_verified`, `admin_soft_delete_profile`

No employer V1 functions exist yet.

---

## 9. Storage

`storage.buckets`: **empty** — logo bucket must be created in migration or dashboard before Phase 13.

---

## Blockers cleared / remaining

| Item | Status |
|------|--------|
| `organizations` DDL | **Cleared** — empty ingestion table; use `employer_organizations` |
| Conflicting `employer_*` schema | **Cleared** |
| `is_atlas_admin` behavior | **Confirmed** |
| Storage for logos | **Action required** before logo upload |
| Regenerate TypeScript types | **Required after first employer migration** |
| `auth.users` trigger | **Documented** — see §10 below |

---

## 10. Auth.users trigger (employer collision check)

**Trigger (production):** `on_auth_user_created` AFTER INSERT ON `auth.users`  
**Function:** `public.link_auth_user_to_profile()` (`SECURITY DEFINER`)

```sql
UPDATE public.profiles
SET user_id = NEW.id
WHERE email = NEW.email AND user_id IS NULL;
```

**Does NOT INSERT profiles.** Links pre-imported orphan `profiles` rows by email match only.

**Orphan profiles (production):** 14 rows with `user_id IS NULL`, **all** `onboarding_complete = true` (physician import placeholders with NPI).

**Risk:** New signup (Atlas or employer app) with an email matching an orphan profile immediately gains `is_atlas_analysis_authorized()` without physician onboarding. Unlikely for practice work emails; possible for personal Gmail collisions.

**Auth users without `profiles` row:** 10 (employer-only auth is already possible today).

**No triggers on `public.profiles` table.**

