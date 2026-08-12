# Jobs publication — simplified decision (2026-08-03)

## Decision

Public practice/physician search is the primary launch objective. **Jobs must not delay that launch.**

- Add `employer_leads.is_published boolean NOT NULL DEFAULT false`.
- **Publish zero** physician-facing jobs for now.
- **Do not** manually review or selectively publish the existing ~43 leads.
- Physician RPCs (`list_physician_jobs*`, `count_physician_jobs`) filter `is_published IS TRUE` only → empty lists until a future publish wave.
- `/jobs` UI remains available and will show empty / no matches until rows are published later.

## Migration

`supabase/migrations/20260803010000_employer_leads_is_published.sql`

Apply in the Supabase SQL Editor (or approved migration path). This environment cannot run DDL against production with the publishable key alone.

## Explicitly deferred

- Inventory-driven publish choices
- Admin UI toggle for `is_published`
- Stage B employer_leads RLS (still sequenced after jobs RPCs + app when ready)

## Rollback

`docs/security/employer-leads-is-published.rollback.sql`
