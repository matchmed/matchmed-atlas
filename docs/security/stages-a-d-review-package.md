# Public search security — Stages A–D review package

**Status:** proposal only. Nothing applied. Stop for explicit approval.  
**Updated:** 2026-08-03 with production catalog + authenticated Data API probe.

---

## 1. Updated Phase 0 access matrix

| Resource | Anon Data API | Auth onboarded (probe) | RLS | Notes |
|---|---|---|---|---|
| `practices` | 200 / 0 rows; SELECT grant; score cols resolvable | **206 / 6,701** incl. scores/tenure | `auth_read` `USING (true)` | **Vulnerable** analysis |
| `doctors` | 200 / 0; grad cols resolvable | **206 / 22,381** incl. graduation | `auth_read` `USING (true)` | **Vulnerable** |
| `affiliations` | 200 / 0; tenure/history resolvable | **206 / 32,334** | `auth_read` `USING (true)` | Status: `On roster` (22,185), `Not on roster` (10,149) |
| `practice_locations` | 200 / 0; SELECT grant | **206 / 11,999** | duplicate SELECT `USING (true)`; INSERT/UPDATE `true` | Read needed by app; **writes vulnerable** |
| `profiles` | 200 / 0 | **200 / 1 own row** | own + admin (`is_atlas_admin`) | **Intended** (post profiles hardening) |
| `shortlists` | 200 / 0 | **206 / 40 global** | SELECT/INSERT/DELETE `USING/CHECK (true)` | **Vulnerable** cross-user |
| `employer_leads` | 200 / 0; SELECT+contact cols | **206 / 43** incl. email/phone | SELECT+UPDATE `true` | **Vulnerable** |
| `practice_error_reports` | **401** no SELECT grant | 200 / 0 non-admin | admin select/update; own insert | **Intended** |
| Expired JWT | — | **401 PGRST303** | — | Expected |

Extensions: `pgcrypto`, `uuid-ossp` only — **`pg_trgm` absent**.  
Routines granted to authenticated: `is_atlas_admin`, `admin_set_profile_npi_verified`, `admin_soft_delete_profile`.  
Key type: `sb_publishable_…`; anon works with **apikey-only**.

Other tables present (not in app critical path for this package): `favorites`, `organizations`, `specialties`, NPPES snapshots, etc. — inventory for later; not Stage B targets.

---

## 2. Classification of access paths

| Path | Classification |
|---|---|
| Profiles own-row SELECT/INSERT/UPDATE | **Intended** |
| Profiles admin SELECT via `is_atlas_admin()` | **Intended** |
| Practice error report own INSERT / admin SELECT·UPDATE | **Intended** |
| Proxy onboarding redirect + soft-delete sign-out | **Temporary UI gate** (not DB authz) |
| Authenticated SELECT all practices/doctors/affiliations scores | **Vulnerable** (`USING (true)`) |
| Authenticated SELECT all shortlists | **Vulnerable** |
| Authenticated SELECT/UPDATE all employer_leads (contacts) | **Vulnerable** |
| Authenticated INSERT/UPDATE practice_locations | **Vulnerable** (no app writer; still open) |
| Duplicate practice_locations SELECT policies | **Temporary / redundant** |
| Anon SELECT grants + 0-row RLS | **Vulnerable posture** (schema leak / future policy risk) |
| Jobs page reading all leads for every user | **Vulnerable product surface** |
| Admin lead-linking UPDATE | **Intended intent**, currently **under-protected** (any auth user can UPDATE via API) |

---

## 3–6. SQL artifacts (proposal + rollback)

| Stage | Proposal | Rollback |
|---|---|---|
| A public RPCs | `docs/security/stage-a-public-rpcs.proposal.sql` | `stage-a-public-rpcs.rollback.sql` |
| A anon revoke (Part B) | `docs/security/stage-a-anon-revoke.proposal.sql` | `stage-a-anon-revoke.rollback.sql` |
| B auth hotfix | `docs/security/stage-b-auth-hotfix.proposal.sql` | `stage-b-auth-hotfix.rollback.sql` |
| C analysis authz | `docs/security/stage-c-analysis-authz.proposal.sql` | `stage-c-analysis-authz.rollback.sql` |

Roster predicate uses exact status **`On roster`**.

---

## 7. Required application changes

### Before / with Stage B (employer_leads admin-only)

1. **`src/app/jobs/page.tsx`** — will return empty / error for non-admins after Stage B.  
   **Choose one before apply:**
   - **B1 (hotfix):** treat Jobs as admin-only (layout/`is_admin` gate; hide nav for non-admins), **or**
   - **B2 (product):** add sanitized RPC/view without `email`/`phone`/`point_of_contact` for analysis-authorized users; keep full rows admin-only.
2. **`src/app/HomePageClient.tsx`** — jobs `count` head query will fail/zero for non-admins; guard or remove.
3. **Admin lead linker** (`admin/page.tsx`) — continues to work if caller is `is_admin` (uses `is_atlas_admin()` in RLS). Verify admin accounts have `profiles.is_admin = true`.

### Stage B shortlists / locations

- **No app code change** required for shortlists if inserts continue to use `physician_id = profiles.id` (already true).
- **No app code change** for practice_locations reads; writes were unused.

### Stage C analysis authz

