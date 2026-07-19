# ADR 0005: Supabase authentication flow

- Status: Proposed
- Date observed: 2026-07-19
- Decision owners: **Owner confirmation required**

## Context

Atlas supports email/password signup and login, Google OAuth, password recovery, invite/magic-link handling, cookie refresh in the request proxy, onboarding redirects, and logout. The browser client is explicitly configured with Supabase `flowType: 'implicit'`, while `/auth/callback` exchanges PKCE authorization codes and verifies invite/recovery token hashes. The set-password page additionally handles code, token-hash, and legacy URL-fragment access tokens.

This compatibility mix may reflect migration history rather than a deliberate long-term design.

## Proposed decision

Standardize new authentication links and OAuth callbacks on one Supabase-supported server callback flow, preferably PKCE/code exchange for cookie-backed Next.js sessions, while retaining legacy token handling only for a time-boxed compatibility period.

Do not remove current fallback paths until production email templates, OAuth redirect settings, existing links, and supported clients are inventoried.

## Required behavior

- Refresh sessions through the server proxy.
- Keep login, signup, recovery, callback, and legal routes public.
- Route users with missing/incomplete profiles to onboarding after callback/password reset.
- Reject deleted profiles on protected routes.
- Validate redirect destinations to prevent open redirects.
- Never log tokens, codes, session contents, or magic-link URLs.
- Apply stronger admin controls if required by policy.

## Consequences

A canonical flow reduces callback branches and support ambiguity. Migration risks include invalidating outstanding links, mismatched Supabase email templates, cookie/fragment differences, and OAuth redirect failures across environments.

The current callback accepts only a fixed `next` value for password reset, which limits open-redirect risk. The login page currently logs a session object after fragment handling; that should not be treated as acceptable production logging.

## Alternatives

- Retain implicit flow as canonical.
- Keep permanent multi-flow compatibility.
- Delegate authentication to a different identity layer.

Original rationale, session-lifetime requirements, and rejected alternatives are **Owner confirmation required**.

## Validation before acceptance

Confirm Supabase project flow settings and templates; inventory allowed origins; test signup confirmation, password login, Google OAuth, invite, magic link, recovery, expired links, onboarding, logout, and deleted users; define MFA/admin requirements and session lifetime.

## Supersession criteria

Revisit if Supabase guidance changes, enterprise SSO/MFA is required, auth moves behind a dedicated backend, or legacy links are fully retired.
