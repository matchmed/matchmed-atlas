# Pre-git schema baseline

The Atlas repository cannot bootstrap from an empty database.

Committed migrations begin after a local-only pre-git baseline, `20260701000000_local_atlas_bootstrap`. That baseline is not in this repository. Production already had the corresponding schema before the first committed migration.

Migration history must not be fabricated to conceal the gap. Do not insert, delete, or relabel a history row so the missing baseline looks like a committed production migration.

The future fix is a reviewed, sanitized, schema-only baseline artifact that local development and CI can restore before applying the repository migrations. That artifact must not be pushed as a new production migration.

CI should eventually prove that restoring the baseline, then applying every subsequent repository migration, succeeds. This document does not add that artifact.
