# Authentication and session lifecycle

## Scope and confidence

This document is based on `src/proxy.ts`, `src/lib/supabase*.ts`, authentication pages and route handlers, onboarding, account settings, and the admin layout as inspected on 2026-07-19.

**Code-derived fact** identifies implemented behavior. **Owner confirmation required** identifies Supabase dashboard settings, policy decisions, or support procedures that the repository cannot establish.

## Components

- Browser auth client: `src/lib/supabase.ts`, using Supabase SSR's browser client and `flowType: 'implicit'`.
- Server auth client: `src/lib/supabase-server.ts`, using request cookies.
- Request session refresh/gate: `src/proxy.ts`, calling `auth.getUser()` and propagating cookie updates.
- Callback: `GET /auth/callback`, supporting code exchange and token-hash verification.
- Recovery compatibility page: `/auth/set-password`, supporting code, token hash, and URL-fragment session establishment.
- Identity-adjacent profile: `profiles`, expected to connect `user_id` to a Supabase Auth user.

## Signup

### Email and password

The signup client requires matching passwords and enforces a client-side minimum of eight characters. It calls `auth.signUp` with email, password, and an email redirect to `/auth/callback`. A successful call displays a “check your email” state.

The repository does not establish whether Supabase email confirmation is enabled, the server-side password policy, rate limits, breached-password checks, CAPTCHA, allowed domains, or email-template contents.

### Google OAuth

Signup and login both call `signInWithOAuth({ provider: 'google' })`, redirecting to `/auth/callback` and requesting account selection. Provider configuration, scopes, consent-screen ownership, and redirect allowlists exist outside the repository.

## Callback and onboarding

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant C as /auth/callback
    participant S as Supabase Auth
    participant D as profiles

    U->>B: Open provider/email link
    B->>C: code or token_hash/type
    alt invite or recovery token_hash
        C->>S: verifyOtp()
        S-->>C: user/session or error
        C-->>B: recovery -> set-password; invite -> /
    else authorization code
        C->>S: exchangeCodeForSession()
        S-->>C: user/session or error
        alt password reset next marker
            C-->>B: /auth/set-password
        else normal auth
            C->>D: read onboarding_complete
            D-->>C: profile state
            C-->>B: /onboarding or /
        end
    else invalid input
        C-->>B: /login?error=auth_failed or /forgot-password
    end
