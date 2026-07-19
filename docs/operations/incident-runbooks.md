# Incident runbooks

## How to use this document

These are repository-derived technical response paths. They do not establish severity, on-call coverage, notification obligations, contacts, SLAs, RPO/RTO, or vendor support entitlements.

For every incident:

1. open the approved incident record and note detection time;
2. identify affected environment, users, routes, and data;
3. assign an incident lead;
4. preserve relevant logs without copying secrets or unnecessary personal data;
5. contain the issue with the least destructive reversible action;
6. validate recovery with representative workflows;
7. record timeline, decisions, impact, and follow-up.

**Owner confirmation required:** severity model, contacts, escalation tree, status communication, regulatory/legal notification, incident-review process, and evidence retention.

## Authentication or session failure

Symptoms include login loops, callbacks returning `auth_failed`, password-reset links failing, protected routes redirecting unexpectedly, or deleted users retaining access.

Check:

- Supabase availability and target project URL;
- that publishable key and URL belong to the same environment;
- allowed redirect origins and `/auth/callback`;
- cookies/session refresh through `src/proxy.ts`;
- whether the profile exists and `deleted_at` is null;
- callback path: PKCE `code`, OTP `token_hash`, or legacy hash tokens;
- browser/server timestamps and expired links.

Containment:

- avoid changing flow type or redirect configuration without a coordinated test;
- ask users to request a new link rather than forwarding tokens;
- revoke sessions if compromise is suspected;
- roll back a recent auth deployment if configuration is known good and the regression is application-side.

Recovery checks: email/password login, Google OAuth where configured, signup confirmation, reset flow, protected redirect, onboarding routing, logout, and deleted-profile denial.

## Database, RLS, or migration incident

Symptoms include empty lists, permission errors, admin operations failing, correction inbox errors, or data visible to the wrong user.

Check:

- provider status and connection health;
- recent migrations and resulting migration state;
- object existence, grants, and RLS enablement/policies;
- normal versus admin authenticated behavior;
- whether only the correction-report migrations exist in source while the target relies on unmanaged schema;
- database errors and slow/blocked statements.

If data is exposed, prioritize containment: restrict the affected route/role, revoke access, or disable the application according to incident authority. Do not disable RLS to restore functionality.

For migration failure, stop retries until partial commits are understood. Prefer a forward fix. Full restore can discard unrelated writes and requires explicit authority.

Recovery checks: auth/profile lookup, practice/physician reads, favorites, jobs, correction submission/admin review, and negative RLS tests.

## Stale or incorrect Atlas data

Symptoms include a practice detail differing from lists/favorites, an accepted correction not appearing, or clients seeing old bulk data.

The practices cache uses memory plus IndexedDB with a one-hour TTL. Large record sets are chunked above 1,500 records in chunks of 800. A fresh practice detail patches existing practice-list and favorites cache entries on that client only. Favorites also have a process-memory 30-minute TTL.

Check:

- authoritative database value;
- ingestion/source status (**Owner confirmation required**);
- list versus detail query;
- client cache age and IndexedDB write warnings;
- whether the correction was merely marked `fixed` without updating practice data.

Containment/recovery:

- correct the authoritative source through the approved process;
- verify detail and list behavior in a clean browser context;
- let TTL expire or instruct affected users to refresh/clear site data only when appropriate;
- do not classify a systemic source error as a browser-cache issue without evidence.

## Mapbox incident

Symptoms include a blank map, token/authorization errors, failed map asset requests, or degraded practice discovery.

Check browser network/console errors, `NEXT_PUBLIC_MAPBOX_TOKEN` presence by name (never print its value), token restrictions, allowed origins, vendor status, and recent dependency/deployment changes.

Contain by preserving non-map list/detail access if available. Rotate the token if exposed. Verify maps in supported browsers and environments after recovery.

**Owner confirmation required:** Mapbox account owner, quota alerts, allowed-origin policy, fallback UX, and vendor support.

## Anthropic or report-generation incident

Symptoms include report generation errors, invalid JSON, latency, unexpected cost, or suspected prompt/data exposure.

Check:

- server-only `ANTHROPIC_API_KEY` configuration without logging it;
- Anthropic status and returned HTTP status;
- input size and JSON parse errors;
- request volume and unexpected callers;
- recent model/API changes.

Critical current risk: `/api/generate-report` does not independently authenticate or authorize requests. If abuse is suspected, restrict/disable the endpoint, rotate the key if exposed, and inspect request/billing evidence available through approved systems.

Do not repeatedly resend sensitive prompts. Reports can be completed manually from verified data while the service is unavailable.

**Owner confirmation required:** permitted data, cost threshold, monitoring, vendor escalation, retention settings, and breach handling.

## Deployment regression

Symptoms begin after a release and affect multiple workflows.

1. Identify deployed commit, previous known-good build, migrations, and configuration-name changes.
2. Compare failures against smoke tests.
3. Determine whether the old application is compatible with current schema.
4. If compatible, redeploy the prior immutable build.
5. If not, coordinate a forward application/database fix.
6. Repeat auth, data, admin, Mapbox, and report smoke tests.

Do not reverse a database migration automatically when rolling back application code.

## Credential exposure

Potential credentials include Supabase configuration, Mapbox token, Anthropic key, auth links, and session cookies. Browser-visible publishable/token values are not equivalent to server secrets, but they still require restrictions and abuse review.

1. Do not paste the value into the incident record.
2. Identify credential type, environment, exposure location, and time window.
3. Remove public exposure while preserving controlled evidence.
4. Revoke/rotate according to provider procedure.
5. Update deployment configuration and redeploy if needed.
6. Invalidate sessions or links when applicable.
7. Review access, billing, and data exposure.
8. verify old credentials no longer work and the application does.

**Owner confirmation required:** rotation owners, provider procedures, log sources, notification duties, and secret-scanning controls.

## Correction/admin misuse

If an admin action is unauthorized or incorrect:

- suspend the account/session if authorized;
- preserve affected profile, lead, report, and timestamps;
- do not overwrite evidence with repeated UI actions;
- determine whether RLS or `is_admin` assignment failed;
- reverse through an approved, auditable correction;
- assess personal-data and client impact.

The repository contains no admin audit table, so provider logs and external records may be necessary.

## Closure criteria

Close only when impact has stopped, recovery checks pass, temporary controls are owned, affected data is reconciled, communication is complete, and follow-up has accountable owners.

**Owner confirmation required:** formal closure authority, post-incident review deadline, and action-tracking system.
