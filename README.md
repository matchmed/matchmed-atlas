# MatchMed Atlas

Atlas by MatchMed is a workforce intelligence platform built specifically for ophthalmology. It helps ophthalmologists evaluate practices, understand workforce stability, explore employment opportunities, and make more informed career decisions using longitudinal workforce data.

The current application lets authenticated users explore practices and physicians, inspect practice retention indicators, use map and list views, save favorite practices, review jobs, manage a professional profile, and report suspected practice-data errors. Administrators have additional profile-management, error-report triage, and market-report builder screens.

This description is derived from the current routes and UI. It is not a statement of product eligibility, commercial terms, dataset completeness, or scoring validity.

## Repository status

Atlas is a private application (`package.json` version `0.1.0`). The repository contains the application and two migrations for practice error reports, but it does **not** contain a complete production database schema, all row-level security (RLS) policies, a test suite, CI configuration, deployment configuration, or the data-ingestion pipeline. Do not infer production operations from this repository alone.

## Technology

- Next.js 16 App Router and React 19
- TypeScript 5
- Tailwind CSS 4 plus substantial shared and inline CSS
- Supabase authentication, Postgres access, and RLS via `@supabase/ssr`
- Mapbox GL for geographic practice exploration
- Anthropic Messages API for the admin market-report builder

Dependency versions and npm scripts are canonical in `package.json`.

## Architecture at a glance

```text
Browser
   │
   ▼
Next.js (Vercel)
   │
   ├──► Supabase Auth
   │         │
   │         ▼
   ├──► Postgres (RLS)
   │
   ├──► Mapbox
   │
   └──► Anthropic API
```

## Product surface

The current route families are:

- Authentication: `/login`, `/signup`, `/forgot-password`, `/auth/*`, and `/onboarding`
- Research: `/practices`, `/practices/[id]`, `/physicians`, and `/physicians/[id]`
- User tools: `/favorites`, `/jobs`, and `/account`
- Information: `/scoring-methodology`, `/partners`, `/terms-and-conditions`, and `/privacy-policy`
- Administration: `/admin`, `/admin/reports`, and `/admin/report-builder`
- Server endpoint: `POST /api/generate-report`

`src/proxy.ts` permits unauthenticated access only to login, signup, forgot-password, Terms, Privacy, and `/auth/*`. Other routes—including scoring methodology and partners—currently require authentication. `src/app/admin/layout.tsx` adds an `is_admin` profile check for admin pages.

## Local setup

Prerequisites:

- A Node.js/npm environment compatible with the checked-in dependencies
- Access to a suitable Supabase project
- A Mapbox browser token for map functionality
- An Anthropic API key only when exercising report generation

Install and configure:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Configure only these variable names; never commit their values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `ANTHROPIC_API_KEY`

Variables prefixed `NEXT_PUBLIC_` are bundled for browser use and must never hold privileged credentials. `ANTHROPIC_API_KEY` is read by the server route and must remain server-only. See [local development and configuration](docs/engineering/local-development-and-configuration.md) for provisioning boundaries and troubleshooting.

## Commands and current quality baseline

```bash
npm run dev     # development server
npm run build   # production compile and TypeScript validation
npm run start   # serve a completed production build
npm run lint    # ESLint with Next core-web-vitals and TypeScript rules
```

As verified on 2026-07-19, `npm run build` succeeds, while `npm run lint` reports 36 existing errors and 13 warnings. There is no automated test command or CI workflow in the repository. Treat both build and lint output as evidence in pull requests; do not imply that a successful build means the application is fully tested. Details are in [testing and quality](docs/engineering/testing-and-quality.md).

## Important architecture boundaries

