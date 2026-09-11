# Connect uses shared contact consent

Status: owner-approved; production applied 2026-09-10; legacy column dropped 2026-09-10.

`profiles.data_sharing` is the single user-controlled consent for:

- industry / professional opportunity outreach
- anonymous employer/practice discovery
- practice-initiated Connect requests

`industry_partnership_acknowledged` remains a separate required onboarding acknowledgement and does not itself gate Connect.

`open_to_practice_connections` was retired from application logic and then dropped from `profiles`. Historical migrations that added or temporarily aliased it remain unchanged.

Physician-initiated Connect remains allowed when `data_sharing` is false. Identity/contact unlocking still requires mutual acceptance. Opting out does not auto-terminate existing Connect relationships.

Rollback after column drop requires restoring the column definition from `20260909010000_connect_v1.sql` plus prior Connect JSON helpers if needed. Prefer restoring from backups rather than reintroducing a dual-consent model.
