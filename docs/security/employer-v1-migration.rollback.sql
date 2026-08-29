-- Rollback for supabase/migrations/20260829000000_employer_v1_schema.sql
-- Run only after explicit approval. Reverse dependency order.

-- Policies (employer_roster_assertions)
DROP POLICY IF EXISTS employer_roster_assertions_update ON public.employer_roster_assertions;
DROP POLICY IF EXISTS employer_roster_assertions_insert ON public.employer_roster_assertions;
DROP POLICY IF EXISTS employer_roster_assertions_select ON public.employer_roster_assertions;

-- Policies (employer_practice_locations)
DROP POLICY IF EXISTS employer_practice_locations_update ON public.employer_practice_locations;
DROP POLICY IF EXISTS employer_practice_locations_insert ON public.employer_practice_locations;
DROP POLICY IF EXISTS employer_practice_locations_select ON public.employer_practice_locations;

-- Policies (employer_practice_profiles)
DROP POLICY IF EXISTS employer_practice_profiles_update ON public.employer_practice_profiles;
DROP POLICY IF EXISTS employer_practice_profiles_insert ON public.employer_practice_profiles;
DROP POLICY IF EXISTS employer_practice_profiles_select ON public.employer_practice_profiles;

-- Policies (practice_claims)
DROP POLICY IF EXISTS practice_claims_update_admin ON public.practice_claims;
DROP POLICY IF EXISTS practice_claims_insert_submitter ON public.practice_claims;
DROP POLICY IF EXISTS practice_claims_select ON public.practice_claims;

-- Policies (employer_organization_practices)
DROP POLICY IF EXISTS employer_organization_practices_update_admin ON public.employer_organization_practices;
DROP POLICY IF EXISTS employer_organization_practices_insert_admin ON public.employer_organization_practices;
DROP POLICY IF EXISTS employer_organization_practices_select ON public.employer_organization_practices;

-- Policies (organization_memberships)
DROP POLICY IF EXISTS organization_memberships_accept_invite ON public.organization_memberships;
DROP POLICY IF EXISTS organization_memberships_update_admin ON public.organization_memberships;
DROP POLICY IF EXISTS organization_memberships_insert_admin ON public.organization_memberships;
DROP POLICY IF EXISTS organization_memberships_select ON public.organization_memberships;

-- Policies (employer_organizations)
DROP POLICY IF EXISTS employer_organizations_update_admin ON public.employer_organizations;
DROP POLICY IF EXISTS employer_organizations_insert_admin ON public.employer_organizations;
DROP POLICY IF EXISTS employer_organizations_select_member ON public.employer_organizations;

-- Trigger + membership safeguard
DROP TRIGGER IF EXISTS organization_memberships_enforce_role_change ON public.organization_memberships;
DROP FUNCTION IF EXISTS public.enforce_organization_membership_role_change();

-- Admin DEFINER workflow functions
DROP FUNCTION IF EXISTS public.deactivate_organization_practice_link(uuid, text);
DROP FUNCTION IF EXISTS public.revoke_organization_membership(uuid, text);
DROP FUNCTION IF EXISTS public.approve_practice_access_request(uuid, text);
DROP FUNCTION IF EXISTS public.approve_practice_initial_claim(uuid);
DROP FUNCTION IF EXISTS public.revoke_practice_claim(uuid, text);
DROP FUNCTION IF EXISTS public.reject_practice_claim(uuid, text);
DROP FUNCTION IF EXISTS public.verify_claimant_work_email_manual(uuid);

-- Authorization helpers
DROP FUNCTION IF EXISTS public.employer_overlay_publicly_visible(uuid);
DROP FUNCTION IF EXISTS public.can_edit_practice(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_admin_organization(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_access_organization(uuid, uuid);
DROP FUNCTION IF EXISTS public._organization_descendant_ids(uuid);

-- Internal helpers
DROP FUNCTION IF EXISTS public._employer_slugify(text);
DROP FUNCTION IF EXISTS public._employer_active_operates_link_exists(uuid);

-- Tables (reverse FK order)
DROP TABLE IF EXISTS public.employer_roster_assertions;
DROP TABLE IF EXISTS public.employer_practice_locations;
DROP TABLE IF EXISTS public.employer_practice_profiles;
DROP TABLE IF EXISTS public.practice_claims;
DROP TABLE IF EXISTS public.employer_organization_practices;
DROP TABLE IF EXISTS public.organization_memberships;
DROP TABLE IF EXISTS public.employer_organizations;
