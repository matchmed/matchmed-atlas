-- MAT-26 sponsor publication, briefs, audit, and employer authorization.
-- Forward-only after any production data exists.
-- Operational rollback is is_active = false, audience flags, and unpublish/withdraw.
-- A destructive down script lives in supabase/manual and is unsafe after data creation.
--
-- Visibility precedence (no detail_available flag):
--   1. is_active = false hides every product surface. Admin preview still works.
--   2. atlas_enabled / employers_enabled choose which app may expose the sponsor.
--   3. A library page or directory row is readable only when approved, verified,
--      published content exists for that audience and published_at <= now().
--   4. directory_visible only affects the directory, and only after 1–3 pass.
--   5. Brief withdrawal/recall hides that issue even when the sponsor stays active.
--
-- Postgres URL checks reject malformed, non-HTTPS, credentialed, protocol-relative,
-- localhost, and literal loopback/private/link-local addresses. They do not resolve
-- DNS and are not a DNS-rebinding control. The Atlas admin server action checks DNS
-- at publication time.

-- ---------------------------------------------------------------------------
-- URL validator (syntax and literal addresses only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sponsor_https_url_problem(p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text;
  rest text;
  host text;
  host_v6 text;
BEGIN
  IF p_url IS NULL THEN
    RETURN NULL;
  END IF;
  v := btrim(p_url);
  IF v = '' THEN
    RETURN 'empty';
  END IF;
  IF v ~ '[[:space:]]' OR v ~ '[\\]' THEN
    RETURN 'malformed';
  END IF;
  IF left(v, 2) = '//' THEN
    RETURN 'protocol-relative';
  END IF;
  IF lower(left(v, 8)) <> 'https://' THEN
    RETURN 'scheme';
  END IF;
  rest := substring(v from 9);
  IF rest = '' OR rest ~ '[[:cntrl:]]' THEN
    RETURN 'malformed';
  END IF;
  IF split_part(rest, '/', 1) LIKE '%@%' THEN
    RETURN 'credentials';
  END IF;
  IF rest ~* '[?&](practice_id|practice|physician_id|physician|user_id|user|npi|reported_in|referral|ref|utm_[a-z0-9]+)=' THEN
    RETURN 'context-query';
  END IF;
  host := split_part(split_part(rest, '/', 1), '?', 1);
  host := split_part(host, '#', 1);
  IF host LIKE '[%]' THEN
    host_v6 := lower(substring(host from 2 for char_length(host) - 2));
    IF host_v6 IN ('::1', '::') OR host_v6 LIKE 'fe80:%' OR host_v6 LIKE 'fc%' OR host_v6 LIKE 'fd%'
       OR host_v6 LIKE '::ffff:127.%' OR host_v6 LIKE '::ffff:10.%' OR host_v6 LIKE '::ffff:192.168.%'
       OR host_v6 LIKE '::ffff:169.254.%' OR host_v6 LIKE '::ffff:0.%' THEN
      RETURN 'private-address';
    END IF;
    IF host_v6 ~ '^::ffff:172\.(1[6-9]|2[0-9]|3[0-1])\.' THEN
      RETURN 'private-address';
    END IF;
    RETURN NULL;
  END IF;
  host := lower(split_part(host, ':', 1));
  IF host = '' OR host = 'localhost' OR host LIKE '%.localhost' OR host LIKE '%.local' THEN
    RETURN 'local-host';
  END IF;
  IF host ~ '^[0-9.]+$' THEN
    IF host ~ '^127\.' OR host ~ '^10\.' OR host ~ '^192\.168\.' OR host ~ '^169\.254\.'
       OR host ~ '^0\.' OR host = '255.255.255.255' THEN
      RETURN 'private-address';
    END IF;
    IF host ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.' THEN
      RETURN 'private-address';
    END IF;
    IF host !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN
      RETURN 'malformed';
    END IF;
  ELSIF host ~ '[^a-z0-9.-]' OR host LIKE '-%' OR host LIKE '%.' OR host LIKE '%-' THEN
    RETURN 'malformed';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sponsor_https_url_problem(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sponsor_https_url_problem(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Profile: public slug and audience flags. is_active remains the kill switch.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sponsor_vendor_profiles
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS directory_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atlas_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS employers_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.sponsor_vendor_profiles AS p
SET public_slug = trim(BOTH '-' FROM regexp_replace(v.slug, '_+', '-', 'g'))
FROM public.vendors AS v
WHERE v.id = p.vendor_id
  AND p.public_slug IS NULL;

UPDATE public.sponsor_vendor_profiles AS p
SET public_slug = 'bausch-lomb'
FROM public.vendors AS v
WHERE v.id = p.vendor_id
  AND v.slug = 'bausch_plus_lomb';

INSERT INTO public.sponsor_vendor_profiles (
  vendor_id, is_active, public_slug, directory_visible, atlas_enabled, employers_enabled, sort_order
)
SELECT v.id, false, 'johnson-and-johnson-vision', false, false, false, 110
FROM public.vendors AS v
WHERE v.slug = 'johnson_and_johnson_vision'
ON CONFLICT (vendor_id) DO UPDATE
SET public_slug = EXCLUDED.public_slug
WHERE public.sponsor_vendor_profiles.public_slug IS NULL
   OR public.sponsor_vendor_profiles.public_slug = 'johnson-and-johnson-vision';

ALTER TABLE public.sponsor_vendor_profiles
  ALTER COLUMN public_slug SET NOT NULL;

ALTER TABLE public.sponsor_vendor_profiles
  DROP CONSTRAINT IF EXISTS sponsor_vendor_profiles_public_slug_shape;
ALTER TABLE public.sponsor_vendor_profiles
  ADD CONSTRAINT sponsor_vendor_profiles_public_slug_shape
  CHECK (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

ALTER TABLE public.sponsor_vendor_profiles
  DROP CONSTRAINT IF EXISTS sponsor_vendor_profiles_public_slug_unique;
ALTER TABLE public.sponsor_vendor_profiles
  ADD CONSTRAINT sponsor_vendor_profiles_public_slug_unique UNIQUE (public_slug);

ALTER TABLE public.sponsor_vendor_profiles
  DROP CONSTRAINT IF EXISTS sponsor_vendor_profiles_logo_https;
ALTER TABLE public.sponsor_vendor_profiles
  ADD CONSTRAINT sponsor_vendor_profiles_logo_https
  CHECK (logo_url IS NULL OR public.sponsor_https_url_problem(logo_url) IS NULL);

COMMENT ON COLUMN public.sponsor_vendor_profiles.is_active IS
  'Global emergency kill switch. When false, product RPCs return no sponsor content. Not a meeting-visibility flag.';
COMMENT ON COLUMN public.sponsor_vendor_profiles.public_slug IS
  'Immutable public URL identity. Does not replace vendors.slug.';

CREATE TABLE IF NOT EXISTS public.sponsor_public_slug_redirects (
  from_slug text PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_public_slug_redirects_shape
    CHECK (from_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

ALTER TABLE public.sponsor_public_slug_redirects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sponsor_public_slug_redirects FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Library content: approval is per row. Existing rows stay unapproved drafts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sponsor_vendor_content
  ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS verification_state text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS company_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_approval_reference text,
  ADD COLUMN IF NOT EXISTS company_approval_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS company_approver_name text,
  ADD COLUMN IF NOT EXISTS company_approver_title text,
  ADD COLUMN IF NOT EXISTS company_approver_organization text,
  ADD COLUMN IF NOT EXISTS matchmed_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS matchmed_approved_by uuid,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS recalled_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text,
  ADD COLUMN IF NOT EXISTS illustrative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaces_content_id uuid,
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_label text,
  ADD COLUMN IF NOT EXISTS regulatory_note text,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_publication_state;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_publication_state
  CHECK (publication_state IN (
    'draft', 'scheduled', 'published', 'unpublished', 'archived', 'expired', 'withdrawn', 'recalled'
  ));

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_audience;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_audience
  CHECK (audience IN ('physician', 'employer', 'both'));

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_verification;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_verification
  CHECK (verification_state IN ('unverified', 'verified'));

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_published_approval;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_published_approval
  CHECK (
    publication_state <> 'published'
    OR (
      company_approved_at IS NOT NULL
      AND company_approval_reference IS NOT NULL
      AND company_approval_recorded_by IS NOT NULL
      AND matchmed_approved_at IS NOT NULL
      AND matchmed_approved_by IS NOT NULL
      AND verification_state = 'verified'
      AND published_at IS NOT NULL
      AND withdrawn_at IS NULL
      AND recalled_at IS NULL
      AND illustrative = false
    )
  );

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_illustrative_draft_only;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_illustrative_draft_only
  CHECK (illustrative = false OR publication_state = 'draft');

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_url_https;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_url_https
  CHECK (url IS NULL OR public.sponsor_https_url_problem(url) IS NULL);

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_image_https;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_image_https
  CHECK (image_url IS NULL OR public.sponsor_https_url_problem(image_url) IS NULL);

ALTER TABLE public.sponsor_vendor_content
  DROP CONSTRAINT IF EXISTS sponsor_vendor_content_replaces_fk;
ALTER TABLE public.sponsor_vendor_content
  ADD CONSTRAINT sponsor_vendor_content_replaces_fk
  FOREIGN KEY (replaces_content_id) REFERENCES public.sponsor_vendor_content(id);

-- Existing B+L rows are not approved. Defaults already apply to new columns.
COMMENT ON COLUMN public.sponsor_vendor_content.publication_state IS
  'Existing MAT-16 rows are drafts. Profile flags do not approve this row.';

-- ---------------------------------------------------------------------------
-- Briefs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_brief_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.sponsor_vendor_profiles(vendor_id) ON DELETE CASCADE,
  issue_slug text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('physician', 'employer', 'both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_brief_issues_slug_shape CHECK (issue_slug ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT sponsor_brief_issues_unique UNIQUE (vendor_id, issue_slug)
);

CREATE TABLE IF NOT EXISTS public.sponsor_brief_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.sponsor_brief_issues(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number >= 1),
  title text NOT NULL,
  introduction text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('physician', 'employer', 'both')),
  publication_state text NOT NULL DEFAULT 'draft'
    CHECK (publication_state IN (
      'draft', 'scheduled', 'published', 'unpublished', 'archived', 'expired', 'withdrawn', 'recalled'
    )),
  public_sharing_enabled boolean NOT NULL DEFAULT false,
  company_approved_at timestamptz,
  company_approval_reference text,
  company_approval_recorded_by uuid,
  company_approver_name text,
  company_approver_title text,
  company_approver_organization text,
  matchmed_approved_at timestamptz,
  matchmed_approved_by uuid,
  published_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  recalled_at timestamptz,
  withdrawal_reason text,
  pdf_asset_path text,
  pdf_asset_state text NOT NULL DEFAULT 'none'
    CHECK (pdf_asset_state IN ('none', 'pending', 'approved')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_brief_revisions_unique UNIQUE (issue_id, revision_number),
  CONSTRAINT sponsor_brief_revisions_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  CONSTRAINT sponsor_brief_revisions_intro_len CHECK (char_length(btrim(introduction)) BETWEEN 1 AND 1200),
  CONSTRAINT sponsor_brief_revisions_published_approval CHECK (
    publication_state <> 'published'
    OR (
      company_approved_at IS NOT NULL
      AND company_approval_reference IS NOT NULL
      AND company_approval_recorded_by IS NOT NULL
      AND matchmed_approved_at IS NOT NULL
      AND matchmed_approved_by IS NOT NULL
      AND published_at IS NOT NULL
      AND withdrawn_at IS NULL
      AND recalled_at IS NULL
    )
  ),
  CONSTRAINT sponsor_brief_revisions_sharing CHECK (
    public_sharing_enabled = false
    OR (
      publication_state IN ('published', 'archived')
      AND company_approved_at IS NOT NULL
      AND matchmed_approved_at IS NOT NULL
      AND published_at IS NOT NULL
      AND withdrawn_at IS NULL
      AND recalled_at IS NULL
    )
  ),
  CONSTRAINT sponsor_brief_revisions_pdf CHECK (
    pdf_asset_path IS NULL
    OR (pdf_asset_state = 'approved' AND public.sponsor_https_url_problem(pdf_asset_path) IS NULL)
    OR pdf_asset_path ~ '^[0-9a-f-]{36}/[0-9]{4}-[0-9]{2}\.pdf$'
  )
);

CREATE TABLE IF NOT EXISTS public.sponsor_brief_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.sponsor_brief_revisions(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 4),
  title text NOT NULL,
  summary text NOT NULL,
  source_type text,
  source_label text NOT NULL,
  source_url text,
  cta_label text,
  cta_url text,
  event_label text,
  verification_state text NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified', 'verified')),
  included_publicly boolean NOT NULL DEFAULT false,
  illustrative boolean NOT NULL DEFAULT false,
  CONSTRAINT sponsor_brief_items_position_unique UNIQUE (revision_id, position),
  CONSTRAINT sponsor_brief_items_illustrative CHECK (illustrative = false OR included_publicly = false),
  CONSTRAINT sponsor_brief_items_public_source CHECK (
    included_publicly = false OR verification_state = 'verified'
  ),
  CONSTRAINT sponsor_brief_items_source_https CHECK (
    source_url IS NULL OR public.sponsor_https_url_problem(source_url) IS NULL
  ),
  CONSTRAINT sponsor_brief_items_cta_https CHECK (
    cta_url IS NULL OR public.sponsor_https_url_problem(cta_url) IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- Audit (append-only compliance history, not analytics)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_publication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  content_id uuid,
  brief_issue_id uuid,
  brief_revision_id uuid,
  action text NOT NULL,
  previous_state jsonb,
  new_state jsonb,
  actor_id uuid NOT NULL,
  reason text,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsor_brief_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_brief_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_brief_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_publication_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sponsor_brief_issues FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sponsor_brief_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sponsor_brief_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sponsor_publication_events FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS sponsor_vendor_profiles_select_active ON public.sponsor_vendor_profiles;
DROP POLICY IF EXISTS sponsor_vendor_content_select_active ON public.sponsor_vendor_content;

CREATE POLICY sponsor_publication_events_admin_select
  ON public.sponsor_publication_events
  FOR SELECT
  TO authenticated
  USING (public.is_atlas_admin());

GRANT SELECT ON public.sponsor_publication_events TO authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sponsor_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'sponsor_audit_append_only';
END;
$$;

DROP TRIGGER IF EXISTS sponsor_publication_events_no_update ON public.sponsor_publication_events;
CREATE TRIGGER sponsor_publication_events_no_update
  BEFORE UPDATE OR DELETE ON public.sponsor_publication_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sponsor_reject_audit_mutation();

CREATE OR REPLACE FUNCTION public.sponsor_content_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  frozen boolean;
BEGIN
  frozen := OLD.publication_state IS DISTINCT FROM 'draft'
    OR OLD.matchmed_approved_at IS NOT NULL
    OR OLD.company_approved_at IS NOT NULL;
  IF NOT frozen THEN
    RETURN NEW;
  END IF;
  IF current_setting('sponsor.state_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'sponsor_content_immutable';
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.url IS DISTINCT FROM OLD.url
     OR NEW.event_date IS DISTINCT FROM OLD.event_date
     OR NEW.status_label IS DISTINCT FROM OLD.status_label
     OR NEW.cta_label IS DISTINCT FROM OLD.cta_label
     OR NEW.image_url IS DISTINCT FROM OLD.image_url
     OR NEW.image_alt IS DISTINCT FROM OLD.image_alt
     OR NEW.section_type IS DISTINCT FROM OLD.section_type
     OR NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_label IS DISTINCT FROM OLD.source_label
     OR NEW.regulatory_note IS DISTINCT FROM OLD.regulatory_note
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.illustrative IS DISTINCT FROM OLD.illustrative
  THEN
    RAISE EXCEPTION 'sponsor_content_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sponsor_vendor_content_immutable ON public.sponsor_vendor_content;
CREATE TRIGGER sponsor_vendor_content_immutable
  BEFORE UPDATE ON public.sponsor_vendor_content
  FOR EACH ROW
  EXECUTE FUNCTION public.sponsor_content_immutable();

CREATE OR REPLACE FUNCTION public.sponsor_brief_revision_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  frozen boolean;
BEGIN
  frozen := OLD.publication_state IS DISTINCT FROM 'draft'
    OR OLD.matchmed_approved_at IS NOT NULL
    OR OLD.company_approved_at IS NOT NULL;
  IF NOT frozen THEN
    RETURN NEW;
  END IF;
  IF current_setting('sponsor.state_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'sponsor_brief_immutable';
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.introduction IS DISTINCT FROM OLD.introduction
     OR NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.pdf_asset_path IS DISTINCT FROM OLD.pdf_asset_path
  THEN
    RAISE EXCEPTION 'sponsor_brief_immutable';
  END IF;
  IF OLD.publication_state IN ('withdrawn', 'recalled')
     AND NEW.publication_state IS DISTINCT FROM OLD.publication_state THEN
    RAISE EXCEPTION 'sponsor_brief_withdrawn_locked';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sponsor_brief_revisions_immutable ON public.sponsor_brief_revisions;
CREATE TRIGGER sponsor_brief_revisions_immutable
  BEFORE UPDATE ON public.sponsor_brief_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.sponsor_brief_revision_immutable();

CREATE OR REPLACE FUNCTION public.sponsor_brief_items_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent_state text;
  approved timestamptz;
BEGIN
  SELECT publication_state, matchmed_approved_at
    INTO parent_state, approved
  FROM public.sponsor_brief_revisions
  WHERE id = OLD.revision_id;
  IF parent_state IS DISTINCT FROM 'draft' OR approved IS NOT NULL THEN
    RAISE EXCEPTION 'sponsor_brief_items_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sponsor_brief_items_immutable_upd ON public.sponsor_brief_items;
CREATE TRIGGER sponsor_brief_items_immutable_upd
  BEFORE UPDATE OR DELETE ON public.sponsor_brief_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sponsor_brief_items_immutable();

CREATE OR REPLACE FUNCTION public._sponsor_audit(
  p_vendor_id uuid,
  p_content_id uuid,
  p_issue_id uuid,
  p_revision_id uuid,
  p_action text,
  p_previous jsonb,
  p_new jsonb,
  p_reason text,
  p_reference text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'sponsor_admin_required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.sponsor_publication_events (
    vendor_id, content_id, brief_issue_id, brief_revision_id,
    action, previous_state, new_state, actor_id, reason, external_reference
  ) VALUES (
    p_vendor_id, p_content_id, p_issue_id, p_revision_id,
    p_action, p_previous, p_new, (SELECT auth.uid()), p_reason, p_reference
  );
END;
$$;

REVOKE ALL ON FUNCTION public._sponsor_audit(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.employer_has_dashboard_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT public.is_atlas_admin() THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.organization_memberships AS m
      WHERE m.user_id = p_user_id
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'editor')
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.employer_has_dashboard_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employer_has_dashboard_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._require_employer_member()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.employer_has_dashboard_access((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'employer_access_denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._require_employer_member() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read predicates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._library_item_readable(
  p_state text,
  p_company timestamptz,
  p_matchmed timestamptz,
  p_verified text,
  p_published_at timestamptz,
  p_expires_at timestamptz,
  p_withdrawn timestamptz,
  p_recalled timestamptz,
  p_illustrative boolean,
  p_row_active boolean
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_row_active
    AND p_state = 'published'
    AND p_company IS NOT NULL
    AND p_matchmed IS NOT NULL
    AND p_verified = 'verified'
    AND p_published_at IS NOT NULL
    AND p_published_at <= now()
    AND (p_expires_at IS NULL OR p_expires_at > now())
    AND p_withdrawn IS NULL
    AND p_recalled IS NULL
    AND p_illustrative = false;
$$;

CREATE OR REPLACE FUNCTION public._audience_matches(p_row text, p_surface text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_row = 'both' OR p_row = p_surface;
$$;

-- ---------------------------------------------------------------------------
-- Product RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_active_atlas_sponsors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_order, x.display_label), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      p.public_slug AS slug,
      v.display_label,
      p.short_description,
      p.logo_url,
      p.sort_order
    FROM public.sponsor_vendor_profiles AS p
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.is_active = true
      AND p.atlas_enabled = true
      AND p.directory_visible = true
      AND v.active = true
      AND EXISTS (
        SELECT 1
        FROM public.sponsor_vendor_content AS c
        WHERE c.vendor_id = p.vendor_id
          AND public._audience_matches(c.audience, 'physician')
          AND public._library_item_readable(
            c.publication_state, c.company_approved_at, c.matchmed_approved_at,
            c.verification_state, c.published_at, c.expires_at, c.withdrawn_at,
            c.recalled_at, c.illustrative, c.is_active
          )
      )
  ) AS x;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_active_sponsor_slugs()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(p.public_slug ORDER BY p.public_slug), ARRAY[]::text[])
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.is_active = true
    AND p.atlas_enabled = true
    AND v.active = true
    AND EXISTS (
      SELECT 1
      FROM public.sponsor_vendor_content AS c
      WHERE c.vendor_id = p.vendor_id
        AND public._audience_matches(c.audience, 'physician')
        AND public._library_item_readable(
          c.publication_state, c.company_approved_at, c.matchmed_approved_at,
          c.verification_state, c.published_at, c.expires_at, c.withdrawn_at,
          c.recalled_at, c.illustrative, c.is_active
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.list_sponsor_link_targets(p_audience text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_audience = 'employer' THEN
    PERFORM public._require_employer_member();
  ELSIF p_audience IS DISTINCT FROM 'physician' THEN
    RAISE EXCEPTION 'invalid_audience' USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'vendor_slug', v.slug,
      'public_slug', p.public_slug
    ) ORDER BY p.public_slug)
    FROM public.sponsor_vendor_profiles AS p
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.is_active = true
      AND v.active = true
      AND (
        (p_audience = 'physician' AND p.atlas_enabled)
        OR (p_audience = 'employer' AND p.employers_enabled)
      )
      AND EXISTS (
        SELECT 1
        FROM public.sponsor_vendor_content AS c
        WHERE c.vendor_id = p.vendor_id
          AND public._audience_matches(c.audience, p_audience)
          AND public._library_item_readable(
            c.publication_state, c.company_approved_at, c.matchmed_approved_at,
            c.verification_state, c.published_at, c.expires_at, c.withdrawn_at,
            c.recalled_at, c.illustrative, c.is_active
          )
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_atlas_sponsor_page(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'slug', p.public_slug,
    'display_label', v.display_label,
    'short_description', p.short_description,
    'logo_url', p.logo_url,
    'disclosure_text', COALESCE(
      NULLIF(btrim(p.disclosure_text), ''),
      v.display_label || ' is an Atlas industry partner. Partnership does not affect practice scores, rankings, Opportunities, physician visibility, or technology reporting.'
    ),
    'sections', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'section_type', c.section_type,
          'title', c.title,
          'description', c.description,
          'url', c.url,
          'event_date', c.event_date,
          'status_label', c.status_label,
          'cta_label', c.cta_label,
          'sort_order', c.sort_order,
          'image_url', c.image_url,
          'image_alt', c.image_alt,
          'source_label', c.source_label
        )
        ORDER BY c.section_sort, c.sort_order, c.title
      )
      FROM (
        SELECT
          sc.section_type,
          CASE sc.section_type
            WHEN 'whats_new' THEN 1
            WHEN 'education' THEN 2
            WHEN 'clinical_evidence' THEN 3
            WHEN 'connect' THEN 4
            WHEN 'training_product_info' THEN 5
            ELSE 99
          END AS section_sort,
          sc.title, sc.description, sc.url, sc.event_date, sc.status_label,
          sc.cta_label, sc.sort_order, sc.image_url, sc.image_alt, sc.source_label
        FROM public.sponsor_vendor_content AS sc
        WHERE sc.vendor_id = p.vendor_id
          AND public._audience_matches(sc.audience, 'physician')
          AND public._library_item_readable(
            sc.publication_state, sc.company_approved_at, sc.matchmed_approved_at,
            sc.verification_state, sc.published_at, sc.expires_at, sc.withdrawn_at,
            sc.recalled_at, sc.illustrative, sc.is_active
          )
      ) AS c
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.public_slug = lower(btrim(p_slug))
    AND p.is_active = true
    AND p.atlas_enabled = true
    AND v.active = true
    AND EXISTS (
      SELECT 1
      FROM public.sponsor_vendor_content AS sc
      WHERE sc.vendor_id = p.vendor_id
        AND public._audience_matches(sc.audience, 'physician')
        AND public._library_item_readable(
          sc.publication_state, sc.company_approved_at, sc.matchmed_approved_at,
          sc.verification_state, sc.published_at, sc.expires_at, sc.withdrawn_at,
          sc.recalled_at, sc.illustrative, sc.is_active
        )
    );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_employer_sponsors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._require_employer_member();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'slug', p.public_slug,
      'display_label', v.display_label,
      'short_description', p.short_description,
      'sort_order', p.sort_order
    ) ORDER BY p.sort_order, v.display_label)
    FROM public.sponsor_vendor_profiles AS p
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.is_active = true
      AND p.employers_enabled = true
      AND p.directory_visible = true
      AND v.active = true
      AND EXISTS (
        SELECT 1 FROM public.sponsor_vendor_content AS c
        WHERE c.vendor_id = p.vendor_id
          AND public._audience_matches(c.audience, 'employer')
          AND public._library_item_readable(
            c.publication_state, c.company_approved_at, c.matchmed_approved_at,
            c.verification_state, c.published_at, c.expires_at, c.withdrawn_at,
            c.recalled_at, c.illustrative, c.is_active
          )
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employer_sponsor_page(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._require_employer_member();
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'slug', p.public_slug,
    'display_label', v.display_label,
    'short_description', p.short_description,
    'disclosure_text', COALESCE(NULLIF(btrim(p.disclosure_text), ''), v.display_label || ' is a MatchMed industry partner.'),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'section_type', sc.section_type,
        'title', sc.title,
        'description', sc.description,
        'url', sc.url,
        'cta_label', sc.cta_label,
        'source_label', sc.source_label,
        'sort_order', sc.sort_order
      ) ORDER BY sc.sort_order, sc.title)
      FROM public.sponsor_vendor_content AS sc
      WHERE sc.vendor_id = p.vendor_id
        AND public._audience_matches(sc.audience, 'employer')
        AND public._library_item_readable(
          sc.publication_state, sc.company_approved_at, sc.matchmed_approved_at,
          sc.verification_state, sc.published_at, sc.expires_at, sc.withdrawn_at,
          sc.recalled_at, sc.illustrative, sc.is_active
        )
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.public_slug = lower(btrim(p_slug))
    AND p.is_active = true
    AND p.employers_enabled = true
    AND v.active = true;

  IF result IS NULL OR jsonb_array_length(result->'sections') = 0 THEN
    RETURN NULL;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employer_practice_sponsor_context(
  p_practice_id uuid,
  p_slug text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  v_vendor uuid;
BEGIN
  PERFORM public._require_employer_member();
  IF p_practice_id IS NULL OR NOT public.can_edit_practice((SELECT auth.uid()), p_practice_id) THEN
    RAISE EXCEPTION 'employer_practice_denied' USING ERRCODE = '42501';
  END IF;

  SELECT p.vendor_id INTO v_vendor
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.public_slug = lower(btrim(p_slug))
    AND p.is_active = true
    AND p.employers_enabled = true
    AND v.active = true;

  IF v_vendor IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'slug', p.public_slug,
    'display_label', v.display_label,
    'technology', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'category_label', ic.display_label,
        'vendor_label', v.display_label
      ) ORDER BY ic.display_label)
      FROM public.employer_practice_infrastructure AS epi
      JOIN public.infrastructure_categories AS ic ON ic.id = epi.category_id
      WHERE epi.practice_id = p_practice_id
        AND epi.vendor_id = v_vendor
    ), '[]'::jsonb),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'title', sc.title,
        'description', sc.description,
        'url', sc.url,
        'cta_label', sc.cta_label,
        'source_label', sc.source_label
      ) ORDER BY sc.sort_order, sc.title)
      FROM public.sponsor_vendor_content AS sc
      WHERE sc.vendor_id = v_vendor
        AND public._audience_matches(sc.audience, 'employer')
        AND public._library_item_readable(
          sc.publication_state, sc.company_approved_at, sc.matchmed_approved_at,
          sc.verification_state, sc.published_at, sc.expires_at, sc.withdrawn_at,
          sc.recalled_at, sc.illustrative, sc.is_active
        )
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.vendor_id = v_vendor;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public._brief_public_payload(p_revision_id uuid, p_label text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'slug', p.public_slug,
    'issue_slug', i.issue_slug,
    'title', r.title,
    'introduction', r.introduction,
    'state_label', p_label,
    'display_label', v.display_label,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'position', bi.position,
        'title', bi.title,
        'summary', bi.summary,
        'source_label', bi.source_label,
        'source_url', bi.source_url,
        'cta_label', bi.cta_label,
        'cta_url', bi.cta_url
      ) ORDER BY bi.position)
      FROM public.sponsor_brief_items AS bi
      WHERE bi.revision_id = r.id
        AND bi.included_publicly = true
        AND bi.illustrative = false
        AND bi.verification_state = 'verified'
    ), '[]'::jsonb),
    'pdf_available', (r.pdf_asset_state = 'approved' AND r.pdf_asset_path IS NOT NULL)
  )
  FROM public.sponsor_brief_revisions AS r
  JOIN public.sponsor_brief_issues AS i ON i.id = r.issue_id
  JOIN public.sponsor_vendor_profiles AS p ON p.vendor_id = r.vendor_id
  JOIN public.vendors AS v ON v.id = r.vendor_id
  WHERE r.id = p_revision_id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_sponsor_brief(p_slug text, p_issue text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor uuid;
  v_revision uuid;
  v_state text;
  v_sharing boolean;
  v_active boolean;
  v_published timestamptz;
  v_expires timestamptz;
  v_withdrawn timestamptz;
  v_recalled timestamptz;
  v_company timestamptz;
  v_matchmed timestamptz;
BEGIN
  SELECT p.vendor_id, p.is_active
    INTO v_vendor, v_active
  FROM public.sponsor_vendor_profiles AS p
  WHERE p.public_slug = lower(btrim(COALESCE(p_slug, '')));

  IF v_vendor IS NULL OR v_active IS DISTINCT FROM true THEN
    RETURN NULL;
  END IF;

  SELECT r.id, r.publication_state, r.public_sharing_enabled, r.published_at,
         r.expires_at, r.withdrawn_at, r.recalled_at, r.company_approved_at, r.matchmed_approved_at
    INTO v_revision, v_state, v_sharing, v_published, v_expires, v_withdrawn, v_recalled, v_company, v_matchmed
  FROM public.sponsor_brief_revisions AS r
  JOIN public.sponsor_brief_issues AS i ON i.id = r.issue_id
  WHERE r.vendor_id = v_vendor
    AND i.issue_slug = btrim(COALESCE(p_issue, ''))
    AND r.publication_state IN ('published', 'archived', 'expired')
  ORDER BY r.revision_number DESC
  LIMIT 1;

  IF v_revision IS NULL OR v_sharing IS DISTINCT FROM true THEN
    RETURN NULL;
  END IF;
  IF v_company IS NULL OR v_matchmed IS NULL OR v_published IS NULL OR v_published > now() THEN
    RETURN NULL;
  END IF;
  IF v_withdrawn IS NOT NULL OR v_recalled IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF v_state = 'expired' OR (v_expires IS NOT NULL AND v_expires <= now()) THEN
    RETURN jsonb_build_object('state_label', 'expired', 'items', '[]'::jsonb);
  END IF;
  IF v_state = 'archived' THEN
    RETURN public._brief_public_payload(v_revision, 'archived');
  END IF;
  IF v_state = 'published' THEN
    RETURN public._brief_public_payload(v_revision, 'current');
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_sponsor_brief_canonical(p_slug text, p_issue text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  direct jsonb;
  v_vendor uuid;
  canonical text;
BEGIN
  direct := public.get_public_sponsor_brief(p_slug, p_issue);
  IF direct IS NOT NULL AND direct ? 'slug' THEN
    RETURN jsonb_build_object('public_slug', direct->>'slug', 'redirect', false);
  END IF;
  IF direct IS NOT NULL AND direct->>'state_label' = 'expired' THEN
    RETURN jsonb_build_object('public_slug', lower(btrim(p_slug)), 'redirect', false, 'expired', true);
  END IF;

  SELECT r.vendor_id INTO v_vendor
  FROM public.sponsor_public_slug_redirects AS r
  WHERE r.from_slug = lower(btrim(COALESCE(p_slug, '')));
  IF v_vendor IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT p.public_slug INTO canonical
  FROM public.sponsor_vendor_profiles AS p
  WHERE p.vendor_id = v_vendor;
  IF canonical IS NULL THEN
    RETURN NULL;
  END IF;
  direct := public.get_public_sponsor_brief(canonical, p_issue);
  IF direct IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('public_slug', canonical, 'redirect', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._require_sponsor_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'sponsor_admin_required' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._require_sponsor_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_sponsor_flags(
  p_vendor_id uuid,
  p_is_active boolean,
  p_directory_visible boolean,
  p_atlas_enabled boolean,
  p_employers_enabled boolean,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prev jsonb;
  nxt jsonb;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT jsonb_build_object(
    'is_active', is_active,
    'directory_visible', directory_visible,
    'atlas_enabled', atlas_enabled,
    'employers_enabled', employers_enabled
  ) INTO prev
  FROM public.sponsor_vendor_profiles
  WHERE vendor_id = p_vendor_id;
  IF prev IS NULL THEN
    RAISE EXCEPTION 'sponsor_not_found';
  END IF;

  UPDATE public.sponsor_vendor_profiles
  SET is_active = p_is_active,
      directory_visible = p_directory_visible,
      atlas_enabled = p_atlas_enabled,
      employers_enabled = p_employers_enabled,
      updated_by = (SELECT auth.uid()),
      updated_at = now()
  WHERE vendor_id = p_vendor_id;

  nxt := jsonb_build_object(
    'is_active', p_is_active,
    'directory_visible', p_directory_visible,
    'atlas_enabled', p_atlas_enabled,
    'employers_enabled', p_employers_enabled
  );
  PERFORM public._sponsor_audit(
    p_vendor_id, NULL, NULL, NULL,
    CASE WHEN p_is_active IS DISTINCT FROM (prev->>'is_active')::boolean
      THEN CASE WHEN p_is_active THEN 'sponsor_activated' ELSE 'sponsor_deactivated' END
      ELSE 'sponsor_visibility_changed' END,
    prev, nxt, p_reason, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_company_approval_content(
  p_content_id uuid,
  p_reference text,
  p_approver_name text,
  p_approver_title text,
  p_approver_org text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor uuid;
  v_state text;
BEGIN
  PERFORM public._require_sponsor_admin();
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'company_approval_reference_required';
  END IF;
  SELECT vendor_id, publication_state INTO v_vendor, v_state
  FROM public.sponsor_vendor_content WHERE id = p_content_id;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'content_not_found';
  END IF;
  IF v_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'sponsor_content_immutable';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  UPDATE public.sponsor_vendor_content
  SET company_approved_at = now(),
      company_approval_reference = btrim(p_reference),
      company_approval_recorded_by = (SELECT auth.uid()),
      company_approver_name = NULLIF(btrim(COALESCE(p_approver_name, '')), ''),
      company_approver_title = NULLIF(btrim(COALESCE(p_approver_title, '')), ''),
      company_approver_organization = NULLIF(btrim(COALESCE(p_approver_org, '')), ''),
      updated_by = (SELECT auth.uid()),
      updated_at = now()
  WHERE id = p_content_id;
  PERFORM public._sponsor_audit(
    v_vendor, p_content_id, NULL, NULL, 'company_approval_recorded',
    jsonb_build_object('publication_state', v_state),
    jsonb_build_object('company_approval_reference', btrim(p_reference)),
    NULL, btrim(p_reference)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_matchmed_approval_content(p_content_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor uuid;
  v_company timestamptz;
  v_state text;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT vendor_id, company_approved_at, publication_state
    INTO v_vendor, v_company, v_state
  FROM public.sponsor_vendor_content WHERE id = p_content_id;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'content_not_found';
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'company_approval_required';
  END IF;
  IF v_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'sponsor_content_immutable';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  UPDATE public.sponsor_vendor_content
  SET matchmed_approved_at = now(),
      matchmed_approved_by = (SELECT auth.uid()),
      verification_state = 'verified',
      updated_by = (SELECT auth.uid()),
      updated_at = now()
  WHERE id = p_content_id;
  PERFORM public._sponsor_audit(
    v_vendor, p_content_id, NULL, NULL, 'matchmed_approval',
    jsonb_build_object('publication_state', v_state),
    jsonb_build_object('verification_state', 'verified'),
    NULL, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_content(p_content_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.sponsor_vendor_content%ROWTYPE;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT * INTO row FROM public.sponsor_vendor_content WHERE id = p_content_id;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'content_not_found';
  END IF;
  IF row.company_approved_at IS NULL OR row.matchmed_approved_at IS NULL THEN
    RAISE EXCEPTION 'approval_required';
  END IF;
  IF row.verification_state IS DISTINCT FROM 'verified' OR row.illustrative THEN
    RAISE EXCEPTION 'verification_required';
  END IF;
  IF row.url IS NOT NULL AND public.sponsor_https_url_problem(row.url) IS NOT NULL THEN
    RAISE EXCEPTION 'unsafe_url';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  IF row.replaces_content_id IS NOT NULL THEN
    UPDATE public.sponsor_vendor_content
    SET publication_state = 'archived', archived_at = now(), updated_at = now()
    WHERE id = row.replaces_content_id
      AND publication_state = 'published';
  END IF;
  UPDATE public.sponsor_vendor_content
  SET publication_state = 'published',
      published_at = COALESCE(published_at, now()),
      updated_by = (SELECT auth.uid()),
      updated_at = now()
  WHERE id = p_content_id;
  PERFORM public._sponsor_audit(
    row.vendor_id, p_content_id, NULL, NULL, 'publish',
    jsonb_build_object('publication_state', row.publication_state),
    jsonb_build_object('publication_state', 'published'),
    NULL, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_content_replacement(p_content_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.sponsor_vendor_content%ROWTYPE;
  new_id uuid;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT * INTO row FROM public.sponsor_vendor_content WHERE id = p_content_id;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'content_not_found';
  END IF;
  INSERT INTO public.sponsor_vendor_content (
    vendor_id, section_type, title, description, url, event_date, status_label,
    cta_label, sort_order, is_active, image_url, image_alt, audience, source_type,
    source_label, regulatory_note, illustrative, replaces_content_id, revision_number,
    publication_state, verification_state, updated_by
  ) VALUES (
    row.vendor_id, row.section_type, row.title, row.description, row.url, row.event_date,
    row.status_label, row.cta_label, row.sort_order, true, row.image_url, row.image_alt,
    row.audience, row.source_type, row.source_label, row.regulatory_note, false,
    row.id, row.revision_number + 1, 'draft', 'unverified', (SELECT auth.uid())
  )
  RETURNING id INTO new_id;
  PERFORM public._sponsor_audit(
    row.vendor_id, new_id, NULL, NULL, 'content_revision_created',
    jsonb_build_object('replaces_content_id', row.id),
    jsonb_build_object('publication_state', 'draft'),
    NULL, NULL
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_withdraw_content(p_content_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.sponsor_vendor_content%ROWTYPE;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT * INTO row FROM public.sponsor_vendor_content WHERE id = p_content_id;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'content_not_found';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  UPDATE public.sponsor_vendor_content
  SET publication_state = 'withdrawn',
      withdrawn_at = now(),
      withdrawal_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
      updated_at = now()
  WHERE id = p_content_id;
  PERFORM public._sponsor_audit(
    row.vendor_id, p_content_id, NULL, NULL, 'withdraw',
    jsonb_build_object('publication_state', row.publication_state),
    jsonb_build_object('publication_state', 'withdrawn'),
    p_reason, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_brief_draft(
  p_vendor_id uuid,
  p_issue_slug text,
  p_title text,
  p_introduction text,
  p_audience text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_issue uuid;
  v_rev uuid;
  v_num integer;
BEGIN
  PERFORM public._require_sponsor_admin();
  IF p_audience NOT IN ('physician', 'employer', 'both') THEN
    RAISE EXCEPTION 'invalid_audience';
  END IF;
  IF p_issue_slug !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'invalid_issue_slug';
  END IF;
  INSERT INTO public.sponsor_brief_issues (vendor_id, issue_slug, audience)
  VALUES (p_vendor_id, p_issue_slug, p_audience)
  ON CONFLICT (vendor_id, issue_slug) DO UPDATE SET audience = EXCLUDED.audience
  RETURNING id INTO v_issue;
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_num
  FROM public.sponsor_brief_revisions WHERE issue_id = v_issue;
  INSERT INTO public.sponsor_brief_revisions (
    issue_id, vendor_id, revision_number, title, introduction, audience, created_by
  ) VALUES (
    v_issue, p_vendor_id, v_num, btrim(p_title), btrim(p_introduction), p_audience, (SELECT auth.uid())
  ) RETURNING id INTO v_rev;
  PERFORM public._sponsor_audit(
    p_vendor_id, NULL, v_issue, v_rev, 'brief_revision_created',
    NULL, jsonb_build_object('revision_number', v_num, 'publication_state', 'draft'),
    NULL, NULL
  );
  RETURN v_rev;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_replace_brief_items(p_revision_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state text;
  v_vendor uuid;
  v_count integer;
  item jsonb;
  pos integer;
  seen integer[] := ARRAY[]::integer[];
  src text;
  cta text;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT publication_state, vendor_id
    INTO v_state, v_vendor
  FROM public.sponsor_brief_revisions WHERE id = p_revision_id;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'brief_not_found';
  END IF;
  IF v_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'sponsor_brief_immutable';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;
  IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 4 THEN
    RAISE EXCEPTION 'brief_item_count';
  END IF;
  DELETE FROM public.sponsor_brief_items WHERE revision_id = p_revision_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    pos := (item->>'position')::integer;
    IF pos IS NULL OR pos < 1 OR pos > 4 OR pos = ANY (seen) THEN
      RAISE EXCEPTION 'brief_item_position';
    END IF;
    seen := seen || pos;
    src := NULLIF(item->>'source_url', '');
    cta := NULLIF(item->>'cta_url', '');
    IF src IS NOT NULL AND public.sponsor_https_url_problem(src) IS NOT NULL THEN
      RAISE EXCEPTION 'unsafe_url';
    END IF;
    IF cta IS NOT NULL AND public.sponsor_https_url_problem(cta) IS NOT NULL THEN
      RAISE EXCEPTION 'unsafe_url';
    END IF;
    INSERT INTO public.sponsor_brief_items (
      revision_id, position, title, summary, source_type, source_label, source_url,
      cta_label, cta_url, event_label, verification_state, included_publicly, illustrative
    ) VALUES (
      p_revision_id, pos, item->>'title', item->>'summary', item->>'source_type',
      item->>'source_label', src, item->>'cta_label', cta, item->>'event_label',
      COALESCE(item->>'verification_state', 'unverified'),
      COALESCE((item->>'included_publicly')::boolean, false),
      COALESCE((item->>'illustrative')::boolean, false)
    );
  END LOOP;
  IF (SELECT count(*) FROM unnest(seen) AS x) <> (SELECT max(x) FROM unnest(seen) AS x) THEN
    RAISE EXCEPTION 'brief_item_gap';
  END IF;
  PERFORM public._sponsor_audit(
    v_vendor, NULL, NULL, p_revision_id, 'brief_items_replaced',
    NULL, jsonb_build_object('count', jsonb_array_length(p_items)), NULL, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_company_approval_brief(
  p_revision_id uuid,
  p_reference text,
  p_approver_name text,
  p_approver_title text,
  p_approver_org text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor uuid;
  v_state text;
  v_issue uuid;
BEGIN
  PERFORM public._require_sponsor_admin();
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'company_approval_reference_required';
  END IF;
  SELECT vendor_id, publication_state, issue_id INTO v_vendor, v_state, v_issue
  FROM public.sponsor_brief_revisions WHERE id = p_revision_id;
  IF v_vendor IS NULL OR v_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'sponsor_brief_immutable';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  UPDATE public.sponsor_brief_revisions
  SET company_approved_at = now(),
      company_approval_reference = btrim(p_reference),
      company_approval_recorded_by = (SELECT auth.uid()),
      company_approver_name = NULLIF(btrim(COALESCE(p_approver_name, '')), ''),
      company_approver_title = NULLIF(btrim(COALESCE(p_approver_title, '')), ''),
      company_approver_organization = NULLIF(btrim(COALESCE(p_approver_org, '')), '')
  WHERE id = p_revision_id;
  PERFORM public._sponsor_audit(
    v_vendor, NULL, v_issue, p_revision_id, 'company_approval_recorded',
    NULL, jsonb_build_object('company_approval_reference', btrim(p_reference)),
    NULL, btrim(p_reference)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_matchmed_approval_brief(p_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor uuid;
  v_company timestamptz;
  v_issue uuid;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT vendor_id, company_approved_at, issue_id INTO v_vendor, v_company, v_issue
  FROM public.sponsor_brief_revisions WHERE id = p_revision_id;
  IF v_vendor IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'company_approval_required';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  UPDATE public.sponsor_brief_revisions
  SET matchmed_approved_at = now(),
      matchmed_approved_by = (SELECT auth.uid())
  WHERE id = p_revision_id
    AND publication_state = 'draft';
  PERFORM public._sponsor_audit(
    v_vendor, NULL, v_issue, p_revision_id, 'matchmed_approval',
    NULL, jsonb_build_object('matchmed_approved', true), NULL, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_brief(p_revision_id uuid, p_sharing boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.sponsor_brief_revisions%ROWTYPE;
  n integer;
  max_pos integer;
  overlap integer;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT * INTO row FROM public.sponsor_brief_revisions WHERE id = p_revision_id;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'brief_not_found';
  END IF;
  IF row.company_approved_at IS NULL OR row.matchmed_approved_at IS NULL THEN
    RAISE EXCEPTION 'approval_required';
  END IF;
  IF row.publication_state IN ('withdrawn', 'recalled') THEN
    RAISE EXCEPTION 'sponsor_brief_withdrawn_locked';
  END IF;
  SELECT count(*), max(position) INTO n, max_pos
  FROM public.sponsor_brief_items WHERE revision_id = p_revision_id;
  IF n < 1 OR n > 4 OR max_pos IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'brief_item_gap';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sponsor_brief_items
    WHERE revision_id = p_revision_id
      AND included_publicly = true
      AND (verification_state IS DISTINCT FROM 'verified' OR illustrative = true OR source_url IS NULL)
  ) THEN
    RAISE EXCEPTION 'public_item_unverified';
  END IF;
  SELECT count(*) INTO overlap
  FROM public.sponsor_brief_revisions AS other
  WHERE other.vendor_id = row.vendor_id
    AND other.id <> row.id
    AND other.publication_state = 'published'
    AND (other.audience = 'both' OR row.audience = 'both' OR other.audience = row.audience);
  IF overlap > 0 THEN
    RAISE EXCEPTION 'current_brief_exists';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  UPDATE public.sponsor_brief_revisions
  SET publication_state = 'published',
      published_at = COALESCE(published_at, now()),
      public_sharing_enabled = COALESCE(p_sharing, false)
  WHERE id = p_revision_id;
  PERFORM public._sponsor_audit(
    row.vendor_id, NULL, row.issue_id, p_revision_id, 'publish',
    jsonb_build_object('publication_state', row.publication_state),
    jsonb_build_object('publication_state', 'published', 'public_sharing_enabled', COALESCE(p_sharing, false)),
    NULL, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_brief_state(
  p_revision_id uuid,
  p_state text,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.sponsor_brief_revisions%ROWTYPE;
BEGIN
  PERFORM public._require_sponsor_admin();
  IF p_state NOT IN ('unpublished', 'archived', 'expired', 'withdrawn', 'recalled') THEN
    RAISE EXCEPTION 'invalid_brief_state';
  END IF;
  SELECT * INTO row FROM public.sponsor_brief_revisions WHERE id = p_revision_id;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'brief_not_found';
  END IF;
  PERFORM set_config('sponsor.state_transition', 'on', true);
  UPDATE public.sponsor_brief_revisions
  SET publication_state = p_state,
      public_sharing_enabled = CASE
        WHEN p_state IN ('unpublished', 'expired', 'withdrawn', 'recalled') THEN false
        ELSE public_sharing_enabled
      END,
      archived_at = CASE WHEN p_state = 'archived' THEN now() ELSE archived_at END,
      withdrawn_at = CASE WHEN p_state = 'withdrawn' THEN now() ELSE withdrawn_at END,
      recalled_at = CASE WHEN p_state = 'recalled' THEN now() ELSE recalled_at END,
      withdrawal_reason = CASE
        WHEN p_state IN ('withdrawn', 'recalled') THEN NULLIF(btrim(COALESCE(p_reason, '')), '')
        ELSE withdrawal_reason
      END
  WHERE id = p_revision_id;
  PERFORM public._sponsor_audit(
    row.vendor_id, NULL, row.issue_id, p_revision_id, p_state,
    jsonb_build_object('publication_state', row.publication_state),
    jsonb_build_object('publication_state', p_state),
    p_reason, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_sponsor_preview(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._require_sponsor_admin();
  SELECT jsonb_build_object(
    'slug', p.public_slug,
    'vendor_slug', v.slug,
    'display_label', v.display_label,
    'is_active', p.is_active,
    'directory_visible', p.directory_visible,
    'atlas_enabled', p.atlas_enabled,
    'employers_enabled', p.employers_enabled,
    'content', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'publication_state', c.publication_state,
        'audience', c.audience,
        'verification_state', c.verification_state,
        'url', c.url
      ) ORDER BY c.revision_number, c.title)
      FROM public.sponsor_vendor_content AS c
      WHERE c.vendor_id = p.vendor_id
    ), '[]'::jsonb),
    'briefs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'issue_slug', i.issue_slug,
        'revision_number', r.revision_number,
        'title', r.title,
        'publication_state', r.publication_state,
        'public_sharing_enabled', r.public_sharing_enabled
      ) ORDER BY i.issue_slug, r.revision_number)
      FROM public.sponsor_brief_revisions AS r
      JOIN public.sponsor_brief_issues AS i ON i.id = r.issue_id
      WHERE r.vendor_id = p.vendor_id
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.sponsor_vendor_profiles AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.public_slug = lower(btrim(COALESCE(p_slug, '')));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rename_public_slug(p_vendor_id uuid, p_new_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_slug text;
BEGIN
  PERFORM public._require_sponsor_admin();
  IF p_new_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid_public_slug';
  END IF;
  SELECT public_slug INTO old_slug FROM public.sponsor_vendor_profiles WHERE vendor_id = p_vendor_id;
  IF old_slug IS NULL THEN
    RAISE EXCEPTION 'sponsor_not_found';
  END IF;
  IF old_slug = p_new_slug THEN
    RETURN;
  END IF;
  INSERT INTO public.sponsor_public_slug_redirects (from_slug, vendor_id)
  VALUES (old_slug, p_vendor_id)
  ON CONFLICT (from_slug) DO NOTHING;
  UPDATE public.sponsor_vendor_profiles
  SET public_slug = p_new_slug, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE vendor_id = p_vendor_id;
  PERFORM public._sponsor_audit(
    p_vendor_id, NULL, NULL, NULL, 'public_slug_changed',
    jsonb_build_object('public_slug', old_slug),
    jsonb_build_object('public_slug', p_new_slug),
    NULL, NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.list_active_atlas_sponsors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_atlas_sponsors() TO authenticated;

REVOKE ALL ON FUNCTION public.list_active_sponsor_slugs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_sponsor_slugs() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_sponsor_link_targets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_sponsor_link_targets(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_atlas_sponsor_page(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_atlas_sponsor_page(text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_employer_sponsors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_employer_sponsors() TO authenticated;

REVOKE ALL ON FUNCTION public.get_employer_sponsor_page(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employer_sponsor_page(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_employer_practice_sponsor_context(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employer_practice_sponsor_context(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_sponsor_brief(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_sponsor_brief(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.resolve_sponsor_brief_canonical(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_sponsor_brief_canonical(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public._brief_public_payload(uuid, text) FROM PUBLIC, anon, authenticated;

DO $grant$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_set_sponsor_flags(uuid, boolean, boolean, boolean, boolean, text)',
    'admin_record_company_approval_content(uuid, text, text, text, text)',
    'admin_record_matchmed_approval_content(uuid)',
    'admin_publish_content(uuid)',
    'admin_create_content_replacement(uuid)',
    'admin_withdraw_content(uuid, text)',
    'admin_create_brief_draft(uuid, text, text, text, text)',
    'admin_replace_brief_items(uuid, jsonb)',
    'admin_record_company_approval_brief(uuid, text, text, text, text)',
    'admin_record_matchmed_approval_brief(uuid)',
    'admin_publish_brief(uuid, boolean)',
    'admin_set_brief_state(uuid, text, text)',
    'admin_get_sponsor_preview(text)',
    'admin_rename_public_slug(uuid, text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END;
$grant$;

-- Private brief asset bucket. No anon read.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sponsor-brief-assets',
  'sponsor-brief-assets',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS sponsor_brief_assets_admin_all ON storage.objects;
CREATE POLICY sponsor_brief_assets_admin_all
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'sponsor-brief-assets' AND public.is_atlas_admin())
  WITH CHECK (bucket_id = 'sponsor-brief-assets' AND public.is_atlas_admin());

-- Unpublished draft shells. Profiles stay inactive. Nothing here is approved.
INSERT INTO public.sponsor_brief_issues (vendor_id, issue_slug, audience)
SELECT p.vendor_id, '2026-10', 'both'
FROM public.sponsor_vendor_profiles AS p
JOIN public.vendors AS v ON v.id = p.vendor_id
WHERE v.slug IN ('bausch_plus_lomb', 'johnson_and_johnson_vision')
ON CONFLICT (vendor_id, issue_slug) DO NOTHING;

INSERT INTO public.sponsor_brief_revisions (
  issue_id, vendor_id, revision_number, title, introduction, audience, publication_state
)
SELECT i.id, i.vendor_id, 1,
  v.display_label || ' — October 2026 draft',
  'Unpublished draft. Not approved and not publicly shared.',
  'both',
  'draft'
FROM public.sponsor_brief_issues AS i
JOIN public.vendors AS v ON v.id = i.vendor_id
WHERE i.issue_slug = '2026-10'
  AND NOT EXISTS (
    SELECT 1 FROM public.sponsor_brief_revisions AS r WHERE r.issue_id = i.id
  );
