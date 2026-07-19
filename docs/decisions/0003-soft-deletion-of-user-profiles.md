# ADR 0003: Soft deletion of user profiles

- Status: Needs confirmation
- Date observed: 2026-07-19
- Decision owners: **Owner confirmation required**

## Context

Account deletion and admin deletion currently update `profiles.deleted_at`. The proxy checks this field for authenticated requests to protected routes, signs out a deleted user, and redirects to login. The admin profile list excludes deleted profiles.

This does not delete the Supabase Auth identity or demonstrate deletion/cascade of favorites, reports, consent records, or other related data. No restoration UI, purge job, or migration-backed retention policy is present. User-facing account copy says restoration is available within 30 days, but the operational basis is not in the repository.

## Candidate decision

Represent account closure first as a reversible soft deletion on the profile, immediately preventing protected application access, then complete restoration or permanent deletion through a governed lifecycle.

Only the first step is implemented. Retention and permanent-deletion rationale are **Owner confirmation required**.

## Required lifecycle

1. Authenticate and authorize the request.
2. Set `deleted_at` and invalidate active access.
3. Hide the profile from normal/admin active views.
4. Preserve only data allowed by policy during a defined restoration window.
5. Restore only after approved identity verification, or purge/anonymize at expiry.
6. Record request, completion, exceptions, and legal holds.

## Consequences

Soft deletion supports accidental-deletion recovery and may preserve referential integrity. It also creates risk that product wording overstates deletion, that stale sessions or unprotected APIs remain usable, and that retained personal data exceeds user expectations or policy.

The proxy is route-level defense, not a complete data-lifecycle control. RLS and every API must enforce deleted-account behavior independently where relevant.

## Alternatives

- Immediate deletion of auth identity and associated rows.
- Immediate anonymization with irreversible account closure.
- A staged deletion-request table and asynchronous workflow.
- Provider-managed identity deletion plus explicit record retention.

Why these were rejected is **Owner confirmation required**.

## Validation before acceptance

Reconcile the 30-day product promise with legal/privacy text; inventory related records; define restoration, purge, legal hold, and user communication; verify all protected paths reject deleted users; test direct Supabase access under RLS; document who can clear `deleted_at`.

## Supersession criteria

Revisit if legal obligations require immediate erasure, restoration is not offered, identity/profile lifecycle moves to a dedicated service, or soft deletion cannot reliably block access.
