# ADR 0004: Protected informational routes

- Status: Proposed
- Date observed: 2026-07-19
- Decision owners: **Owner confirmation required**

## Context

The request proxy treats only login, signup, forgot-password, terms, privacy, and `/auth/*` as public. Consequently `/scoring-methodology` and `/partners`, along with core product routes, require an authenticated non-deleted user.

These pages contain informational and trust-building content that might ordinarily be public. The repository does not explain whether their protection is intentional, commercially required, temporary, or an allowlist omission.

## Proposed decision

Explicitly classify each informational route rather than relying on the default “not allowlisted means protected” behavior.

Until owners decide otherwise, preserve current behavior:

- public: authentication entry/recovery routes, Terms, and Privacy;
- protected: scoring methodology and partners content;
- admin-only: `/admin` and descendants.

This is a conservative compatibility proposal, not an endorsement of the current product policy.

## Consequences

Protection may limit access to claims, partner information, or proprietary methodology and keeps navigation consistent with an authenticated product. It also prevents prospective users, search engines, reviewers, and link recipients from seeing content that may be intended for public transparency. Accidental omissions from the allowlist can create confusing login redirects.

Terms and Privacy remain public so users can review legal text during signup.

## Alternatives

- Make methodology and partner pages public.
- Publish a reduced public summary and keep detailed material protected.
- Replace path allowlisting with route-group metadata or explicit per-route guards.

Commercial, legal, SEO, and transparency rationale is **Owner confirmation required**.

## Validation before acceptance

Product, legal, security, and content owners must classify each route; verify links from login/signup and external pages; decide indexing/caching rules; add route-access tests for signed-out, active, deleted, and admin users.

## Supersession criteria

Revisit when informational content is used for acquisition, legal transparency requirements change, public sharing is needed, or path allowlisting becomes hard to audit.