```

Onboarding writes expected profile fields: Supabase user ID/email, names, NPI, phone, preferred states, anticipated start year, clinical focus, training status, practice-setting preferences, current practice/program, procedures performed/desired, Terms acceptance, partner-contact preference (`data_sharing`), completion flag, and signup date.

The UI labels many fields required, but the first-step button only checks first name, last name, NPI, and training status. Submission checks Terms acceptance. No repository DDL confirms database validation, NPI format/uniqueness, consent timestamp/version, or required constraints.

The code first upserts on `user_id`. On any upsert error it attempts an update by email, but it does not surface an update failure and proceeds to success. This is a current reliability and identity-linkage limitation.

## Login

Password login calls `signInWithPassword`, then navigates to `/`. Google login uses the callback above. Neither login path itself checks onboarding completion or `deleted_at`; the subsequent request is intercepted by the proxy, which checks soft deletion. Direct password login does not redirect incomplete profiles to onboarding.

The login page also supports a legacy/implicit URL fragment containing `access_token`: browser client initialization is expected to process the fragment, then the page waits 500 ms, reads the session, and routes to `/`.

## Session validation and refresh

For matched requests, the proxy:

1. creates a Supabase server client from incoming cookies;
2. allows Supabase to write refreshed cookies to both request and response;
3. calls `auth.getUser()` to validate the user with Supabase;
4. redirects unauthenticated users unless the route is public;
5. for authenticated protected routes, checks `profiles.deleted_at`.

This establishes current request-time authentication. Cookie names, expiry, refresh-token rotation, inactivity timeout, absolute lifetime, concurrent session limits, and revocation settings are Supabase configuration and are not in the repository.

Client components often call `auth.getUser()` again before profile-sensitive work. Some read `getSession()` only while establishing a recovery/fragment session. `getSession()` is not used as the server authorization primitive.

## Password recovery

The forgot-password page sends a reset email with redirect:

`/auth/callback?next=/auth/set-password`

The callback handles a PKCE `code` or recovery `token_hash`. The set-password page additionally supports links that arrive directly with:

- `code`, exchanged for a session;
- `token_hash&type=recovery`, verified as an OTP;
- an implicit URL hash containing `access_token`, observed via auth-state events with a three-second fallback.

After establishing a session, the page removes recovery parameters from the visible URL, requires an eight-character matching password pair, and calls `updateUser`. It then routes based on `profiles.onboarding_complete`.

This compatibility is broad but the canonical flow is unclear: the browser client explicitly requests implicit flow while server code expects PKCE-compatible codes. Debug logging also records the authenticated user ID when recovery becomes ready. It does not print token values, but production logging policy is unknown.

## Password change while signed in

For users with an email identity, account settings reauthenticate using the current email/password and then call `updateUser` with the new password. The UI enforces eight characters and equality. Google-only users are directed to Google for password management.

Whether changing a password invalidates other sessions is controlled outside this repository.

## Logout

Navigation and account deletion call `auth.signOut()`, then navigate to `/login`. The proxy also signs out a user when `profiles.deleted_at` is non-null.

The logout functions do not explicitly clear IndexedDB practice data, `sessionStorage` map state, or the in-memory favorites cache. Practice cache data appears non-profile in current code, but cache-clearing expectations still require an owner decision.

## Soft deletion

Account deletion updates the current profile's `deleted_at` timestamp, signs out, and routes to login. Admin deletion performs the same profile-field update for a selected profile. The proxy prevents a soft-deleted profile from using protected routes.

No code in this repository:

- deletes the Supabase Auth identity;
- schedules hard deletion;
- erases/cascades profile-linked rows;
- implements restoration;
- records deletion reason or request completion;
- notifies processors;
- clears browser caches.

The account UI promises restoration if contact occurs within 30 days. The public Privacy Policy says verified deletion requests are actioned within 45 days. These statements describe different concepts but are not connected to an implementation here and require legal/owner reconciliation.

## Administration

The server admin layout validates a Supabase user and reads `profiles.is_admin`; non-admin users are redirected to `/`. Some admin client pages repeat the check. `practice_error_reports` RLS independently requires `is_admin` for SELECT/UPDATE.

No MFA requirement, step-up authentication, admin session duration, role-change audit, or admin assignment mechanism is represented in the repository. The admin screen can generate a Supabase OTP/magic link for a profile email and can alter user-facing data. Exact operational controls are unknown.

## Threat boundaries and current limitations

- The global proxy authenticates `/api/generate-report`, but that route does not enforce admin status locally.
- The browser directly queries Supabase; complete RLS is mandatory but absent from repository evidence.
- Onboarding is not universally enforced after ordinary password login or direct navigation.
- A valid auth user with no profile passes the proxy's deleted-account check.
- Mixed implicit, code-exchange, and token-hash recovery paths increase complexity and regression risk.
- The login fragment compatibility path logs a session object to the browser console. Depending on SDK object contents, this may expose session material in developer tools and should be removed or redacted.
- Client-side password rules do not establish server-side policy.
- No MFA, bot defense, auth event audit, anomaly detection, or session-management UI is evident.
- Errors from Supabase are sometimes displayed directly, and several auth branches rely on console logs rather than centralized telemetry.

## Owner confirmation required

Security/product owners must provide or decide:

1. canonical OAuth/recovery flow (PKCE versus implicit) and removal timeline for compatibility paths;
2. Supabase Auth settings: confirmation, password policy, token/session lifetimes, refresh rotation, rate limits, CAPTCHA, and redirect allowlists;
3. MFA and step-up requirements, especially for administrators;
4. invite eligibility and who may issue links;
5. mandatory onboarding enforcement and behavior for missing profiles;
6. admin provisioning/removal and audit policy;
7. logout and browser-cache-clearing requirements;
8. soft-deletion restoration process, hard-deletion schedule, processor deletion, and legal hold exceptions;
9. support procedure for expired links, account takeover, lost OAuth access, and identity disputes;
10. permitted auth logging and retention.
