-- Employer V1 schema: organizations, memberships, claims, Layer 3 employer data.
-- Prerequisites: public.is_atlas_admin(), public.practices, public.practice_locations,
-- public.doctors, public.affiliations.
-- Do not modify canonical Atlas workforce tables or production public.organizations.

-- =============================================================================
-- 1. Tables
-- =============================================================================

CREATE TABLE public.employer_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  parent_organization_id uuid NULL REFERENCES public.employer_organizations(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'archived')),
  verified_at timestamptz NULL,
  verified_by uuid NULL REFERENCES auth.users(id),
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_organizations_slug_unique UNIQUE (slug)
);

CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.employer_organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor')),
  scope text NOT NULL DEFAULT 'organization_only'
    CHECK (scope IN ('organization_only', 'organization_and_descendants')),
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by uuid NULL REFERENCES auth.users(id),
  invited_at timestamptz NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employer_organization_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.employer_organizations(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  relationship text NOT NULL DEFAULT 'operates'
    CHECK (relationship = 'operates'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  inactive_at timestamptz NULL,
  inactive_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.practice_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  claim_type text NOT NULL CHECK (claim_type IN ('initial_claim', 'access_request')),
  status text NOT NULL DEFAULT 'pending_email_verification'
    CHECK (status IN (
      'pending_email_verification',
      'pending_review',
      'approved',
      'rejected',
      'revoked'
    )),
  claimant_name text NOT NULL,
  claimant_title text NOT NULL,
  claimant_work_email text NOT NULL,
  claimant_work_email_verified_at timestamptz NULL,
  claimant_work_email_verification_method text NULL
    CHECK (
      claimant_work_email_verification_method IS NULL
      OR claimant_work_email_verification_method IN ('email_otp', 'manual_admin')
    ),
  claimant_phone text NULL,
  authority_attestation boolean NOT NULL,
  attestation_text_version text NOT NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NULL,
  review_notes text NULL,
  rejection_reason text NULL,
  approved_organization_id uuid NULL REFERENCES public.employer_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_claims_authority_attested CHECK (authority_attestation IS TRUE)
);

CREATE TABLE public.employer_practice_profiles (
  practice_id uuid PRIMARY KEY REFERENCES public.practices(id),
  website text NULL,
  primary_phone text NULL,
  recruiting_email text NULL,
  recruiting_phone text NULL,
  careers_url text NULL,
  overview text NULL,
  logo_storage_path text NULL,
  roster_last_reviewed_at timestamptz NULL,
  roster_last_reviewed_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id),
  CONSTRAINT employer_practice_profiles_overview_len
    CHECK (overview IS NULL OR char_length(overview) <= 500)
);

CREATE TABLE public.employer_practice_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  source_location_id uuid NULL REFERENCES public.practice_locations(id),
  status text NOT NULL CHECK (status IN ('active', 'closed', 'billing_only')),
  address text NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text NULL,
  phone text NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id),
  CONSTRAINT employer_practice_locations_new_row_address
    CHECK (source_location_id IS NOT NULL OR address IS NOT NULL)
);

CREATE TABLE public.employer_roster_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  affiliation_id uuid NULL REFERENCES public.affiliations(id),
  assertion text NOT NULL CHECK (assertion IN (
    'confirm_current',
    'report_departed',
    'billing_only',
    'incorrect_association',
    'affiliated_elsewhere_in_org',
    'report_still_affiliated',
    'confirm_former',
    'other'
  )),
  effective_year smallint NULL,
  effective_month smallint NULL
    CHECK (effective_month IS NULL OR effective_month BETWEEN 1 AND 12),
  comment text NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  supersedes_id uuid NULL REFERENCES public.employer_roster_assertions(id),
  asserted_by uuid NOT NULL REFERENCES auth.users(id),
  asserted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_roster_assertions_comment_len
    CHECK (comment IS NULL OR char_length(comment) <= 280)
);

-- =============================================================================
-- 2. Indexes and partial uniques
-- =============================================================================

CREATE INDEX employer_organizations_parent_id_idx
  ON public.employer_organizations (parent_organization_id);

CREATE INDEX employer_organizations_active_status_idx
  ON public.employer_organizations (status)
  WHERE status <> 'archived';

CREATE UNIQUE INDEX organization_memberships_one_active_per_user_org
  ON public.organization_memberships (organization_id, user_id)
  WHERE status = 'active';

