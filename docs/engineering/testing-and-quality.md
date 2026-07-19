# Testing and quality

Atlas currently has build and lint tooling but no automated test suite or CI workflow. This document separates the verified baseline from a recommended risk-based validation approach; recommendations are not yet release policy.

## Verified baseline

`package.json` defines:

```bash
npm run build
npm run lint
```

`npm run build` invokes `next build`, including compilation and TypeScript checking. `npm run lint` invokes ESLint configured with Next core-web-vitals and TypeScript rules.

On 2026-07-19:

- the production build succeeded;
- lint reported 49 findings: 36 errors and 13 warnings;
- there was no `test` script, test configuration, test file set, coverage threshold, or `.github/workflows` CI configuration.

Existing lint findings include React hook correctness, unsafe `any`, unescaped JSX text, unused values, and effect dependency issues. This is a measured baseline, not an acceptable-quality declaration. A successful build does not validate authorization, runtime data behavior, accessibility, or external integrations.

## Minimum evidence for changes

Until owners establish enforced gates, every change should include:

1. `npm run build` result.
2. `npm run lint` result, distinguishing new findings from the repository baseline.
3. Focused manual scenarios for the changed behavior.
4. Browser and viewport used.
5. Accounts/roles exercised without identifying real users.
6. Known gaps and follow-up work.

Do not suppress a new finding merely to preserve baseline counts. When practical, lint changed files directly during development, then run repository-wide lint before review.

## Risk-based manual matrix

### Authentication and session lifecycle

Exercise email/password and Google flows when affected:

- unauthenticated direct navigation to protected routes;
- login success, invalid credentials, logout, and refresh;
- signup validation, email confirmation, callback failure, recovery, and set-password paths;
- expired or malformed links;
- onboarding redirects and an absent/incomplete profile;
- a profile with `deleted_at` set;
- cookie refresh across server and client navigation.

Pay special attention to `src/proxy.ts`, `src/app/auth/`, and `src/app/(auth)/`. Browser-client auth currently specifies implicit flow while callback code supports server behavior; changes require end-to-end verification against actual Supabase settings.

### Authorization and RLS

For every data mutation or sensitive read, test:

- no session;
- ordinary authenticated user;
- a second user attempting cross-user access;
- admin;
- malformed or missing identifiers;
- direct API/database request, not only the intended UI.

Admin-page layout checks do not protect database objects or unrelated API routes. Verify RLS/grants in Supabase. The repository only contains policy evidence for `practice_error_reports`.

For correction reports, test ownership of `reported_by`, allowed field values, 1–1000 character descriptions, status constraints, report snapshots, admin-only read/update, and ordinary-user denial.

### Report builder and external services

For `POST /api/generate-report`, test missing/blank prompt, missing server credential, upstream non-2xx response, malformed upstream response, network failure, and output rendering/escaping. Also test direct non-admin calls: the current handler lacks its own admin authorization, a known security gap.

Never submit production personal, candidate, client, or confidential data to Anthropic during testing unless an owner has approved that processing.

### Practice, physician, favorites, and jobs workflows

- Search, filters, sort, pagination, and URL restoration after refresh/back/forward.
- Empty, loading, partial/null data, error, and retry behavior.
- Practice/physician detail links and missing records.
- List and map equivalence, clustered points, selected cluster, and missing coordinates.
- Favorite add/remove behavior, user isolation, and duplicate/race handling.
- Job filters, contact visibility, and linked/missing practices.

### Cache behavior

Practice list records use IndexedDB with a one-hour TTL. Favorites use a module-level 30-minute cache; detail loads may patch both. Test:

- empty cache and warm cache;
- TTL expiry;
- detail-to-list synchronization;
- logout/login as another user;
- stale server data and correction publication;
- unavailable/blocked IndexedDB;
- cache invalidation after favorite mutations.

Avoid tests that pass only because old local browser data remains.

### Account and consent

Test profile load/update failures, password-provider differences, password validation, consent opt-in/out persistence, and account soft deletion. Verify proxy rejection after deletion. The UI's 30-day restoration statement is not backed by a repository runbook or purge implementation; do not claim that operational path was tested without owner evidence.

## Frontend and accessibility checks

For UI changes:

- test keyboard-only operation in logical order;
- verify visible focus, labels, instructions, errors, and status announcements;
- check dialogs for initial focus, focus containment, Escape, close behavior, and focus restoration;
- verify color is not the sole carrier of scoring/status meaning;
- zoom to 200% and check reflow;
- test narrow layouts around 400px and the principal 768px breakpoint;
- test horizontal table and map interactions without trapping navigation;
- check reduced-motion behavior for animation;
- inspect semantic headings, landmarks, button/link choice, and accessible names.

Known examples requiring care include custom clickable `div` controls in account multi-selects, dropdown focus behavior, and the practice-error dialog, which has ARIA naming and Escape handling but no explicit focus trap/restoration.

## Recommended automation sequence

This is a proposal, not an approved tool choice:

1. Add unit tests for pure URL, cache, formatting, score-style, and validation helpers.
2. Add component tests for forms, dialogs, list states, and keyboard interactions.
3. Add integration tests against an isolated Supabase test project for RLS and ownership.
4. Add browser tests for auth, onboarding, research, favorites, corrections, account deletion, and admin denial.
5. Add CI for install, build, lint, tests, and migration validation.

Tests should use synthetic deterministic data, avoid production services by default, and make external API calls replaceable/fakeable. Database policy tests should execute with realistic anonymous, authenticated-user, second-user, and admin JWT contexts.

## Triage and regression practice

When fixing a defect, capture the smallest reproducible scenario and add an automated regression test once suitable infrastructure exists. For current manual-only fixes, document exact preconditions, steps, expected result, and observed result. Separate a newly introduced regression from known baseline debt.

High-severity correctness or security issues should not be waived because no test framework exists. Add a focused test harness or explicit repeatable check as part of the fix.

## Owner confirmation required

- Supported browsers, operating systems, devices, and assistive technologies
- Required checks and whether legacy lint findings block unrelated work
- Test framework choices, coverage targets, and CI enforcement
- Isolated Supabase test environment and schema/reset mechanism
- Test-data classification, retention, and prohibition/approval of production data
- Required auth providers and email/OAuth test infrastructure
- Release acceptance authority and security/accessibility sign-off
- External service mocking policy and permitted Anthropic test payloads
