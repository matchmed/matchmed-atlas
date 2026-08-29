# Employer V1 — Migration RFC

**Status:** RFC only — not applied  
**Owner repo:** `matchmed-atlas` (`supabase/migrations/`)  
**Target:** Production project `yisjyqnxaimdaeiylbuy`  
**Prerequisites:** [employer-v1-production-introspection-findings.md](./employer-v1-production-introspection-findings.md)

---

## 1. Purpose

Add the minimum database objects for employer V1:

- Practice claiming (initial + access request)
- Verified employer organizations and org↔practice links
- Organization memberships (`auth.users` direct — no `employer_accounts`)
- Layer 3 current-state tables (contact, locations, roster assertions)
- RLS + admin-guarded DEFINER workflows

**Out of scope for this migration:** jobs, media tables beyond logo path column, entity reconciliation, score scope, billing, Atlas Layer 3 public RPC (Phase 12), employer app code.

---

## 2. Naming collision note

| Production object | Disposition |
|-------------------|-------------|
| `public.organizations` | Ingestion table (0 rows). **Do not use.** |
| `practices.organization_id` | FK to `organizations`, all NULL. **Do not write.** |
| New table | **`employer_organizations`** |

---

## 3. Tables

### 3.1 `employer_organizations`

```sql
CREATE TABLE public.employer_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  parent_organization_id uuid NULL REFERENCES public.employer_organizations(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'archived')),
  verified_at timestamptz NULL,
  verified_by uuid NULL REFERENCES auth.users(id),
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_organizations_slug_unique UNIQUE (slug)
);
```

**Indexes:** `(parent_organization_id)`, `(status)` WHERE `status <> 'archived'`

**Delete:** archive only (`status = 'archived'`, `archived_at` set).

---

### 3.2 `organization_memberships`

