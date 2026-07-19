# Database migrations, backup, and recovery

## Safety statement

The repository is not a complete database bootstrap. It currently tracks only:

- `20260718190000_create_practice_error_reports.sql`
- `20260718193500_grant_practice_error_report_permissions.sql`

Application code also references `profiles`, `practices`, `doctors`, `affiliations`, `shortlists`, and `employer_leads`, but their authoritative DDL and most RLS policies are not present. A successful application build does not prove that a target database has a compatible schema.

**Owner confirmation required:** authoritative baseline schema source, production Supabase project inventory, and process for bringing all existing objects under migration control.

## Migration conventions

- Store migrations under `supabase/migrations/`.
- Use UTC timestamp prefixes in `YYYYMMDDHHMMSS_description.sql` form.
- Treat an applied migration as immutable. Corrections use a later migration.
- Make table schema explicit (`public` where appropriate), qualify ambiguous objects, and include required indexes, constraints, grants, and RLS changes.
- Keep migrations reviewable and narrowly scoped.
- Document destructive behavior, expected duration, lock risk, and application compatibility in the change review.
- Do not place credentials, production data, or personal data in migration files.

The correction-report migrations demonstrate a two-step pattern: create table/indexes/RLS policies, then grant `INSERT`, `SELECT`, and `UPDATE` to `authenticated`. Grants do not replace RLS; both must be reviewed.

## Change design

Before writing a migration:

1. Identify every deployed application version that may run while the migration is applied.
2. Prefer nullable columns, new tables, new indexes, and compatible policies.
3. For renames or removals, use expand/migrate/contract:
   - add the replacement;
   - deploy code capable of using it;
   - backfill and verify;
   - switch readers/writers;
   - remove the old object in a later release.
4. Review foreign-key delete behavior. For example, correction reports currently cascade when a practice is deleted, but do not cascade from the reporting profile.
5. Review RLS for every operation and role. Test positive and negative cases, not only table creation.
6. Plan data validation queries and a forward fix.

**Owner confirmation required:** required reviewers for schema, security, privacy, and data changes.

## Pre-production validation

Use an approved non-production database representative of production:

1. Establish the current migration state.
2. Confirm a recovery point exists according to the provider and organizational policy.
3. Apply pending migrations in timestamp order using the approved executor.
4. Verify objects, constraints, indexes, grants, triggers, and policies.
5. Test authenticated operations with normal and admin users.
6. Test anonymous access explicitly.
7. Run the application build and relevant workflows.
8. For backfills, compare before/after counts and sample records without copying sensitive values into tickets or logs.
9. Estimate runtime and lock impact using representative volume.

There is no migration test automation in this repository.

## Production execution

1. Record environment, operator, approver, source commit, pending migrations, and start time.
2. Reconfirm the application/database compatibility sequence.
3. Verify the recovery mechanism rather than assuming it is enabled.
4. Pause if the target migration state differs from the reviewed state.
5. Apply exactly the reviewed migration files.
6. Capture success/failure and resulting migration state.
7. Run the planned validation queries and application smoke tests.
8. Monitor database errors, latency, auth/RLS failures, and affected workflows.
9. Record completion and any follow-up.

Never bypass RLS or use emergency credentials merely to make a failing migration appear successful.

**Owner confirmation required:** production executor, privileged-access process, maintenance windows, and audit-record location.

## Failure and rollback

Stop and assess before retrying a partially failed migration. Determine which statements committed and whether the migration tool recorded completion.

- Prefer a new forward-fix migration.
- Do not delete or rewrite migration history after application.
- Do not drop newly created objects if the deployed application may already depend on them.
- Data reversal requires a reviewed inverse transformation and validation.
- A point-in-time restore affects the whole database and may discard unrelated writes; it is an incident-level decision.

Escalate immediately if a migration:

- weakens or disables RLS unexpectedly;
- exposes data to `anon` or the wrong authenticated users;
- corrupts, deletes, or duplicates data;
- blocks normal database traffic;
- creates application/schema incompatibility.

**Owner confirmation required:** rollback authority and criteria for forward fix versus restore.

## Backup policy

No backup schedule, retention, point-in-time recovery entitlement, cross-region copy, or restore-test evidence is represented in the repository. Do not state that backups are enabled until checked in the authoritative provider/account.

The accountable owner must document:

- backup mechanism and scope;
- schedule and retention;
- encryption and access controls;
- point-in-time recovery window;
- off-provider or cross-region requirements;
- alerting for backup failures;
- restore-test cadence and evidence;
- recovery point objective (RPO) and recovery time objective (RTO).

All are **Owner confirmation required**.

## Recovery procedure

For suspected loss or corruption:

1. Open an incident record and preserve timestamps.
2. Stop or limit writes only if authorized and necessary to prevent further damage.
3. Define affected tables, users, and time range.
4. Identify the last verified good recovery point.
5. Decide between record-level repair, forward migration, or full restore.
6. Restore into an isolated environment first whenever possible.
7. Validate schema, row counts, referential integrity, RLS, auth behavior, and representative application workflows.
8. Obtain approval before replacing or promoting production data.
9. Reconcile writes that occurred after the recovery point.
10. Rotate credentials if compromise may have contributed.
11. Document actual data loss and recovery duration.

Never download production backups to unmanaged workstations or paste sensitive rows into collaboration tools.

## Restore validation checklist

- Expected migration history is present.
- Required tables and relationships exist.
- RLS is enabled where intended and policies enforce normal/admin boundaries.
- Authentication and profile lookup work.
- Practice, physician, favorites, jobs, and correction-report paths work.
- Admin operations remain admin-only.
- Counts and sampled records match the selected recovery point.
- Application and database errors return to expected levels.

## Unresolved ownership

**Owner confirmation required:** baseline schema, migration executor, backup policy, restore testing, emergency access, RPO/RTO, incident authority, and evidence retention.
