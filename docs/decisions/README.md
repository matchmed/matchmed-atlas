# Architecture decision records

Architecture decision records (ADRs) preserve the context, choice, consequences, and unresolved ownership of decisions that are costly to reverse. They describe architecture; they do not override source code, migrations, security policy, or legal text.

## Statuses

- **Proposed:** a candidate decision inferred from the implementation; approval is not established.
- **Needs confirmation:** implementation exists, but rationale, approver, or intended permanence is unknown.
- **Accepted:** explicitly approved by accountable owners.
- **Superseded:** replaced by a later ADR, which must link back.
- **Deprecated:** retained for history but no longer recommended.

Do not mark an ADR Accepted from code inference alone. Update ADRs when a decision changes; do not rewrite historical context to hide prior behavior.

## Index

1. [Browser-direct Supabase access and RLS](0001-browser-direct-supabase-and-rls.md) — Needs confirmation
2. [IndexedDB bulk caching](0002-indexeddb-bulk-caching.md) — Needs confirmation
3. [Soft deletion of user profiles](0003-soft-deletion-of-user-profiles.md) — Needs confirmation
4. [Protected informational routes](0004-protected-informational-routes.md) — Proposed
5. [Supabase authentication flow](0005-supabase-authentication-flow.md) — Proposed
6. [AI-assisted market-report processing](0006-ai-assisted-market-report-processing.md) — Proposed

## New ADR checklist

Include status, date, owners, context, decision, alternatives, consequences, security/privacy implications, validation, and supersession criteria. Mark every unknown as **Owner confirmation required**.
