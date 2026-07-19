# Deployment and release

## Purpose and scope

This runbook defines the repository-derived minimum for releasing MatchMed Atlas safely. It does not establish who may deploy, which hosting projects are canonical, or what production rollback objectives apply. Those items are marked **Owner confirmation required**.

Atlas is a Next.js 16 application with browser and server Supabase clients, a Mapbox browser integration, and a server-side Anthropic call. A release can therefore fail independently in application hosting, Supabase, Mapbox, or Anthropic.

## Required configuration

Use `.env.example` as the canonical variable-name inventory:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL; intentionally available to browser code.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key; intentionally available to browser code. Authorization must not depend on this key being secret.
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Mapbox browser token; intentionally available to browser code.
- `ANTHROPIC_API_KEY`: server-only credential used by `/api/generate-report`. Never expose it through a `NEXT_PUBLIC_` variable, logs, screenshots, report output, or client bundles.

Never copy values into documentation or source control. Confirm that each deployment environment has values for the correct external projects before promoting a build.

**Owner confirmation required:** canonical hosting provider and project; environment names; production and preview domains; credential owners; environment separation; allowed OAuth redirect URLs; Mapbox token restrictions; secret rotation procedure.

## Pre-release checklist

1. Identify the exact commit and changes included in the release.
2. Review all database migrations added since the currently deployed commit. The repository does not contain a complete production schema, so do not infer that a new database can be bootstrapped from this repository.
3. Classify migrations as backward compatible or coordinated. Prefer additive schema changes that can be applied before application code.
4. Confirm required variables by name against `.env.example`; do not print values.
5. Install dependencies from the tracked npm lockfile with `npm ci`. This is the proposed release default for a reproducible clean install; the repository owner must confirm it as policy.
6. Run:

   ```sh
   npm run lint
   npm run build
   ```

   Record failures and distinguish newly introduced failures from an approved baseline. There is no repository CI or automated test suite at the time of writing.
7. Manually exercise high-risk changes locally or in an approved non-production environment.
8. Confirm that Supabase Auth redirect URLs include the target origin plus `/auth/callback`.
9. Obtain the required release approval.

**Owner confirmation required:** release approver; whether all lint findings are blocking; supported browser matrix; required evidence and sign-off location.

## Deployment sequence

Use this default sequence only for backward-compatible database changes:

1. Announce the release window through the approved channel.
2. Capture the current application deployment identifier and database migration state.
3. Verify that the applicable database recovery mechanism is available. Do not claim a backup exists without checking.
4. Apply reviewed, backward-compatible migrations in timestamp order.
5. Verify migration objects, grants, and RLS policies in the target project.
6. Deploy the application build from the approved commit.
7. Run smoke tests.
8. Observe the application and external dependencies for regressions.
9. Record the result, commit, migration names, operator, and any follow-up.

For destructive, renaming, or access-policy changes, use an expand/migrate/contract release across multiple deployments. Do not deploy a schema change that removes fields still read by the currently running application.

**Owner confirmation required:** migration executor and tool; whether production migrations occur automatically or manually; release order policy; maintenance-window requirements; deployment notifications.

## Smoke tests

Use test accounts and test data approved for the target environment.

### Public and authentication

- `/login`, `/signup`, `/forgot-password`, `/terms-and-conditions`, and `/privacy-policy` load without a session.
- A protected route redirects a signed-out user to `/login`.
- Email/password login works.
- If Google OAuth is configured for the environment, callback handling returns to the application.
- Password-reset links reach `/auth/set-password`.

### Authenticated product

- Home, practices, physicians, favorites, jobs, and account routes load.
- Practice data can be queried through Supabase.
- A practice detail page loads and the Mapbox-dependent view does not fail.
- A normal user cannot access `/admin`.

### Admin and report paths

- An approved admin can open `/admin` and `/admin/reports`.
- The correction inbox can read reports after its migrations are present.
- If the report builder changed, use non-sensitive sample data to generate, review, preview, and print a report.

Do not send real client, candidate, or confidential data to Anthropic until the permitted-data policy is confirmed.

## Rollback

Application rollback should redeploy the last known-good immutable build. A database rollback is not automatically safe:

- If a migration was additive and the old application ignores it, leave it in place and roll back only the application.
- If a migration changed data or access policies, assess compatibility before rollback.
- Never edit an already-applied migration file to represent a rollback.
- Prefer a new forward-fix migration. Use restore or destructive reversal only with explicit authority and verified recovery evidence.
- After rollback, repeat smoke tests and document any data written by the failed version.

**Owner confirmation required:** rollback authority; hosting rollback procedure; database rollback policy; acceptable downtime; monitoring window.

## Release record

Every production release record should contain:

- timestamp and environment;
- source commit and deployment identifier;
- migration filenames applied;
- operator and approver;
- checks and smoke-test results;
- configuration names changed (never values);
- rollback decision and incidents or follow-up.

## Current gaps

- No CI workflow or automated tests are present.
- Most production DDL and RLS policies are absent from the repository.
- Monitoring, alerting, deployment ownership, and notification channels are undocumented.
- **Owner confirmation required:** domains, environments, approval workflow, release cadence, observability, and escalation contacts.
