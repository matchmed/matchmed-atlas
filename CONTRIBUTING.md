# Contributing to MatchMed Atlas

This guide describes workflows supported by the repository today and highlights decisions that still require an owner. It does not invent branch-protection or release policy.

## Before changing code

1. Read `README.md`, `SECURITY.md`, and the relevant document in `docs/engineering/`.
2. Inspect nearby code and current behavior. Atlas uses Next.js 16; consult the checked-in Next documentation under `node_modules/next/dist/docs/` before changing framework APIs or conventions.
3. Keep a change narrow. Separate application behavior, schema changes, and unrelated cleanup where practical.
4. Never place credentials or production personal data in source, fixtures, documentation, screenshots, logs, or prompts.

## Setup and commands

```bash
npm install
cp .env.example .env.local
npm run dev
```

Request development credentials through an approved private channel. Configure variable names only as described in `docs/engineering/local-development-and-configuration.md`.

Before requesting review, run:

```bash
npm run build
npm run lint
```

There is currently no `test` script or CI workflow. On 2026-07-19, the production build passed and repository-wide lint reported 36 errors and 13 warnings. Do not silently broaden a feature PR into a full lint cleanup; do not introduce new findings in touched code. Record commands, results, focused manual checks, and any pre-existing failures in the PR.

## Project conventions

- Application routes and route handlers live in `src/app/`.
- Reusable UI belongs in `src/components/`; reusable data/browser utilities belong in `src/lib/`.
- Use the `@/` import alias already used throughout the project.
- Preserve server/client boundaries. Add `'use client'` only where browser APIs, effects, or event handling require it.
- Use server-side auth checks and Supabase RLS for authorization. Hiding a link or page element is not sufficient.
- Follow the shared visual tokens in `tailwind.config.ts`, `src/app/globals.css`, and `docs/engineering/frontend-design-and-accessibility.md`.
- Prefer semantic HTML and labeled native controls. Any custom interaction must have equivalent keyboard, focus, name, role, value, and state behavior.
- Keep list search/filter state shareable in the URL where existing list pages do so.
- Account for the IndexedDB and in-memory caches under `src/lib/` when changing practice or favorites data.

## Database changes

The repository does not contain a complete baseline of the production schema. Before changing an existing database object, obtain the authoritative schema and policies from the database owner.

New SQL migrations belong in `supabase/migrations/` and follow the existing sortable UTC timestamp pattern:

```text
YYYYMMDDHHMMSS_short_description.sql
```

For each migration:

- make schema, constraints, indexes, grants, and RLS intent explicit;
- use least privilege and test ordinary authenticated users separately from admins;
- consider existing data and whether the operation is safe on a populated table;
- document forward deployment and recovery implications;
- do not assume deleting a migration file reverses a deployed migration;
- avoid embedding environment-specific identifiers or data.

The tracked `practice_error_reports` migrations are useful examples of constraints, indexes, RLS, and grants. They are not a complete model for every table.

## Security-sensitive changes

Request focused review for changes to:

- `src/proxy.ts` and auth callback/recovery routes;
- `src/lib/supabase.ts` or `src/lib/supabase-server.ts`;
- `src/app/admin/` or `src/app/api/`;
- account deletion, profile consent, favorites ownership, or correction reports;
- migrations, grants, RLS, external-service payloads, or environment variables.

Read `SECURITY.md`. Test negative authorization paths, not just the successful UI flow.

## Manual verification

Choose checks in proportion to the change. A typical UI change should cover:

- desktop and a narrow viewport around the current 768px transition;
- keyboard-only navigation and visible focus;
- loading, empty, validation, error, success, and disabled states;
- direct URL entry, refresh, and browser back/forward behavior;
- authenticated and unauthenticated behavior;
- an ordinary user and admin where authorization differs;
- fresh data and warm/stale cache paths where relevant.

For auth and data changes, use the risk-based matrix in `docs/engineering/testing-and-quality.md`.

## Pull request content

A reviewable PR should explain:

- the user or operator problem and the chosen scope;
- important implementation and authorization decisions;
- schema or environment-variable-name changes;
- commands run and exact results;
- manual scenarios and viewport/browser used;
- known limitations, follow-up work, and rollback considerations;
- screenshots for visual changes, with personal data removed.

Update `CHANGELOG.md` only for user/operator-visible changes according to its current unreleased format. Documentation-only maintenance does not need a changelog entry unless it corrects a materially misleading operational instruction.

## Documentation

Code, migrations, `.env.example`, and public legal pages remain canonical for their respective facts. Documentation should link to those sources, distinguish current behavior from intended behavior, and use a clearly labeled **Owner confirmation required** section when policy or operational knowledge is unavailable. Never turn UI copy into an unverified operational guarantee.

## Owner confirmation required

The following contribution policies are not present in the repository:

- canonical repository owner and contributor support contact;
- branch naming, fork policy, and protected default branch;
- required approvals, CODEOWNERS, and security review triggers;
- commit-message or squash/merge convention;
- whether all legacy lint findings block unrelated changes;
- required browser/device matrix, test coverage, and acceptance criteria;
- migration approver/executor and production-data testing policy;
- release authority, versioning, and changelog approval.

Until owners decide these items, reviewers should agree on them explicitly for each material change rather than presenting local custom as project policy.
