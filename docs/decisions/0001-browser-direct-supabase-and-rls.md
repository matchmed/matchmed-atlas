# ADR 0001: Browser-direct Supabase access and RLS

- Status: Needs confirmation
- Date observed: 2026-07-19
- Decision owners: **Owner confirmation required**

## Context

Atlas client components create a Supabase browser client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. They read and mutate profiles, practices, favorites, employer leads, and correction reports directly. Server components use the same publishable key with cookie-backed sessions.

The publishable key is intentionally browser-visible and is not an authorization control. Correct authorization therefore depends on Supabase Row Level Security (RLS), grants, and authenticated user context. The repository contains RLS only for `practice_error_reports`; the policies for most referenced production tables cannot be audited here.

## Candidate decision

Continue using browser-direct Supabase access for suitable user and admin data operations, with RLS as the mandatory authorization boundary. Use server route handlers only where server secrets, privileged orchestration, independent authorization, rate limiting, or external processors are involved.

This records current implementation, not confirmed rationale.

## Required constraints

- Enable RLS and define least-privilege policies for every browser-accessible table and operation.
- Test anonymous, normal-user, cross-user, deleted-user, and admin cases.
- Never ship service-role or server-only credentials to the browser.
- Treat UI route checks and `is_admin` rendering checks as defense in depth, not authorization.
- Keep grants and policies migration-controlled.
- Add server-side authorization to `/api/generate-report`; its current prompt-only validation is insufficient.
- Inventory production schema/policies before accepting this ADR.

## Consequences

Benefits may include fewer application API layers, session-aware realtime/browser access, and simpler data fetching. Risks include broad exposure from one incorrect RLS policy, coupling UI queries to schema, uneven error handling, and difficulty auditing policies absent from source.

Admin browser mutations are especially sensitive: NPI verification, profile soft deletion, and employer-lead linking are safe only if production RLS independently restricts them to approved admins.

## Alternatives

- A server-only data-access layer for every operation.
- A hybrid model with browser reads and server-mediated writes.
- Purpose-built backend endpoints or RPC functions for sensitive mutations.

The reasons these alternatives were rejected are **Owner confirmation required**.

## Validation before acceptance

Supply the authoritative schema/RLS inventory; add automated policy tests; verify admin mutations cannot be performed by a normal user; document policy ownership and review; decide which operations require an API/RPC boundary.

## Supersession criteria

Revisit if authorization complexity grows, privileged workflows need audit/transactions, schema changes repeatedly break clients, or a compliance requirement mandates centralized server enforcement.