- Browser and server Supabase clients use the publishable key. Authorization therefore depends on correctly configured database RLS; a publishable key is not an authorization boundary.
- The repository only proves RLS behavior for `practice_error_reports`, through migrations in `supabase/migrations/`. Obtain the authoritative production schema and policy inventory before changing other data access.
- Practice list data is cached in IndexedDB for one hour (`src/lib/practices-cache.ts` and `src/lib/atlas-cache.ts`). Favorites also use a 30-minute in-memory cache (`src/lib/favorites-cache.ts`). Cache behavior should be included in stale-data testing.
- Account deletion currently marks `profiles.deleted_at`, signs the user out, and causes the proxy to reject subsequent sessions. The UI mentions restoration within 30 days, but the repository contains no purge or restoration process.
- The report-generation endpoint forwards a caller-supplied prompt to Anthropic. Its route does not independently check admin status; deployment security must account for this.

## Design principles

Atlas intentionally:

- uses publishable Supabase keys only;
- relies on RLS rather than privileged server access;
- minimizes hidden business logic;
- favors public, explainable data;
- treats physician trust as a product requirement.

## Project philosophy

Atlas is designed to be understandable. We prefer explicit architecture, explainable scoring, and reproducible data over opaque automation. When implementation, policy, and documentation disagree, the mismatch should be made visible and resolved rather than hidden behind assumptions.

## Current known limitations

- CMS physician movement data lags real-world changes.
- Practice error reports currently cover practice metadata rather than scoring or physician-history corrections.
- The market-report builder depends on Anthropic.
- The production database schema and most RLS policies are not fully represented in this repository.
- The ingestion and scoring pipeline is not included in this repository.

## Project layout

- `src/app/` — routes, layouts, pages, and the report-generation route handler
- `src/components/` — shared navigation, logo, icons, and correction-report modal
- `src/lib/` — Supabase clients, browser caches, URL/search utilities
- `src/proxy.ts` — session refresh and broad route authentication
- `supabase/migrations/` — tracked database changes (currently incomplete as a schema baseline)
- `docs/` — product, architecture, security, data, engineering, operations, and decision records

## Documentation

### Product

- [Product overview](docs/product/overview.md)
- [User workflows](docs/product/user-workflows.md)
- [Scoring and intelligence](docs/product/scoring-and-intelligence.md)
- [Jobs, partners, and consent](docs/product/jobs-partners-and-consent.md)
- [Content governance](docs/product/content-governance.md)
- [Project history](docs/history/project-history.md)

### Architecture, security, and data

- [Application architecture](docs/architecture/application-architecture.md)
- [Routes and access control](docs/architecture/routes-and-access-control.md)
- [Authentication and session lifecycle](docs/security/authentication-and-session-lifecycle.md)
- [Domain model and authorization](docs/data/domain-model-and-authorization.md)
- [Provenance, ingestion, and refresh](docs/data/provenance-ingestion-and-refresh.md)
- [Privacy, retention, and processor map](docs/data/privacy-retention-and-processor-map.md)

### Engineering and operations

- [Local development and configuration](docs/engineering/local-development-and-configuration.md)
- [Testing and quality](docs/engineering/testing-and-quality.md)
- [Frontend design and accessibility](docs/engineering/frontend-design-and-accessibility.md)
- [Deployment and release](docs/operations/deployment-and-release.md)
- [Database migrations, backup, and recovery](docs/operations/database-migrations-backup-and-recovery.md)
- [Admin and data-corrections runbook](docs/operations/admin-and-data-corrections-runbook.md)
- [Market-report builder](docs/operations/market-report-builder.md)
- [Incident runbooks](docs/operations/incident-runbooks.md)
- [Architecture decision records](docs/decisions/README.md)

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code or migrations. Report suspected vulnerabilities according to [SECURITY.md](SECURITY.md); do not disclose secrets or exploitable details in a public issue. User-facing Terms and Privacy pages are the current legal text in the application, but their review ownership is not documented here.

## Owner confirmation required

The following cannot be verified from this repository and must be supplied by accountable owners:

- Canonical product description, intended users, eligibility, and product boundaries
- Production URL, supported environments, hosting topology, and environment owners
- Repository owner and engineering/product/security support contacts
- Authoritative production schema, complete RLS inventory, and data stewards
- Dataset provenance, ingestion location, scoring formulas, validation, and refresh cadence
- Release process, monitoring, incident escalation, retention, and account-restoration procedures