- **No server-loader refactor required** for current authenticated UI.
- Onboarded users keep working.
- Incomplete-onboarding users already redirected by `src/proxy.ts`; Data API additionally returns empty.
- Ensure onboarding completion still sets `onboarding_complete = true` before users hit `/practices`.

### Stage D (later)

- Public homepage, proxy allowlist, gated profile loaders, PostHog — **out of scope until A–C pass**.

---

## 8. Anonymous verification tests

After Stage A RPCs (before anon revoke):

| Test | Expect |
|---|---|
| `POST /rest/v1/rpc/public_search` `{"q":"smith"}` with apikey only | 200; ≤5+≤5; no score keys |
| `q` length 2 / control chars | 4xx |
| `rpc/public_get_practice` | public fields only; no `retention_score` / `org_pac_id` |
| `rpc/public_get_practice_roster` | id + name only; status filter `On roster` |
| Direct `GET /practices?select=retention_score` | still 200/[] until Part B revoke |
| After Part B revoke | 401 `42501` on base-table SELECT |

---

## 9. Onboarded authenticated regression tests

| Surface | Expect after Stage C |
|---|---|
| `/practices` list + map + search | loads; scores visible |
| `/practices/[id]` | scores, tenure, former, jobs block behavior per Stage B |
| `/physicians` + detail | loads; graduation/history visible |
| Favorites add/remove/list | own shortlists only |
| Account / onboarding complete user | unchanged |
| Home counts (practices/doctors) | succeed |

---

## 10. Incomplete-onboarding denial tests

| Test | Expect |
|---|---|
| Browser to `/practices` | proxy → `/onboarding` |
| Data API `practices?select=id&limit=1` with incomplete JWT | **200 / 0 rows** after Stage C |
| Same for doctors/affiliations/locations | 0 rows |
| Shortlist insert | fail if profile incomplete/deleted (own policy + deleted_at) |

---

## 11. Cross-user shortlist denial tests

| Test | Expect after Stage B |
|---|---|
| User A `GET shortlists` | only rows where `physician_id` = A’s `profiles.id` |
| User A `DELETE` User B’s shortlist id | 0 rows / not allowed |
| User A `INSERT` with B’s `physician_id` | WITH CHECK fail |
| Favorites UI for A | unchanged |

---

## 12. Employer-lead denial tests

| Test | Expect after Stage B |
|---|---|
| Non-admin `GET employer_leads` | 0 rows |
| Non-admin `UPDATE` practice_id | fail |
| Admin `GET` / link practice | succeed |
| `/jobs` non-admin | empty or gated (per chosen app change) |

---

## 13. Practice-location write denial tests

| Test | Expect after Stage B |
|---|---|
| Non-admin `POST practice_locations` | fail |
| Non-admin `PATCH` | fail |
| Non-admin `GET` | still succeeds until Stage C; after Stage C only if analysis-authorized |
| Admin insert/update | succeed |

---

## 14. Admin access tests

| Test | Expect |
|---|---|
| `is_atlas_admin()` true account | Stage B leads + location writes; Stage C full analysis |
| Admin profiles list / soft-delete RPCs | unchanged (existing hardening) |
| Admin practice error reports | unchanged |
| Non-admin calling admin RPCs | denied by RPC/policy as today |

---

## 15. Exact deployment and rollback order

1. **App prep for Stage B jobs** (choose B1 or B2; deploy).  
2. **Stage A** apply `stage-a-public-rpcs.proposal.sql` → anon RPC verify (§8).  
3. **Stage B** apply `stage-b-auth-hotfix.proposal.sql` → tests §11–13.  
4. **Stage C** apply `stage-c-analysis-authz.proposal.sql` → tests §9–10, §14.  
5. **Stage A Part B** apply `stage-a-anon-revoke.proposal.sql` → anon base-table 401.  
6. **Stage D** (future) public routes only after all above green.

**Rollback (reverse order):**  
5→`stage-a-anon-revoke.rollback.sql`  
4→`stage-c-analysis-authz.rollback.sql`  
3→`stage-b-auth-hotfix.rollback.sql`  
2→`stage-a-public-rpcs.rollback.sql`  
1→revert jobs app change if needed.

Do **not** open public routes in the same change window as Stage A alone.

---

## 16. Remaining blockers

1. **Product choice for `/jobs`:** admin-only vs sanitized physician RPC (blocks safe Stage B).  
2. **Confirm `is_atlas_admin()` semantics** match admin users used in probe/ops (already in prod).  
3. **Catalog grant paste was truncated** mid–`practice_locations`; confirm authenticated INSERT/UPDATE grants exist before relying on admin write policies alone (policies without grants still fail).  
4. **`favorites` table** exists unused — decide ignore vs drop later.  
5. **Affiliation `alt_name`** exists on affiliations (catalog columns), **not** on practices — public search still has no practice alternate name.  
6. **Stage D** UI/proxy/PostHog still blocked until A–C verified.  
7. Explicit human approval required before any apply.

---

## Stage D gate (reminder)

Public routes may launch only when:

- [ ] Public RPCs pass anonymous verification  
- [ ] Anonymous base-table privileges revoked  
- [ ] Shortlists + employer_leads secured  
- [ ] Unauthorized authenticated users cannot retrieve full Atlas analysis  
- [ ] Onboarded workflows pass regression  

**Stop for explicit approval.**
