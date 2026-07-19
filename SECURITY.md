# Security policy

This document records security facts and minimum engineering expectations visible in the MatchMed Atlas repository. It does not establish unapproved response times, legal obligations, or an incident-response organization.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data, an exploit, or enough detail to reproduce a vulnerability against a live system.

## Owner confirmation required: disclosure channel

The repository does not identify a private security-reporting address or portal. The repository owner must publish:

- a monitored private reporting channel;
- expected acknowledgement and update times;
- an emergency incident contact and backup;
- supported versions/environments and disclosure coordination rules;
- severity definitions, bounty terms (if any), and applicable compliance obligations.

Until that channel is established, contributors should privately contact the known repository owner without transmitting credential values. This is a temporary gap, not a formal disclosure process.

## Verified security architecture

### Authentication and route access

`src/proxy.ts` creates a server-side Supabase client, refreshes auth cookies, calls `auth.getUser()`, and redirects unauthenticated requests to `/login` unless the path is login, signup, forgot-password, Terms, Privacy, or `/auth/*`. It also signs out users whose `profiles.deleted_at` is set.

Admin pages have an additional server-layout check in `src/app/admin/layout.tsx`: the user must exist and the corresponding profile must have `is_admin` set. Client-side hiding is not treated as authorization.

These controls do not prove database authorization. Most application reads and writes are made directly from the browser using a Supabase publishable key. Every exposed table, view, function, and storage bucket must therefore enforce its own intended access in Supabase RLS/grants.

### Database policy evidence

The only policy set represented by migrations is for `practice_error_reports`:

- authenticated users can insert a report only when `reported_by` belongs to their own auth identity;
- authenticated admins can select and update reports;
- valid fields, statuses, and description length are constrained in DDL.

See `supabase/migrations/20260718190000_create_practice_error_reports.sql` and the companion grant migration. The repository is not an authoritative inventory for policies on profiles, practices, physicians, favorites, jobs, or related data.

### External services and credentials

The supported environment-variable names are in `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `ANTHROPIC_API_KEY`

The three `NEXT_PUBLIC_` variables are browser-visible by design. They must be scoped as public/publishable tokens and must not be treated as secrets. Never put a Supabase service-role key, unrestricted vendor key, password, private key, or other privileged credential in a `NEXT_PUBLIC_` variable.

`ANTHROPIC_API_KEY` is read only by `src/app/api/generate-report/route.ts`. It must remain server-only and must not be logged, returned in errors, embedded in source, or exposed to the browser.

### Known boundary requiring remediation

`POST /api/generate-report` accepts a prompt and calls Anthropic, but the route handler itself does not verify a user or admin role. The admin UI is protected by its layout, but direct requests to an API route are not protected by that UI layout. Treat this as an authorization and cost-abuse risk; add server-side authentication, admin authorization, input limits, and appropriate rate controls before relying on the endpoint boundary.

The route also returns upstream error details. Review whether those responses can expose vendor or request metadata before production use.

## Credential handling

- Keep local values in `.env.local`; it is not documentation.
- Commit variable names only through `.env.example`.
- Use separate, least-privileged credentials for each environment.
- Do not paste credentials into issues, pull requests, screenshots, logs, test fixtures, documentation, or AI prompts.
- If a credential may have been exposed, stop using it, rotate/revoke it through the owning provider, and notify the designated security owner. Removing it from Git history does not make the old credential safe.
- Do not use production personal data for routine local testing.

No rotation cadence, credential custodian, secret manager, or break-glass procedure is defined in this repository.

## Secure change checklist

For changes involving auth, data access, admin features, or external APIs:

1. Identify the caller, resource, action, and ownership rule.
2. Enforce authorization on the server or in database RLS, not only in React.
3. Add or review migrations for grants, constraints, and RLS together.
4. Test unauthenticated, ordinary authenticated, cross-user, deleted-user, and admin cases.
5. Confirm browser bundles and network responses contain no server-only values.
6. Minimize personal or proprietary data sent to Mapbox, Anthropic, logs, and error responses.
7. Run `npm run build` and `npm run lint`, documenting known baseline failures rather than hiding them.
8. Arrange focused review for changes to `src/proxy.ts`, `src/lib/supabase*.ts`, `src/app/admin/`, `src/app/api/`, account deletion, or migrations.

## Incident handling

The repository does not define monitoring, containment authority, evidence preservation, user notification, vendor escalation, recovery objectives, or post-incident review. Do not invent these during an event. A designated owner should establish an incident process before production reliance.

When a suspected event is found, preserve relevant timestamps and non-secret evidence, avoid destructive investigation, limit further exposure when authorized, and escalate through the approved private channel.

## Owner confirmation required

- Private vulnerability-reporting and incident channels
- Response service levels and severity taxonomy
- Supported versions and environments
- Security owner, database-policy owner, and vendor credential custodians
- Complete production RLS/grant audit and admin-role lifecycle
- Logging/monitoring systems, retention, and personal-data redaction
- Credential storage, rotation, and emergency revocation process
- External security, privacy, contractual, or regulatory requirements
