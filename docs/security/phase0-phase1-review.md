# Phase 0 / Phase 1 status (updated)

**Stop for review. Nothing applied.**

## 1. Key classification and apikey-only retest

| Check | Result |
|---|---|
| Key format | **New `sb_publishable_…` key** (len 46). Not a legacy JWT (`eyJ…`) anon key. |
| OpenAPI with publishable | 401 “Secret API key required” |
| Anon probe with `apikey` **only** | Same as apikey+Bearer: **200 + 0 rows** for practices/doctors/affiliations/practice_locations/profiles/shortlists/employer_leads (including score/tenure/graduation column selects). **401 `42501`** for `practice_error_reports`. |
| Control with apikey + `Authorization: Bearer <publishable>` | Also 200 + 0 rows |

**Conclusion:** For this project, anonymous Data API access works with **`apikey` alone**. Prior dual-header probes remain valid; apikey-only is the cleaner anon test.

## 2. Production SQL Editor catalog

**Not incorporated — output was not provided in the workspace or this chat.**

Please paste results of `docs/security/phase0-production-audit-queries.sql` (and the affiliation status distinct query) here. Until then, Phase 0 cannot document owners, RLS policies, grants matrix, indexes, or `pg_trgm` from production.

## 3. Authenticated Data API probe

Script: `scripts/probe-authenticated-data-api.sh`

```bash
chmod +x scripts/probe-authenticated-data-api.sh
export TEST_USER_JWT='…'   # short-lived; do not commit
./scripts/probe-authenticated-data-api.sh
unset TEST_USER_JWT
```

Reports only status codes, row counts, content-range, and column names. Includes an affiliation `status` frequency sample (values only). **`TEST_USER_JWT` was not set in this environment**, so authenticated probes were not executed here.

## 4–5. Revised Phase 1 SQL + rollback

| File | Role |
|---|---|
| `docs/security/phase1-public-contracts.proposal.sql` | Part A RPCs/grants/indexes; Part B anon REVOKE commented deferred |
| `docs/security/phase1-public-contracts.rollback.sql` | Drop Phase 1 functions/indexes; optional anon GRANT restore if Part B ran |

### Revisions vs prior proposal

- Removed `org_pac_id` from public practice responses.
- Roster predicate isolated in `public._public_is_current_roster_status` — **provisional** (`lower(btrim(status)) = 'on roster'` per app code) until DISTINCT status precheck is pasted; then replace with exact literals.
- All `SECURITY DEFINER` / helper functions use `SET search_path = ''` with `public.` / `extensions.` qualification.
- `REVOKE ALL … FROM PUBLIC` on every function; explicit `GRANT EXECUTE` only on the seven client RPCs to `anon` and `authenticated`.
- Helpers (`_public_*`, `is_atlas_analysis_authorized`) get **no** client EXECUTE grants.
- Analysis helper created but **not** wired into policies (deferred).
- Anon base-table `REVOKE SELECT` moved to **Part B** (commented); authenticated table access untouched.
- No alternate-name search (column absent in production probes).

### Client RPC surface (Part A)

1. `public.public_search(text)`
2. `public.public_get_practice(uuid)`
3. `public.public_get_practice_locations(uuid)`
4. `public.public_get_practice_roster(uuid)`
5. `public.public_get_physician(uuid)`
6. `public.public_platform_counts()`

### Blocked before apply

1. SQL catalog paste (policies/grants/indexes).
2. Exact `affiliations.status` distinct values → finalize `_public_is_current_roster_status`.
3. Authenticated probe via `TEST_USER_JWT`.
4. Human review of Part A; Part B only after RPC verification.
