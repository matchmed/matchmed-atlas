# Atlas AI context

This file defines the operating context for AI assistants working on MatchMed Atlas. Read it before proposing or making changes, then read the documentation relevant to the task.

## Why Atlas exists

Atlas by MatchMed is a workforce intelligence platform built specifically for ophthalmology. It helps ophthalmologists evaluate practices, understand workforce stability, explore employment opportunities, and make more informed career decisions using longitudinal workforce data.

Physician trust is a product requirement. Prefer behavior that is understandable, explainable, and auditable over behavior that is merely convenient or clever.

## Working philosophy

When uncertain:

- prefer correctness over speed;
- prefer explicitness over cleverness;
- prefer repository evidence over assumptions;
- ask for owner confirmation rather than inventing policy;
- keep changes as small as possible.

## Before making changes

1. Read `AGENTS.md`.
2. Read the relevant documents linked from `README.md`.
3. Inspect the current implementation; documentation may contain explicit owner-confirmation gaps.
4. For Next.js work, read the relevant bundled guide in `node_modules/next/dist/docs/` before writing code.
5. Preserve unrelated user changes and keep the scope aligned with the request.

## Security boundaries

- Never introduce a Supabase secret or service-role client without explicit approval and a documented architecture decision.
- Never bypass RLS. Browser and ordinary server clients use the Supabase publishable key; database policies are the authorization boundary.
- Never put privileged credentials in `NEXT_PUBLIC_*` variables.
- Never expose secrets in source, documentation, chat, logs, screenshots, fixtures, commands, or error responses.
- Never expose Atlas scores or authenticated product data before authentication without explicit product-owner approval.
- Treat client-side hiding, route redirects, and admin UI checks as insufficient protection for direct data access.
- Add authorization at the database or server boundary appropriate to the operation.
- Keep Anthropic credentials and other server credentials server-only.

## Product and engineering principles

Atlas intentionally:

- favors explicit architecture over hidden coupling;
- favors explainable scoring and public-source data over opaque automation;
- minimizes hidden business logic;
- distinguishes observed implementation from approved product policy;
- makes uncertainty and stale-data behavior visible;
- treats accessibility, privacy, and physician trust as engineering concerns;
- documents consequential changes alongside the code.

Do not invent scoring formulas, data provenance, legal policy, retention rules, SLAs, or operational procedures. Mark missing decisions as **Owner confirmation required**.

## Current architecture

- Next.js App Router runs on Vercel.
- Supabase provides authentication and Postgres access.
- Application Supabase clients use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Most product data is queried directly from the browser, so RLS must enforce access.
- Mapbox powers practice-map functionality.
- Anthropic powers the admin market-report builder through a server route.
- The repository does not contain a complete production schema, complete RLS inventory, ingestion pipeline, or scoring implementation.

Start with:

- `docs/architecture/application-architecture.md`
- `docs/architecture/routes-and-access-control.md`
- `docs/security/authentication-and-session-lifecycle.md`
- `docs/data/domain-model-and-authorization.md`

## Caching model

Atlas currently uses:

- in-memory and IndexedDB caching for practice-list data;
- a one-hour practice-cache reuse TTL;
- a separate in-memory favorites cache;
- `sessionStorage` for map-view restoration.

Preserve the current caching model unless the task intentionally changes it. When changing queries, mutations, identity handling, or navigation, account for cache invalidation, stale records, logout behavior, and multiple browser tabs.

Read:

- `docs/architecture/application-architecture.md`
- `docs/engineering/frontend-design-and-accessibility.md`

## Data and scoring

- Do not treat UI field shapes as authoritative database schema.
- Do not assume production RLS from client query predicates.
- Do not change score meaning, thresholds, colors, labels, or explanatory copy casually.
- Do not present CMS-derived workforce movement as real-time ground truth.
- Keep workforce doctors, authenticated profiles, and Supabase Auth users conceptually distinct.
- Preserve the distinction between code-derived facts, published claims, and owner-approved policy.

Read:

- `docs/data/domain-model-and-authorization.md`
- `docs/data/provenance-ingestion-and-refresh.md`
- `docs/product/scoring-and-intelligence.md`
- `docs/product/content-governance.md`

## Change discipline

For every change:

1. Identify the caller, data, trust boundary, and authorization rule.
2. Check affected routes, RLS assumptions, caches, responsive behavior, and accessibility.
3. Avoid unrelated refactors.
4. Run checks proportional to the risk.
5. Report pre-existing failures separately from introduced failures.
6. Update documentation when architecture, security boundaries, data behavior, product terminology, or operating procedures change.
7. Add or update an ADR when a consequential architectural decision changes.

## Sources of truth

For current technical behavior, use this priority order when information conflicts:

1. Production database behavior and deployed configuration
2. Supabase migrations, only for the objects they define
3. Source code
4. Documentation
5. Historical discussions

Additional boundaries:

- `README.md` is the documentation navigation entry point.
- `.env.example` is the canonical environment-variable name inventory; it must contain no values.
- Public Terms and Privacy pages are the currently published legal text, even when implementation gaps are documented.
- Sections marked **Owner confirmation required** are unresolved, not approved policy.
- `docs/decisions/` records architectural decisions and proposals.

Observed production behavior is not automatically intended product policy. If code, database behavior, and documentation disagree, investigate before changing any of them.
