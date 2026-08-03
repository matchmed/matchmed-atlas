# Jobs transition — review package (stop for approval)

**Scope:** physician jobs RPCs + app deploy only.  
**Not in scope:** Stage B/C, anon revoke, public routes.

## Confirmed requirements (RPC)

| Requirement | Implementation |
|---|---|
| `is_published IS TRUE` | `list_physician_jobs`, `list_physician_jobs_for_practice`, `count_physician_jobs` |
| `practice_id IS NOT NULL` | `list_physician_jobs` + `count_physician_jobs` (practice-scoped RPC matches `practice_id = $1` and published) |
| Onboarded, non-deleted, or admin | `is_atlas_analysis_authorized()` before any return |
| No contact/source fields | Fixed SELECT list only |

## Confirmed app: no direct `employer_leads` on physician surfaces

| Surface | Access |
|---|---|
| `/jobs` | `fetchPhysicianJobs` → `list_physician_jobs` |
| Homepage job count | `countPhysicianJobs` → `count_physician_jobs` |
| Practice detail jobs | `fetchPhysicianJobsForPractice` → `list_physician_jobs_for_practice` |
| Admin lead linker | still direct `employer_leads` (intentional) |

## Zero published jobs UX

| Surface | Behavior |
|---|---|
| `/jobs` | Empty state: “No job listings are available yet.” (vs filter miss copy) |
| Homepage | “Active Job Listings” → **0** |
| Practice detail | Jobs section omitted when `jobs.length === 0` |

## Apply / deploy

### Migration to apply

`supabase/migrations/20260803020000_physician_jobs_rpcs.sql`

```bash
supabase db push --dry-run
supabase db push
```

### App files to deploy

- `src/lib/physician-jobs.ts`
- `src/app/jobs/page.tsx`
- `src/app/HomePageClient.tsx`
- `src/app/practices/[id]/page.tsx`

### Smoke tests (after push + deploy)

1. Onboarded user: `/jobs` loads empty, no errors; footer “0 total listings”.
2. Homepage shows **0** active jobs.
3. Practice with former leads: no job block; page otherwise OK.
4. RPC as onboarded: `list_physician_jobs` → `[]`; `count_physician_jobs` → `0`.
5. Incomplete-onboarding / soft-deleted JWT: RPC → `42501`.
6. Direct `GET employer_leads?select=email` as physician: still works until Stage B (expected); RPC must not return email keys.
7. Admin lead linker still lists/updates unlinked leads.

### Rollback

1. Revert app deploy to pre-RPC callers **or** keep app and restore table reads (not recommended).  
2. SQL: `docs/security/physician-jobs-rpcs.rollback.sql`  
3. `supabase migration repair` only if you also need remote history rollback (prefer forward fix).

**Stop for review — do not apply Stage B/C or public routes.**