```sql
CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.employer_organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor')),
  scope text NOT NULL DEFAULT 'organization_only'
    CHECK (scope IN ('organization_only', 'organization_and_descendants')),
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by uuid NULL REFERENCES auth.users(id),
  invited_at timestamptz NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Partial unique:** one active membership per user per org  
`UNIQUE (organization_id, user_id) WHERE status = 'active'`

**Indexes:** `(user_id)` WHERE `status = 'active'`; `(organization_id)` WHERE `status = 'active'`

---

### 3.3 `employer_organization_practices`

```sql
CREATE TABLE public.employer_organization_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.employer_organizations(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  relationship text NOT NULL DEFAULT 'operates'
    CHECK (relationship = 'operates'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  inactive_at timestamptz NULL,
  inactive_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Partial unique (V1):** one active operates link per practice  
`UNIQUE (practice_id) WHERE status = 'active' AND relationship = 'operates'`

**Indexes:** `(organization_id)` WHERE `status = 'active'`; `(practice_id)`

MatchMed admin / DEFINER only for INSERT and status changes.

---

### 3.4 `practice_claims`

```sql
CREATE TABLE public.practice_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  claim_type text NOT NULL CHECK (claim_type IN ('initial_claim', 'access_request')),
  status text NOT NULL DEFAULT 'pending_email_verification'
    CHECK (status IN (
      'pending_email_verification',
      'pending_review',
      'approved',
      'rejected',
      'revoked'
    )),
  claimant_name text NOT NULL,
  claimant_title text NOT NULL,
  claimant_work_email text NOT NULL,
  claimant_work_email_verified_at timestamptz NULL,
  claimant_work_email_verification_method text NULL
    CHECK (claimant_work_email_verification_method IS NULL
      OR claimant_work_email_verification_method IN ('email_otp', 'manual_admin')),
  claimant_phone text NULL,
  authority_attestation boolean NOT NULL,
  attestation_text_version text NOT NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NULL,
  review_notes text NULL,
  rejection_reason text NULL,
  approved_organization_id uuid NULL REFERENCES public.employer_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Partial uniques:**
- `UNIQUE (practice_id, submitted_by) WHERE status IN ('pending_email_verification', 'pending_review')`
- `UNIQUE (practice_id) WHERE claim_type = 'initial_claim' AND status IN ('pending_email_verification', 'pending_review')` — one pending initial claim per practice

**Indexes:** `(status, created_at DESC)` WHERE `status = 'pending_review'`; `(practice_id)`; `(submitted_by)`

**Revocation semantics:** `status = 'revoked'` on claim is audit-only; does not cascade to memberships or org↔practice link.

---

### 3.5 `employer_practice_profiles`

Layer 3 contact + overview + logo. **PK = `practice_id` only** (no denormalized `organization_id`).

```sql
CREATE TABLE public.employer_practice_profiles (
  practice_id uuid PRIMARY KEY REFERENCES public.practices(id),
  website text NULL,
  primary_phone text NULL,
  recruiting_email text NULL,
  recruiting_phone text NULL,
  careers_url text NULL,
  overview text NULL,
  logo_storage_path text NULL,
  roster_last_reviewed_at timestamptz NULL,
  roster_last_reviewed_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id),
  CONSTRAINT employer_practice_profiles_overview_len
    CHECK (overview IS NULL OR char_length(overview) <= 500)
);
```

---

### 3.6 `employer_practice_locations`

```sql
CREATE TABLE public.employer_practice_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  source_location_id uuid NULL REFERENCES public.practice_locations(id),
  status text NOT NULL CHECK (status IN ('active', 'closed', 'billing_only')),
  address text NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text NULL,
  phone text NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id),
  CONSTRAINT employer_practice_locations_new_row_address
    CHECK (source_location_id IS NOT NULL OR address IS NOT NULL)
);
```

**Partial unique:** `UNIQUE (practice_id, source_location_id) WHERE source_location_id IS NOT NULL`

---

### 3.7 `employer_roster_assertions`

```sql
CREATE TABLE public.employer_roster_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  affiliation_id uuid NULL REFERENCES public.affiliations(id),
  assertion text NOT NULL CHECK (assertion IN (
    'confirm_current',
    'report_departed',
    'billing_only',
    'incorrect_association',
    'affiliated_elsewhere_in_org',
    'report_still_affiliated',
    'confirm_former',
    'other'
  )),
  effective_year smallint NULL,
  effective_month smallint NULL
    CHECK (effective_month IS NULL OR effective_month BETWEEN 1 AND 12),
  comment text NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  supersedes_id uuid NULL REFERENCES public.employer_roster_assertions(id),
  asserted_by uuid NOT NULL REFERENCES auth.users(id),
  asserted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_roster_assertions_comment_len
    CHECK (comment IS NULL OR char_length(comment) <= 280)
);
```

**Partial unique:** `UNIQUE (practice_id, doctor_id) WHERE status = 'active'`

**Supersede convention:** new row `status = 'active'`, `supersedes_id` → prior row `id`; prior row `status = 'superseded'`.

---

## 4. Authorization helper functions

All `SECURITY DEFINER`, `SET search_path = ''`, `STABLE`.

### 4.1 `organization_descendant_ids(root_org_id uuid) returns setof uuid`

Recursive CTE on `employer_organizations` where `status <> 'archived'`.

### 4.2 `can_access_organization(p_user_id uuid, p_org_id uuid) returns boolean`

TRUE when active membership exists and:
- `membership.organization_id = p_org_id`, OR
- `membership.scope = 'organization_and_descendants'` AND `p_org_id` is descendant of membership org

Any role (`owner`, `admin`, `editor`). MatchMed admin → TRUE.

### 4.3 `can_admin_organization(p_user_id uuid, p_org_id uuid) returns boolean`

TRUE when active membership with `role IN ('owner', 'admin')` and scope covers org (same rules as above). MatchMed admin → TRUE.

### 4.4 `can_edit_practice(p_user_id uuid, p_practice_id uuid) returns boolean`

```text
EXISTS employer_organization_practices l
  WHERE l.practice_id = p_practice_id
    AND l.status = 'active'
    AND l.relationship = 'operates'
    AND can_access_organization(p_user_id, l.organization_id)
    AND active membership role IN ('owner', 'admin', 'editor')
```

MatchMed admin → TRUE.

**No `can_manage_organization` / `can_manage_practice` generic helpers.**

### 4.5 `employer_overlay_publicly_visible(p_practice_id uuid) returns boolean`

TRUE when:
- active `operates` link exists
- org `status = 'verified'` and not archived
- EXISTS ≥1 active membership with role IN (`owner`, `admin`, `editor`) on that org

Used by future public overlay RPC (not created in this migration).

---

## 5. MatchMed admin DEFINER functions

**Every function begins with:**

```sql
IF NOT public.is_atlas_admin() THEN
  RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
