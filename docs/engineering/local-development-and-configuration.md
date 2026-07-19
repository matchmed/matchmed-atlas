# Local development and configuration

This guide covers configuration that can be verified from the repository. Credential acquisition, shared development environments, and production operations require owner confirmation.

## Prerequisites

- Git
- Node.js and npm compatible with the dependency versions in `package.json`
- Access to a non-production Supabase project with the schema and RLS required by Atlas
- A browser-visible Mapbox token for map development
- An Anthropic key only for testing the admin report-generation integration

The repository does not pin Node through `.nvmrc`, `.node-version`, or a `package.json` `engines` field. Record the Node/npm versions used when diagnosing environment-specific failures.

## Installation

From the repository root:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Stop the server with `Ctrl-C`.

Use npm because `package-lock.json` is the tracked lockfile. `npm install` is the documented local bootstrap command; the release runbook uses `npm ci` for a lockfile-exact clean install. The repository owner still needs to confirm this as the formal package-manager policy. Do not switch package managers or regenerate lockfiles incidentally without owner agreement.

## Environment variables

`.env.example` is the canonical variable-name inventory:

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Supabase project API URL used by browser, server, and proxy clients |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-visible | Supabase publishable key; database authorization must be enforced by RLS |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser-visible | Mapbox GL token used by practice map functionality |
| `ANTHROPIC_API_KEY` | Server-only | Authenticates the report-builder route to Anthropic |

Never add values to documentation or commit `.env.local`. A `NEXT_PUBLIC_` value is included in client-side output; it cannot safely contain a privileged secret. Do not substitute a Supabase service-role key for the publishable key.

The application references these variables as follows:

- `src/lib/supabase.ts` creates the browser client and throws clear errors when Supabase variables are absent.
- `src/lib/supabase-server.ts` creates a cookie-backed server client.
- `src/proxy.ts` refreshes sessions and applies broad route authentication.
- practice map code reads the Mapbox token.
- `src/app/api/generate-report/route.ts` reads the Anthropic key server-side.

Restart the development server after changing environment variables. If a value is exposed accidentally, do not merely delete the file or commit: revoke/rotate the credential with its provider and notify the credential owner.

## Database expectations

The application references production entities including profiles, practices, doctors/physicians, affiliations, favorites/shortlists, jobs or employer leads, and practice error reports. Most DDL and RLS are absent from this repository. A fresh Supabase project cannot be assumed to work after applying only the tracked migrations.

The two migrations in `supabase/migrations/` create and grant access to `practice_error_reports`; the first references pre-existing `practices` and `profiles` tables. Apply migrations only through the workflow approved by the database owner. Never point local experimentation at production.

Authentication flows also depend on Supabase configuration:

- email/password signup and email confirmation;
- Google OAuth;
- callback and password-recovery redirect URLs;
- cookie/session behavior;
- profile creation and onboarding expectations.

For local URLs, provider dashboards may need `http://localhost:3000/auth/callback` and recovery destinations allowlisted. Exact configuration is not stored in the repository.

## Common commands

```bash
npm run dev
npm run build
npm run start
npm run lint
```

`npm run start` expects a completed `.next` build, so run `npm run build` first. The build performs compilation and TypeScript validation. ESLint is configured by `eslint.config.mjs` with Next core-web-vitals and TypeScript rules.

Verified baseline on 2026-07-19:

- `npm run build`: succeeds with Next.js 16.2.9/Turbopack.
- `npm run lint`: fails with 36 errors and 13 warnings in existing source.
- Automated tests: no test script, test files, or CI workflow is present.

See `testing-and-quality.md` for how to report this baseline honestly.

## Application structure

- `src/app/` — App Router pages, layouts, auth handlers, and API routes
- `src/components/` — shared client UI
- `src/lib/` — Supabase clients, cache implementations, and list utilities
- `src/proxy.ts` — session refresh, public-route allowlist, deleted-profile handling
- `supabase/migrations/` — tracked SQL changes, not a complete schema
- `public/` — static assets

Next.js behavior may differ from older framework versions. Before changing framework APIs, read the relevant checked-in guide under `node_modules/next/dist/docs/`, as required by `AGENTS.md`.

## Development accounts and data

Use synthetic or approved non-production records. Profile fields may include names, email-linked identity, NPI, phone, location preferences, training information, clinical interests, procedures, and contact consent. Do not copy production profiles or report snapshots into local fixtures, bug reports, or screenshots.

Test ordinary-user and admin behavior using distinct accounts. Setting UI state or changing a client response is not a valid way to test authorization; roles and RLS must be exercised against the configured Supabase project.

## Troubleshooting

**Redirected to login:** confirm Supabase URL/key, local auth redirect configuration, and a valid session. `src/proxy.ts` protects most routes.

**Immediately signed out:** inspect the test profile's `deleted_at` state through an approved admin/database tool.

**Data queries fail:** the local project may lack production schema or RLS. Do not weaken policies to make development convenient; obtain the authoritative schema and intended access.

**Map is blank:** check that `NEXT_PUBLIC_MAPBOX_TOKEN` is configured and permitted for the local origin, then inspect browser network/console errors without sharing the token.

**Report generation returns 500:** `ANTHROPIC_API_KEY` may be missing or the upstream call may have failed. Do not log the key. Note that direct API authorization is currently incomplete; see `SECURITY.md`.

**Apparently stale practice data:** practice lists use a one-hour IndexedDB cache. Favorites use a 30-minute in-memory cache. Test a fresh browser profile or clear only the relevant local development storage.

## Owner confirmation required

- Supported Node/npm versions and package-manager/lockfile policy
- How contributors request credentials and who owns each environment
- Canonical development Supabase project and complete schema bootstrap
- Test-account creation, role assignment, and synthetic-data policy
- Exact Supabase site URL, OAuth, email, and recovery redirect settings
- Token restrictions, secret manager, rotation cadence, and revocation contacts
- Supported local platforms and whether containerized development is required
