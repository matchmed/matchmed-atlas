# Admin and data-corrections runbook

## Scope and authorization

The admin interface supports:

- viewing active profiles;
- toggling `npi_verified`;
- sending a Supabase magic link;
- soft-deleting a profile by setting `deleted_at`;
- linking an unlinked `employer_leads` row to a practice;
- reviewing practice error reports and updating status, notes, and resolution time;
- building AI-assisted market reports.

`/admin` is protected by a server layout that requires a current Supabase user and a profile with `is_admin = true`. The browser also performs checks, but browser checks are not an authorization boundary. Database RLS remains required for browser-direct mutations.

**Owner confirmation required:** who qualifies as an admin, approval/provisioning/revocation process, periodic access review, and emergency access.

## General operating rules

1. Use a named individual account; never share credentials.
2. Confirm the target record using multiple identifiers before changing it.
3. Record evidence, action, operator, timestamp, and outcome in the approved audit location.
4. Do not put unnecessary personal or confidential information in `admin_notes`.
5. Treat success messages cautiously: several current admin mutations do not surface Supabase errors. Reload and verify the stored value.
6. If RLS blocks an action, do not bypass it. Escalate the policy mismatch.
7. Avoid simultaneous edits to the same report or profile; the UI has no conflict detection.

**Owner confirmation required:** audit-log system, evidence retention, dual-control requirements, support contacts, and response SLAs.

## NPI verification

Current behavior toggles the profile’s `npi_verified` boolean; it does not store verifier, source, or verification timestamp.

Procedure:

1. Search by name, email, or NPI in `/admin`.
2. Match the profile to an authoritative source.
3. Verify that the NPI belongs to the individual and that identity details are consistent.
4. Click **Verify NPI** only when the evidence standard is met.
5. Reload and confirm the badge and database state.
6. Record the evidence source outside free-form fields if the source contains sensitive information.

Use **Unverify** when prior verification is shown to be wrong, then record why and escalate if access or downstream decisions depended on it.

**Owner confirmation required:** authoritative NPI source, matching rules, acceptable discrepancies, re-verification cadence, and whether dual review is required.

## Sending a magic link

The admin UI calls `signInWithOtp` for the profile email with `shouldCreateUser: true` and redirects to `/auth/callback`. This can create an auth user for an email that does not already exist.

Before sending:

1. Confirm the requester’s identity using the approved support process.
2. Confirm the displayed email belongs to the intended profile.
3. Check that creating a user is appropriate; do not use this as an informal invitation mechanism without policy approval.
4. Send once and tell the user to use only the newest message.
5. Do not ask the user to forward the link or token.

If delivery fails, verify redirect configuration and Supabase Auth email delivery. Do not paste magic-link URLs into tickets.

**Owner confirmation required:** identity-verification standard, invite policy, rate limits, approved fallback, and whether `shouldCreateUser` is intended.

## Profile deletion and restoration

User and admin deletion currently set `profiles.deleted_at` and sign out the current user where applicable. The auth identity and related records are not deleted by this code. The proxy rejects protected-route access for profiles with `deleted_at`.

The account page promises restoration within 30 days, but no restoration UI, purge job, or repository-backed policy is present. Treat that promise as unverified operationally.

For admin deletion:

1. Confirm identity and target profile.
2. Confirm the request or policy basis.
3. Note related records that may require separate handling.
4. Use **Delete**, confirm, then verify `deleted_at`.
5. Record the action and communicate using approved wording.

Do not restore by clearing `deleted_at` until authorization, related-data state, and legal/privacy requirements are confirmed.

**Owner confirmation required:** restoration procedure, 30-day promise, final deletion/purge procedure, related-record handling, legal holds, and user communication.

## Linking job posts

The **Link Job Posts** tab shows `employer_leads` where `practice_id` is null and permits one-way assignment to a selected practice.

1. Compare listing name, location, and point of contact.
2. Search by practice name and city.
3. Open the candidate practice in a separate view when names are ambiguous.
4. Select only after matching stable identifiers or sufficient evidence.
5. Reload and verify the lead no longer appears as unlinked and is shown on the intended practice.

There is no unlink/correction control in the current UI. A wrong link requires an approved database correction.

**Owner confirmation required:** matching threshold, source of truth, duplicate handling, and approved unlink procedure.

## Practice error reports

Authenticated users can submit one of `practice_name`, `address`, `phone`, `website`, or `other`, a 1–1000 character description, and a snapshot of displayed practice values. Tracked statuses are:

- `new`: submitted and not yet triaged;
- `reviewing`: investigation underway;
- `fixed`: operator marked resolved;
- `rejected`: operator marked not actionable.

The UI sets `resolved_at` when status changes to `fixed` or `rejected`, and clears it when moving from those states to an unresolved state.

### Triage

1. Open `/admin/reports`; filter by status or field.
2. Compare the report-time snapshot to current values.
3. Check whether another report covers the same issue.
4. Move to `reviewing` and add concise notes describing the validation plan.
5. Verify against the approved authoritative source.
6. Make the correction through the authoritative ingestion or approved database process. The inbox itself does not edit practice data.
7. Reload the practice and verify the displayed current value.
8. Account for the one-hour practice-list IndexedDB cache; a detail load patches cached list/favorites data, but other clients may remain stale until expiration or refresh.
9. Apply the owner-approved status definition. If no approved definition exists, leave the report in `reviewing` and escalate rather than inventing a resolution standard.

### Meaning of “fixed”

The code only records a status; it does not enforce publication, reporter notification, or source correction. This runbook cannot define “fixed” from code evidence. An accountable product/data owner must approve whether it means a source correction, a database correction, visible publication, reporter notification, or some combination.

**Owner confirmation required:** authoritative sources by field, definition of fixed, reporter notification, correction SLA, escalation, source-system propagation, and duplicate handling.

## Failed mutations

If an action appears successful but the value is unchanged:

- reload the page and inspect the current stored state;
- capture the operation, table, time, and non-sensitive error message;
- check session/admin status and relevant RLS policy;
- do not repeatedly submit a non-idempotent action;
- escalate schema/RLS gaps, especially because most production policies are absent from this repository.

## Known control gaps

- Admin actions are browser-direct Supabase mutations and rely on production RLS not represented here.
- Profile and job actions do not consistently handle returned errors.
- No repository-backed admin audit log exists.
- NPI verification stores no provenance.
- Soft deletion has no documented restoration or purge implementation.
- Correction status does not update practice data or notify reporters.
- **Owner confirmation required:** all policy, SLA, evidence, communication, and escalation details above.