END IF;
```

| Function | Purpose |
|----------|---------|
| `approve_practice_initial_claim(p_claim_id uuid)` | Verify org, create link, bootstrap owner membership, init profile row; set claim approved |
| `approve_practice_access_request(p_claim_id uuid, p_role text)` | Add membership on existing org; no new org/link |
| `reject_practice_claim(p_claim_id uuid, p_reason text)` | Set rejected + reason |
| `revoke_practice_claim(p_claim_id uuid, p_notes text)` | Claim audit `revoked` only |
| `revoke_organization_membership(p_membership_id uuid, p_notes text)` | Single membership → `revoked` |
| `deactivate_organization_practice_link(p_link_id uuid, p_reason text)` | Link → `inactive`; does not revoke memberships |
| `verify_claimant_work_email_manual(p_claim_id uuid)` | Sets verified_at + method `manual_admin`; moves to `pending_review` if needed |

Employer-invoked mutations (profile/location/assertion insert-update) remain **INVOKER** under RLS.

---

## 6. RLS policies (summary)

RLS **ENABLED** on all seven tables. **No** grants to `anon`.

### `employer_organizations`
| Op | Policy |
|----|--------|
| SELECT | `can_access_organization(auth.uid(), id)` OR admin |
| INSERT/UPDATE/DELETE | admin only (or via DEFINER) |

### `organization_memberships`
| Op | Policy |
|----|--------|
| SELECT | self OR `can_access_organization` on same org OR admin |
| INSERT | `can_admin_organization` on org OR admin bootstrap via DEFINER |
| UPDATE | `can_admin_organization` (cannot change own role to owner unless caller is owner/admin); self may accept invite (`invited`→`active`) |

### `employer_organization_practices`
| Op | Policy |
|----|--------|
| SELECT | `can_access_organization` on `organization_id` OR admin |
| INSERT/UPDATE | admin / DEFINER only |

### `practice_claims`
| Op | Policy |
|----|--------|
| SELECT | `submitted_by = auth.uid()` OR admin OR `can_access_organization` on approved org |
| INSERT | `submitted_by = auth.uid()` |
| UPDATE | admin DEFINER paths only (no client approve) |

### Layer 3 tables (`employer_practice_profiles`, `employer_practice_locations`, `employer_roster_assertions`)
| Op | Policy |
|----|--------|
| SELECT | `can_edit_practice(auth.uid(), practice_id)` OR admin |
| INSERT/UPDATE | `can_edit_practice` OR admin |
| DELETE | none (soft status / supersede) |

**Canonical Atlas tables:** no new grants. Employers retain zero write access to `practices`, `doctors`, `affiliations`, `practice_locations`.

---

## 7. Grants

```sql
-- authenticated: SELECT/INSERT/UPDATE on employer tables per RLS (no DELETE except memberships via update)
-- EXECUTE on helper functions used in policies: authenticated
-- EXECUTE on admin DEFINER functions: authenticated (function body checks is_atlas_admin)
```

Do **not** grant `anon` on employer tables.

---

## 8. Storage (separate step)

Production has **no buckets**. Before logo upload (app Phase 13):

- Bucket: `employer-practice-logos` (private)
- Path convention: `{practice_id}/{uuid}.{ext}`
- RLS: upload/read when `can_edit_practice`

Can be dashboard-created or follow-up migration; **not blocking** claim/schema migration.

---

## 9. Suggested migration file

```
supabase/migrations/20260829000000_employer_v1_schema.sql
```

**Apply order inside file:**
1. Tables
2. Indexes + partial uniques
3. Helper functions
4. Admin DEFINER functions
5. Enable RLS + policies
6. Grants

**Rollback file:** `docs/security/employer-v1-migration.rollback.sql` (DROP policies, functions, tables reverse order).

---

## 10. Post-apply verification

```sql
-- Tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'employer_%'
   OR table_name IN ('organization_memberships', 'practice_claims');

-- RLS enabled
SELECT relname, relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND relname LIKE 'employer_%';

-- Non-admin cannot approve (as authenticated non-admin JWT)
-- SELECT approve_practice_initial_claim('...');  -- expect 42501

-- can_edit_practice false for random practice without membership
SELECT public.can_edit_practice(auth.uid(), '<practice_uuid>');
```

Regenerate TypeScript types after apply.

---

## 11. Explicitly NOT in this migration

- `employer_accounts`
- `employer_job_postings`
- `entity_mapping_proposals`
- `public_get_employer_practice_overlay` RPC
- Changes to `link_auth_user_to_profile` (documented separately)
- Changes to `profiles` or physician RLS
- Score scope columns
- Storage bucket DDL (optional follow-up)

---

## 12. Apply procedure

1. Review + approve this RFC
2. Implement SQL in `matchmed-atlas` branch
3. Apply to staging via `npx supabase db query --linked -f ...` (team convention)
4. Run verification queries
5. Merge; apply production with explicit approval
6. Sync types to `matchmed-employers` repo

`matchmed-employers` must **not** ship its own migrations against shared DB.

---

## 13. Revocation reference (implementation must match)

| Action | Affects |
|--------|---------|
| `revoke_practice_claim` | claim row only |
| `revoke_organization_membership` | one membership |
| `deactivate_organization_practice_link` | link + public overlay visibility |
| Membership revoke of original claimant | **not** other admins; **not** link |

Public overlay hidden when link inactive OR org archived OR no active manager membership.

---

## 14. Access request vs initial claim (implementation must match)

| | `initial_claim` | `access_request` |
|--|-----------------|------------------|
| When | No active operates link | Active link exists |
| Approval creates | org + link + owner membership | membership only on existing org |
| Reject subsequent initial | if link already active | N/A |

---

**RFC approval:** _pending_
