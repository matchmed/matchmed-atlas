# MAT-26 follow-up: privileged direct publication RPC

The shipped Atlas admin UI loads a publication candidate and resolves DNS before it calls `admin_publish_content` or `admin_publish_brief`. Ordinary users, physicians, and employers cannot call those functions. `_require_sponsor_admin()` rejects them.

An authenticated Atlas administrator can still call those SQL functions through the Supabase API and skip DNS resolution. Publication URLs are browser destinations. The application does not fetch them. Publication-time DNS does not stop a later DNS change.

This pass does not change those grants. A later change can remove direct execution while keeping the audit actor as `auth.uid()` of the signed-in administrator, then rerun the full sponsor publication rehearsal.
