# Connect uses shared contact consent

Status: owner-approved, 2026-09-09; production rollout 2026-09-10.

`profiles.data_sharing` is the single user-controlled consent for:

- industry / professional opportunity outreach
- anonymous employer/practice discovery
- practice-initiated Connect requests

`industry_partnership_acknowledged` remains a separate required onboarding acknowledgement and does not itself gate Connect.

`open_to_practice_connections` is retired from application and RPC logic. The physical column remains for rollback safety and is not synchronized.

Physician-initiated Connect remains allowed when `data_sharing` is false (explicit one-off affirmative action). Identity/contact unlocking still requires mutual acceptance. Opting out does not auto-terminate existing Connect relationships.

Migration `20260909110000_connect_data_sharing_consent.sql` replaces Connect discovery / practice-initiate / JSON helpers to read `data_sharing`. No profile-value backfill (owner already aligned values). Legacy JSON key `open_to_practice_connections` is retained as an alias of `data_sharing` for existing employer clients.

Rollback: restore prior Connect function definitions from `20260909010000_connect_v1.sql` and redeploy Account UI with the separate Practice Connect toggle if needed. Do not treat the legacy column as current consent.