CREATE INDEX organization_memberships_user_active_idx
  ON public.organization_memberships (user_id)
  WHERE status = 'active';

CREATE INDEX organization_memberships_org_active_idx
  ON public.organization_memberships (organization_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX employer_organization_practices_one_active_operates
  ON public.employer_organization_practices (practice_id)
  WHERE status = 'active' AND relationship = 'operates';

CREATE INDEX employer_organization_practices_org_active_idx
  ON public.employer_organization_practices (organization_id)
  WHERE status = 'active';

CREATE INDEX employer_organization_practices_practice_id_idx
  ON public.employer_organization_practices (practice_id);

CREATE UNIQUE INDEX practice_claims_one_pending_per_user_practice
  ON public.practice_claims (practice_id, submitted_by)
  WHERE status IN ('pending_email_verification', 'pending_review');
-- Allows multiple different users to hold pending access_requests on one claimed practice.

CREATE UNIQUE INDEX practice_claims_one_pending_initial_per_practice
  ON public.practice_claims (practice_id)
  WHERE claim_type = 'initial_claim'
    AND status IN ('pending_email_verification', 'pending_review');
-- Enforces at most one pending initial_claim per practice (any submitter).

CREATE INDEX practice_claims_pending_review_idx
  ON public.practice_claims (status, created_at DESC)
  WHERE status = 'pending_review';

CREATE INDEX practice_claims_practice_id_idx
  ON public.practice_claims (practice_id);

CREATE INDEX practice_claims_submitted_by_idx
  ON public.practice_claims (submitted_by);

CREATE UNIQUE INDEX employer_practice_locations_source_unique
  ON public.employer_practice_locations (practice_id, source_location_id)
  WHERE source_location_id IS NOT NULL;

CREATE INDEX employer_practice_locations_practice_id_idx
  ON public.employer_practice_locations (practice_id);

CREATE UNIQUE INDEX employer_roster_assertions_one_active_per_doctor
  ON public.employer_roster_assertions (practice_id, doctor_id)
  WHERE status = 'active';

CREATE INDEX employer_roster_assertions_practice_active_idx
  ON public.employer_roster_assertions (practice_id)
  WHERE status = 'active';

-- =============================================================================
-- 3. Internal helpers (private — no EXECUTE grant)
-- =============================================================================

CREATE OR REPLACE FUNCTION public._employer_active_operates_link_exists(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employer_organization_practices AS l
    WHERE l.practice_id = p_practice_id
      AND l.status = 'active'
      AND l.relationship = 'operates'
  );
$$;

REVOKE ALL ON FUNCTION public._employer_active_operates_link_exists(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._employer_slugify(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT trim(both '-' FROM lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
$$;

REVOKE ALL ON FUNCTION public._employer_slugify(text) FROM PUBLIC;

-- =============================================================================
-- 4. Authorization helper functions (SECURITY DEFINER)
-- =============================================================================

CREATE OR REPLACE FUNCTION public._organization_descendant_ids(p_root_org_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE descendants AS (
    SELECT o.id
    FROM public.employer_organizations AS o
    WHERE o.parent_organization_id = p_root_org_id
      AND o.status <> 'archived'
    UNION ALL
    SELECT o.id
    FROM public.employer_organizations AS o
    INNER JOIN descendants AS d ON o.parent_organization_id = d.id
    WHERE o.status <> 'archived'
  )
  SELECT descendants.id FROM descendants;
$$;

REVOKE ALL ON FUNCTION public._organization_descendant_ids(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.can_access_organization(
  p_user_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_org_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT public.is_atlas_admin() THEN false
    WHEN public.is_atlas_admin() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.organization_memberships AS m
      WHERE m.user_id = p_user_id
        AND m.status = 'active'
        AND (
          m.organization_id = p_org_id
          OR (
            m.scope = 'organization_and_descendants'
            AND p_org_id IN (SELECT public._organization_descendant_ids(m.organization_id))
          )
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_admin_organization(
  p_user_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_org_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT public.is_atlas_admin() THEN false
    WHEN public.is_atlas_admin() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.organization_memberships AS m
      WHERE m.user_id = p_user_id
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND (
          m.organization_id = p_org_id
          OR (
            m.scope = 'organization_and_descendants'
            AND p_org_id IN (SELECT public._organization_descendant_ids(m.organization_id))
          )
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_practice(
  p_user_id uuid,
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_practice_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT public.is_atlas_admin() THEN false
    WHEN public.is_atlas_admin() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.employer_organization_practices AS l
      INNER JOIN public.organization_memberships AS m
        ON m.organization_id = l.organization_id
      WHERE l.practice_id = p_practice_id
        AND l.status = 'active'
        AND l.relationship = 'operates'
        AND m.user_id = p_user_id
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'editor')
        AND (
          m.organization_id = l.organization_id
          OR (
            m.scope = 'organization_and_descendants'
            AND l.organization_id IN (SELECT public._organization_descendant_ids(m.organization_id))
          )
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.employer_overlay_publicly_visible(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employer_organization_practices AS l
    INNER JOIN public.employer_organizations AS o
      ON o.id = l.organization_id
    WHERE l.practice_id = p_practice_id
      AND l.status = 'active'
      AND l.relationship = 'operates'
      AND o.status = 'verified'
      AND o.archived_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_memberships AS m
        WHERE m.organization_id = l.organization_id
          AND m.status = 'active'
          AND m.role IN ('owner', 'admin', 'editor')
      )
  );
$$;

-- =============================================================================
-- 5. Membership safeguards (trigger)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_organization_membership_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'invited'
     AND NEW.status = 'active'
     AND NEW.user_id = (SELECT auth.uid())
     AND NOT public.is_atlas_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.scope IS DISTINCT FROM OLD.scope THEN
      RAISE EXCEPTION 'cannot change role or scope when accepting invite' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.user_id = (SELECT auth.uid()) AND NOT public.is_atlas_admin() THEN
      RAISE EXCEPTION 'cannot change own role' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_admin_organization((SELECT auth.uid()), NEW.organization_id)
       AND NOT public.is_atlas_admin() THEN
      RAISE EXCEPTION 'not authorized to change membership role' USING ERRCODE = '42501';
    END IF;
    IF NEW.role = 'owner'
       AND NOT public.is_atlas_admin()
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_memberships AS om
         WHERE om.organization_id = NEW.organization_id
           AND om.user_id = (SELECT auth.uid())
           AND om.status = 'active'
           AND om.role = 'owner'
       ) THEN
      RAISE EXCEPTION 'only an owner may assign owner role' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_memberships_enforce_role_change
  BEFORE UPDATE OF role ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_organization_membership_role_change();

-- =============================================================================
-- 6. MatchMed admin DEFINER workflow functions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.verify_claimant_work_email_manual(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.practice_claims%ROWTYPE;
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_claim
  FROM public.practice_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status NOT IN ('pending_email_verification', 'pending_review') THEN
    RAISE EXCEPTION 'claim not awaiting email verification' USING ERRCODE = '22023';
  END IF;

  UPDATE public.practice_claims
  SET
    claimant_work_email_verified_at = now(),
    claimant_work_email_verification_method = 'manual_admin',
    status = 'pending_review',
    updated_at = now()
  WHERE id = p_claim_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_practice_claim(
  p_claim_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.practice_claims
  SET
    status = 'rejected',
    rejection_reason = NULLIF(btrim(p_reason), ''),
    reviewed_by = (SELECT auth.uid()),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_claim_id
    AND status IN ('pending_email_verification', 'pending_review');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim not found or not rejectable' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_practice_claim(
  p_claim_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.practice_claims
  SET
    status = 'revoked',
    review_notes = COALESCE(NULLIF(btrim(p_notes), ''), review_notes),
    reviewed_by = (SELECT auth.uid()),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_claim_id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approved claim not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_practice_initial_claim(p_claim_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.practice_claims%ROWTYPE;
  v_practice_name text;
  v_org_id uuid;
  v_slug text;
  v_slug_base text;
  v_suffix int := 0;
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_claim
  FROM public.practice_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.claim_type <> 'initial_claim' THEN
    RAISE EXCEPTION 'not an initial claim' USING ERRCODE = '22023';
  END IF;

  IF v_claim.status <> 'pending_review' THEN
    RAISE EXCEPTION 'claim not pending review' USING ERRCODE = '22023';
  END IF;

  IF v_claim.claimant_work_email_verified_at IS NULL THEN
    RAISE EXCEPTION 'claimant work email not verified' USING ERRCODE = '22023';
  END IF;

  IF public._employer_active_operates_link_exists(v_claim.practice_id) THEN
    RAISE EXCEPTION 'practice already has an active operates link' USING ERRCODE = '23505';
  END IF;

  SELECT p.practice_name INTO v_practice_name
  FROM public.practices AS p
  WHERE p.id = v_claim.practice_id;

  v_slug_base := public._employer_slugify(COALESCE(v_practice_name, 'practice'));
  IF v_slug_base = '' THEN
    v_slug_base := 'practice';
  END IF;
  v_slug := v_slug_base;

  WHILE EXISTS (SELECT 1 FROM public.employer_organizations AS o WHERE o.slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_slug_base || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.employer_organizations (
    name, slug, status, verified_at, verified_by
  ) VALUES (
    COALESCE(v_practice_name, 'Practice'),
    v_slug,
    'verified',
    now(),
    (SELECT auth.uid())
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.employer_organization_practices (
    organization_id, practice_id, approved_by
  ) VALUES (
    v_org_id, v_claim.practice_id, (SELECT auth.uid())
  );

  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, scope, status, invited_by, invited_at, accepted_at
  ) VALUES (
    v_org_id,
    v_claim.submitted_by,
    'owner',
    'organization_only',
    'active',
    (SELECT auth.uid()),
    now(),
    now()
  );

  INSERT INTO public.employer_practice_profiles (practice_id)
  VALUES (v_claim.practice_id)
  ON CONFLICT (practice_id) DO NOTHING;

  UPDATE public.practice_claims
  SET
    status = 'approved',
    approved_organization_id = v_org_id,
    reviewed_by = (SELECT auth.uid()),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_claim_id;

  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_practice_access_request(
  p_claim_id uuid,
  p_role text DEFAULT 'editor'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.practice_claims%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'invalid membership role for access request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_claim
  FROM public.practice_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.claim_type <> 'access_request' THEN
    RAISE EXCEPTION 'not an access request' USING ERRCODE = '22023';
  END IF;

  IF v_claim.status <> 'pending_review' THEN
    RAISE EXCEPTION 'claim not pending review' USING ERRCODE = '22023';
  END IF;

  IF v_claim.claimant_work_email_verified_at IS NULL THEN
    RAISE EXCEPTION 'claimant work email not verified' USING ERRCODE = '22023';
  END IF;

  SELECT l.organization_id INTO v_org_id
  FROM public.employer_organization_practices AS l
  WHERE l.practice_id = v_claim.practice_id
    AND l.status = 'active'
    AND l.relationship = 'operates'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'no active operates link for practice' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, scope, status, invited_by, invited_at, accepted_at
  ) VALUES (
    v_org_id,
    v_claim.submitted_by,
    p_role,
    'organization_only',
    'active',
    (SELECT auth.uid()),
    now(),
    now()
  );

  UPDATE public.practice_claims
  SET
    status = 'approved',
    approved_organization_id = v_org_id,
    reviewed_by = (SELECT auth.uid()),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_claim_id;

  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_organization_membership(
  p_membership_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.organization_memberships
  SET
    status = 'revoked',
    revoked_at = now(),
    revoked_by = (SELECT auth.uid())
  WHERE id = p_membership_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active membership not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_organization_practice_link(
  p_link_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employer_organization_practices
  SET
    status = 'inactive',
    inactive_at = now(),
    inactive_reason = NULLIF(btrim(p_reason), '')
  WHERE id = p_link_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active practice link not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- =============================================================================
-- 7. Row level security
-- =============================================================================

ALTER TABLE public.employer_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_organization_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_practice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_practice_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_roster_assertions ENABLE ROW LEVEL SECURITY;

-- employer_organizations
CREATE POLICY employer_organizations_select_member
  ON public.employer_organizations
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_organization((SELECT auth.uid()), id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY employer_organizations_insert_admin
  ON public.employer_organizations
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_atlas_admin()));

CREATE POLICY employer_organizations_update_admin
  ON public.employer_organizations
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_atlas_admin()))
  WITH CHECK ((SELECT public.is_atlas_admin()));

-- organization_memberships
CREATE POLICY organization_memberships_select
  ON public.organization_memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.can_access_organization((SELECT auth.uid()), organization_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY organization_memberships_insert_admin
  ON public.organization_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_admin_organization((SELECT auth.uid()), organization_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY organization_memberships_update_admin
  ON public.organization_memberships
  FOR UPDATE
  TO authenticated
  USING (
    public.can_admin_organization((SELECT auth.uid()), organization_id)
    OR (SELECT public.is_atlas_admin())
  )
  WITH CHECK (
    public.can_admin_organization((SELECT auth.uid()), organization_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY organization_memberships_accept_invite
  ON public.organization_memberships
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND status = 'invited'
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'active'
  );

-- employer_organization_practices
CREATE POLICY employer_organization_practices_select
  ON public.employer_organization_practices
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_organization((SELECT auth.uid()), organization_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY employer_organization_practices_insert_admin
  ON public.employer_organization_practices
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_atlas_admin()));

CREATE POLICY employer_organization_practices_update_admin
  ON public.employer_organization_practices
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_atlas_admin()))
  WITH CHECK ((SELECT public.is_atlas_admin()));

-- practice_claims
CREATE POLICY practice_claims_select
  ON public.practice_claims
  FOR SELECT
  TO authenticated
  USING (
    submitted_by = (SELECT auth.uid())
    OR (SELECT public.is_atlas_admin())
    OR (
      approved_organization_id IS NOT NULL
      AND public.can_access_organization((SELECT auth.uid()), approved_organization_id)
    )
  );

CREATE POLICY practice_claims_insert_submitter
  ON public.practice_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = (SELECT auth.uid())
    AND authority_attestation IS TRUE
    AND status = 'pending_email_verification'
    AND (
      (
        claim_type = 'initial_claim'
        AND NOT public._employer_active_operates_link_exists(practice_id)
      )
      OR (
        claim_type = 'access_request'
        AND public._employer_active_operates_link_exists(practice_id)
      )
    )
  );

CREATE POLICY practice_claims_update_admin
  ON public.practice_claims
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_atlas_admin()))
  WITH CHECK ((SELECT public.is_atlas_admin()));

-- Layer 3: employer_practice_profiles
CREATE POLICY employer_practice_profiles_select
  ON public.employer_practice_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY employer_practice_profiles_insert
  ON public.employer_practice_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY employer_practice_profiles_update
  ON public.employer_practice_profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  )
  WITH CHECK (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

-- Layer 3: employer_practice_locations
CREATE POLICY employer_practice_locations_select
  ON public.employer_practice_locations
  FOR SELECT
  TO authenticated
  USING (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY employer_practice_locations_insert
  ON public.employer_practice_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY employer_practice_locations_update
  ON public.employer_practice_locations
  FOR UPDATE
  TO authenticated
  USING (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  )
  WITH CHECK (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

-- Layer 3: employer_roster_assertions
CREATE POLICY employer_roster_assertions_select
  ON public.employer_roster_assertions
  FOR SELECT
  TO authenticated
  USING (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

CREATE POLICY employer_roster_assertions_insert
  ON public.employer_roster_assertions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.can_edit_practice((SELECT auth.uid()), practice_id)
      OR (SELECT public.is_atlas_admin())
    )
    AND asserted_by = (SELECT auth.uid())
    AND status = 'active'
  );

CREATE POLICY employer_roster_assertions_update
  ON public.employer_roster_assertions
  FOR UPDATE
  TO authenticated
  USING (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  )
  WITH CHECK (
    public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR (SELECT public.is_atlas_admin())
  );

-- =============================================================================
-- 8. Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.employer_organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employer_organization_practices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.practice_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employer_practice_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employer_practice_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employer_roster_assertions TO authenticated;

REVOKE ALL ON TABLE public.employer_organizations FROM anon;
REVOKE ALL ON TABLE public.organization_memberships FROM anon;
REVOKE ALL ON TABLE public.employer_organization_practices FROM anon;
REVOKE ALL ON TABLE public.practice_claims FROM anon;
REVOKE ALL ON TABLE public.employer_practice_profiles FROM anon;
REVOKE ALL ON TABLE public.employer_practice_locations FROM anon;
REVOKE ALL ON TABLE public.employer_roster_assertions FROM anon;

REVOKE ALL ON FUNCTION public._organization_descendant_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._organization_descendant_ids(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.can_access_organization(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_organization(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_practice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employer_overlay_publicly_visible(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.verify_claimant_work_email_manual(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_practice_claim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_practice_claim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_practice_initial_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_practice_access_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_membership(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_organization_practice_link(uuid, text) TO authenticated;
