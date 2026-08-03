# Jobs security preparation — review package

**Status:** repo prepared; **no SQL applied**, no production permission changes.  
Stop for explicit approval.

---

## 1. Current `/jobs` dependency map

| Surface | Path | Current data access | Notes |
|---|---|---|---|
| Jobs list / filters / cards | `src/app/jobs/page.tsx` | `employer_leads.select('*')` | Single page; **no** `/jobs/[id]` route |
| Client filters | same | in-memory on loaded rows | search name/city; state; subspecialty; sort by `received_at` |
| Practice link | card click | `router.push(/practices/${practice_id})` | only if `practice_id` set |
| Contact / inquiry | mailto / tel + PostHog | `email`, `phone`, `point_of_contact` | **removed** from physician UI |
| Practice detail jobs | `src/app/practices/[id]/page.tsx` | `employer_leads.select('*').eq('practice_id')` | showed contacts; **switched to RPC** |
| Home job count | `src/app/HomePageClient.tsx` | `employer_leads` count head | **switched to** `count_physician_jobs` |
| Admin lead inbox | `src/app/admin/page.tsx` | SELECT unlinked + UPDATE `practice_id` | remains direct table access (admin) |
| Server actions / API routes | — | **none** for jobs | |

Nav: `src/components/Nav.tsx` → `/jobs`.

---

## 2. Physician-facing field allowlist

| Field | Classification | Used for |
|---|---|---|
| `id` | **Required** | React keys |
| `practice_name` | **Required** | Card title / search |
| `practice_id` | **Required** | Practice navigation |
| `primary_location` | **Required** | Display, state filter |
| `practice_setting` | **Required** | Badge |
| `clinical_surgical_mix` | **Required** | Badge |
| `ideal_hiring_timeline` | **Required** | Badge |
| `subspecialties_interest` | **Required** | Badges + filter |
| `additional_details` | **Required** | Body copy on card (public job text, not admin notes) |
| `received_at` | **Required** | Sort + “days ago” |

---

## 3. Exact fields excluded

| Field | Reason |
|---|---|
| `email` | Employer contact — admin-only |
| `phone` | Employer contact — admin-only |
| `point_of_contact` | Internal contact name — admin-only |
| `source` | Lead source / ops — admin-only |
| `created_at` | Unused by physician UI; admin/workflow |

**Publication rule:** no `published` / `inactive` column exists. Physician RPCs return only rows with **`practice_id IS NOT NULL`** (admin-linked). Unlinked leads stay out of physician lists.

---

## 4–5. Sanitized RPC SQL + rollback

- Proposal: `docs/security/jobs-physician-rpc.proposal.sql`
- Rollback: `docs/security/jobs-physician-rpc.rollback.sql`

Functions (EXECUTE → `authenticated` only; `REVOKE FROM PUBLIC`):

- `list_physician_jobs(p_limit, p_offset)` — limit 1–500
- `list_physician_jobs_for_practice(p_practice_id)` — max 50
- `count_physician_jobs()`
- Auth via `is_atlas_analysis_authorized()` (onboarded + not deleted, or admin)

---

## 6. Application code changes (done in repo)

| File | Change |
|---|---|
| `src/lib/physician-jobs.ts` | **New** RPC client helpers + `PhysicianJob` type |
| `src/app/jobs/page.tsx` | Uses `fetchPhysicianJobs`; contact block removed |
| `src/app/practices/[id]/page.tsx` | Uses `fetchPhysicianJobsForPractice`; contact block removed |
| `src/app/HomePageClient.tsx` | Uses `countPhysicianJobs()` |
| Admin `employer_leads` paths | **Unchanged** (full row access via table + Stage B admin RLS) |

**Deploy coupling:** app will error on jobs until `jobs-physician-rpc.proposal.sql` is applied. Apply RPC → deploy app → then Stage B.

---

## 7–8. Revised Stage B SQL + rollback

- `docs/security/stage-b-auth-hotfix.proposal.sql` (revised)
- `docs/security/stage-b-auth-hotfix.rollback.sql` (revised)

`employer_leads` becomes **admin-only** at the table. Physicians rely on DEFINER RPCs.

---

## 9. Verification commands

After RPC apply (before Stage B), as onboarded physician JWT:

```bash
# Sanitized list — expect no email/phone/point_of_contact/source keys
curl -sS "$BASE/rpc/list_physician_jobs" \
  -H "apikey: $PUBLISHABLE" -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"p_limit":5,"p_offset":0}'

# Direct table — still works until Stage B; after Stage B expect 0 rows / denied
curl -sS "$BASE/employer_leads?select=id,email,phone&limit=1" \
  -H "apikey: $PUBLISHABLE" -H "Authorization: Bearer $USER_JWT"

# Incomplete / soft-deleted JWT — expect 42501 from RPC
# Admin JWT — list_physician_jobs OK; employer_leads SELECT OK after Stage B
# Admin UPDATE practice_id — still OK after Stage B
```

UI checks: `/jobs` filters/sort/pagination; practice detail job section; home job count; admin lead linker.

---

## 10. Risks / unresolved questions

1. **`additional_details` retained** for physicians as job body text. Confirm it never contains private ops notes; if it does, exclude and show a shorter public blurb column instead.
2. **No native published/inactive flag** — `practice_id IS NOT NULL` is the gate. Confirm product accepts this; otherwise add a column before Stage B.
3. **Listing count drop:** physician list will exclude unlinked leads (previously visible on `/jobs`).
4. **RPC must ship before app deploy** (or same window) or `/jobs` breaks.
5. **Contact removal** is a product UX change (no mailto/tel on physician surfaces).
6. Stage B still depends on `is_atlas_admin()` for admin table access (already in production).

---

**Stop for review.** Do not apply SQL or open public routes until approved.
