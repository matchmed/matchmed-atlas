-- MAT-14 Connect V1: mutual-consent physician ↔ practice relationships.
-- Additive only. Does not alter employer_leads or Opportunity publication rules.
-- Writes are RPC-only; clients cannot INSERT/UPDATE/DELETE relationship rows.

-- =============================================================================
-- 1. Physician discoverability preference
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS open_to_practice_connections boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.open_to_practice_connections IS
  'Explicit consent for anonymous employer discovery and practice-initiated Connect. Independent of data_sharing.';

GRANT INSERT (open_to_practice_connections) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (open_to_practice_connections) ON TABLE public.profiles TO authenticated;

-- =============================================================================
-- 2. Relationship + event tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.connect_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  organization_id uuid NULL REFERENCES public.employer_organizations(id),
  initiator_side text NOT NULL,
  initiated_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL,
  opportunity_id uuid NULL
    REFERENCES public.employer_practice_recruiting_opportunities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz NULL,
  responded_by_user_id uuid NULL REFERENCES auth.users(id),
  canceled_at timestamptz NULL,
  canceled_by_user_id uuid NULL REFERENCES auth.users(id),
  disconnected_at timestamptz NULL,
  disconnected_by_side text NULL,
  disconnected_by_user_id uuid NULL REFERENCES auth.users(id),
  CONSTRAINT connect_relationships_initiator_side_check
    CHECK (initiator_side IN ('physician', 'practice')),
  CONSTRAINT connect_relationships_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'canceled', 'disconnected')),
  CONSTRAINT connect_relationships_disconnected_side_check
    CHECK (
      disconnected_by_side IS NULL
      OR disconnected_by_side IN ('physician', 'practice')
    )
);

COMMENT ON TABLE public.connect_relationships IS
  'One durable Connect attempt per row. Terminal states are never reopened; a later attempt creates a new row.';

CREATE UNIQUE INDEX IF NOT EXISTS connect_relationships_one_active_pair
  ON public.connect_relationships (physician_profile_id, practice_id)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS connect_relationships_physician_idx
  ON public.connect_relationships (physician_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS connect_relationships_practice_idx
  ON public.connect_relationships (practice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS connect_relationships_practice_status_idx
  ON public.connect_relationships (practice_id, status);

CREATE TABLE IF NOT EXISTS public.connect_relationship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL
    REFERENCES public.connect_relationships(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid NULL REFERENCES auth.users(id),
  actor_side text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connect_relationship_events_type_check
    CHECK (event_type IN ('requested', 'accepted', 'declined', 'canceled', 'disconnected')),
  CONSTRAINT connect_relationship_events_side_check
    CHECK (actor_side IN ('physician', 'practice', 'system', 'admin'))
);

COMMENT ON TABLE public.connect_relationship_events IS
  'Minimal Connect audit trail for state transitions. No browsing/favorites/CRM PII.';

CREATE INDEX IF NOT EXISTS connect_relationship_events_rel_idx
  ON public.connect_relationship_events (relationship_id, created_at);

-- =============================================================================
-- 3. RLS — SELECT isolation; deny client writes
-- =============================================================================

ALTER TABLE public.connect_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_relationship_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connect_relationships_select ON public.connect_relationships;
CREATE POLICY connect_relationships_select
  ON public.connect_relationships
  FOR SELECT
  TO authenticated
  USING (
    public.is_atlas_admin()
    OR public.can_edit_practice((SELECT auth.uid()), practice_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = physician_profile_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

-- No INSERT/UPDATE/DELETE policies → client writes denied under default-deny RLS.

DROP POLICY IF EXISTS connect_relationship_events_select ON public.connect_relationship_events;
CREATE POLICY connect_relationship_events_select
  ON public.connect_relationship_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.connect_relationships AS r
      WHERE r.id = relationship_id
        AND (
          public.can_edit_practice((SELECT auth.uid()), r.practice_id)
          OR EXISTS (
            SELECT 1
            FROM public.profiles AS p
            WHERE p.id = r.physician_profile_id
              AND p.user_id = (SELECT auth.uid())
              AND p.deleted_at IS NULL
          )
        )
    )
  );

GRANT SELECT ON public.connect_relationships TO authenticated;
GRANT SELECT ON public.connect_relationship_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.connect_relationships FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.connect_relationship_events FROM authenticated;
REVOKE ALL ON TABLE public.connect_relationships FROM anon;
REVOKE ALL ON TABLE public.connect_relationship_events FROM anon;

-- =============================================================================
-- 4. Internal helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.connect_practice_is_eligible(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_practice_id IS NULL THEN false
    ELSE EXISTS (
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
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public._connect_active_organization_id(p_practice_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.organization_id
  FROM public.employer_organization_practices AS l
  INNER JOIN public.employer_organizations AS o
    ON o.id = l.organization_id
  WHERE l.practice_id = p_practice_id
    AND l.status = 'active'
    AND l.relationship = 'operates'
    AND o.status = 'verified'
    AND o.archived_at IS NULL
  ORDER BY l.approved_at DESC NULLS LAST, l.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._connect_caller_physician_profile()
RETURNS public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles AS p
  WHERE p.user_id = (SELECT auth.uid())
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'physician profile required' USING ERRCODE = '42501';
  END IF;

  IF v_profile.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'profile deleted' USING ERRCODE = '42501';
  END IF;

  IF v_profile.onboarding_complete IS NOT TRUE THEN
    RAISE EXCEPTION 'onboarding incomplete' USING ERRCODE = '42501';
  END IF;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_record_event(
  p_relationship_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_actor_side text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.connect_relationship_events (
    relationship_id, event_type, actor_user_id, actor_side, metadata
  ) VALUES (
    p_relationship_id,
    p_event_type,
    p_actor_user_id,
    p_actor_side,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_validate_opportunity(
  p_opportunity_id uuid,
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_opportunity_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employer_practice_recruiting_opportunities AS o
    WHERE o.id = p_opportunity_id
      AND o.practice_id = p_practice_id
  ) THEN
    RAISE EXCEPTION 'opportunity does not belong to practice' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_anonymous_physician_json(p_profile public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'physician_profile_id', p_profile.id,
    'training_status', p_profile.training_status,
    'clinical_focus', to_jsonb(p_profile.clinical_focus),
    'preferred_state', to_jsonb(p_profile.preferred_state),
    'start_year', p_profile.start_year,
    'practice_setting_preference', to_jsonb(p_profile.practice_setting_preference),
    'open_to_practice_connections', p_profile.open_to_practice_connections
  );
$$;

CREATE OR REPLACE FUNCTION public._connect_unlocked_physician_json(p_profile public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'physician_profile_id', p_profile.id,
    'first_name', p_profile.first_name,
    'last_name', p_profile.last_name,
    'email', p_profile.email,
    'phone', p_profile.phone,
    'npi', p_profile.npi,
    'npi_verified', p_profile.npi_verified,
    'training_status', p_profile.training_status,
    'clinical_focus', to_jsonb(p_profile.clinical_focus),
    'preferred_state', to_jsonb(p_profile.preferred_state),
    'start_year', p_profile.start_year,
    'practice_setting_preference', to_jsonb(p_profile.practice_setting_preference),
    'current_practice', p_profile.current_practice,
    'procedures_performed', to_jsonb(p_profile.procedures_performed),
    'procedures_desired', to_jsonb(p_profile.procedures_desired),
    'open_to_practice_connections', p_profile.open_to_practice_connections
  );
$$;

CREATE OR REPLACE FUNCTION public._connect_terminate_for_practice(
  p_practice_id uuid,
  p_actor_user_id uuid,
  p_actor_side text,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connect_relationships%ROWTYPE;
  v_count integer := 0;
  v_meta jsonb;
BEGIN
  v_meta := jsonb_build_object('reason', NULLIF(btrim(COALESCE(p_reason, '')), ''));

  FOR v_row IN
    SELECT *
    FROM public.connect_relationships AS r
    WHERE r.practice_id = p_practice_id
      AND r.status IN ('pending', 'accepted')
    FOR UPDATE
  LOOP
    IF v_row.status = 'pending' THEN
      UPDATE public.connect_relationships
      SET
        status = 'canceled',
        canceled_at = now(),
        canceled_by_user_id = p_actor_user_id,
        updated_at = now()
      WHERE id = v_row.id;

      PERFORM public._connect_record_event(
        v_row.id, 'canceled', p_actor_user_id, p_actor_side, v_meta
      );
    ELSE
      UPDATE public.connect_relationships
      SET
        status = 'disconnected',
        disconnected_at = now(),
        disconnected_by_side = CASE
          WHEN p_actor_side IN ('physician', 'practice') THEN p_actor_side
          ELSE 'practice'
        END,
        disconnected_by_user_id = p_actor_user_id,
        updated_at = now()
      WHERE id = v_row.id;

      PERFORM public._connect_record_event(
        v_row.id, 'disconnected', p_actor_user_id, p_actor_side, v_meta
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_terminate_for_physician(
  p_physician_profile_id uuid,
  p_actor_user_id uuid,
  p_actor_side text,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connect_relationships%ROWTYPE;
  v_count integer := 0;
  v_meta jsonb;
BEGIN
  v_meta := jsonb_build_object('reason', NULLIF(btrim(COALESCE(p_reason, '')), ''));

  FOR v_row IN
    SELECT *
    FROM public.connect_relationships AS r
    WHERE r.physician_profile_id = p_physician_profile_id
      AND r.status IN ('pending', 'accepted')
    FOR UPDATE
  LOOP
    IF v_row.status = 'pending' THEN
      UPDATE public.connect_relationships
      SET
        status = 'canceled',
        canceled_at = now(),
        canceled_by_user_id = p_actor_user_id,
        updated_at = now()
      WHERE id = v_row.id;

      PERFORM public._connect_record_event(
        v_row.id, 'canceled', p_actor_user_id, p_actor_side, v_meta
      );
    ELSE
      UPDATE public.connect_relationships
      SET
        status = 'disconnected',
        disconnected_at = now(),
        disconnected_by_side = 'physician',
        disconnected_by_user_id = p_actor_user_id,
        updated_at = now()
      WHERE id = v_row.id;

      PERFORM public._connect_record_event(
        v_row.id, 'disconnected', p_actor_user_id, p_actor_side, v_meta
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._connect_on_physician_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    PERFORM public._connect_terminate_for_physician(
      NEW.id,
      COALESCE(NEW.user_id, (SELECT auth.uid())),
      'system',
      'physician_soft_deleted'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS connect_on_physician_soft_delete ON public.profiles;
CREATE TRIGGER connect_on_physician_soft_delete
  AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._connect_on_physician_soft_delete();

-- =============================================================================
-- 5. Mutual-consent RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.connect_initiate_by_physician(
  p_practice_id uuid,
  p_opportunity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_org_id uuid;
  v_id uuid;
BEGIN
  v_profile := public._connect_caller_physician_profile();

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.connect_practice_is_eligible(p_practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  PERFORM public._connect_validate_opportunity(p_opportunity_id, p_practice_id);

  IF EXISTS (
    SELECT 1
    FROM public.connect_relationships AS r
    WHERE r.physician_profile_id = v_profile.id
      AND r.practice_id = p_practice_id
      AND r.status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'active Connect relationship already exists' USING ERRCODE = '23505';
  END IF;

  v_org_id := public._connect_active_organization_id(p_practice_id);

  INSERT INTO public.connect_relationships (
    physician_profile_id,
    practice_id,
    organization_id,
    initiator_side,
    initiated_by_user_id,
    status,
    opportunity_id
  ) VALUES (
    v_profile.id,
    p_practice_id,
    v_org_id,
    'physician',
    (SELECT auth.uid()),
    'pending',
    p_opportunity_id
  )
  RETURNING id INTO v_id;

  PERFORM public._connect_record_event(
    v_id,
    'requested',
    (SELECT auth.uid()),
    'physician',
    jsonb_build_object('opportunity_id', p_opportunity_id)
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'pending',
    'initiator_side', 'physician',
    'practice_id', p_practice_id,
    'physician_profile_id', v_profile.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_initiate_by_practice(
  p_practice_id uuid,
  p_physician_profile_id uuid,
  p_opportunity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org_id uuid;
  v_target public.profiles%ROWTYPE;
  v_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL OR p_physician_profile_id IS NULL THEN
    RAISE EXCEPTION 'practice_id and physician_profile_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public.connect_practice_is_eligible(p_practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_target
  FROM public.profiles AS p
  WHERE p.id = p_physician_profile_id;

  IF v_target.id IS NULL
     OR v_target.user_id IS NULL
     OR v_target.deleted_at IS NOT NULL
     OR v_target.onboarding_complete IS NOT TRUE THEN
    RAISE EXCEPTION 'physician is not eligible' USING ERRCODE = '22023';
  END IF;

  IF v_target.open_to_practice_connections IS NOT TRUE THEN
    RAISE EXCEPTION 'physician is not open to practice connections' USING ERRCODE = '22023';
  END IF;

  PERFORM public._connect_validate_opportunity(p_opportunity_id, p_practice_id);

  IF EXISTS (
    SELECT 1
    FROM public.connect_relationships AS r
    WHERE r.physician_profile_id = p_physician_profile_id
      AND r.practice_id = p_practice_id
      AND r.status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'active Connect relationship already exists' USING ERRCODE = '23505';
  END IF;

  v_org_id := public._connect_active_organization_id(p_practice_id);

  INSERT INTO public.connect_relationships (
    physician_profile_id,
    practice_id,
    organization_id,
    initiator_side,
    initiated_by_user_id,
    status,
    opportunity_id
  ) VALUES (
    p_physician_profile_id,
    p_practice_id,
    v_org_id,
    'practice',
    v_uid,
    'pending',
    p_opportunity_id
  )
  RETURNING id INTO v_id;

  PERFORM public._connect_record_event(
    v_id,
    'requested',
    v_uid,
    'practice',
    jsonb_build_object('opportunity_id', p_opportunity_id)
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'pending',
    'initiator_side', 'practice',
    'practice_id', p_practice_id,
    'physician_profile_id', p_physician_profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_accept(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_side text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_relationship_id IS NULL THEN
    RAISE EXCEPTION 'relationship_id required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'relationship is not pending' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  IF v_profile.deleted_at IS NOT NULL OR v_profile.onboarding_complete IS NOT TRUE THEN
    RAISE EXCEPTION 'physician is not eligible' USING ERRCODE = '22023';
  END IF;

  IF NOT public.connect_practice_is_eligible(v_row.practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  -- Recipient only.
  IF v_row.initiator_side = 'physician' THEN
    IF NOT public.can_edit_practice(v_uid, v_row.practice_id) THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'practice';
  ELSE
    IF v_profile.user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'physician';
  END IF;

  UPDATE public.connect_relationships
  SET
    status = 'accepted',
    responded_at = now(),
    responded_by_user_id = v_uid,
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public._connect_record_event(v_row.id, 'accepted', v_uid, v_side, '{}'::jsonb);

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', 'accepted',
    'initiator_side', v_row.initiator_side,
    'practice_id', v_row.practice_id,
    'physician_profile_id', v_row.physician_profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_decline(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_side text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'relationship is not pending' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  IF v_row.initiator_side = 'physician' THEN
    IF NOT public.can_edit_practice(v_uid, v_row.practice_id) THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'practice';
  ELSE
    IF v_profile.user_id IS DISTINCT FROM v_uid OR v_profile.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'physician';
  END IF;

  UPDATE public.connect_relationships
  SET
    status = 'declined',
    responded_at = now(),
    responded_by_user_id = v_uid,
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public._connect_record_event(v_row.id, 'declined', v_uid, v_side, '{}'::jsonb);

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', 'declined',
    'practice_id', v_row.practice_id,
    'physician_profile_id', v_row.physician_profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_cancel(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_side text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'relationship is not pending' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  -- Initiator only.
  IF v_row.initiator_side = 'physician' THEN
    IF v_profile.user_id IS DISTINCT FROM v_uid OR v_profile.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'physician';
  ELSE
    IF NOT public.can_edit_practice(v_uid, v_row.practice_id) THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_side := 'practice';
  END IF;

  UPDATE public.connect_relationships
  SET
    status = 'canceled',
    canceled_at = now(),
    canceled_by_user_id = v_uid,
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public._connect_record_event(v_row.id, 'canceled', v_uid, v_side, '{}'::jsonb);

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', 'canceled',
    'practice_id', v_row.practice_id,
    'physician_profile_id', v_row.physician_profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_disconnect(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_side text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'relationship is not accepted' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  IF v_profile.user_id = v_uid AND v_profile.deleted_at IS NULL THEN
    v_side := 'physician';
  ELSIF public.can_edit_practice(v_uid, v_row.practice_id) THEN
    v_side := 'practice';
  ELSE
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.connect_relationships
  SET
    status = 'disconnected',
    disconnected_at = now(),
    disconnected_by_side = v_side,
    disconnected_by_user_id = v_uid,
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public._connect_record_event(v_row.id, 'disconnected', v_uid, v_side, '{}'::jsonb);

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', 'disconnected',
    'practice_id', v_row.practice_id,
    'physician_profile_id', v_row.physician_profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_list_for_physician()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  v_profile := public._connect_caller_physician_profile();

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id,
      r.practice_id,
      r.status,
      r.initiator_side,
      r.opportunity_id,
      r.created_at,
      r.updated_at,
      r.responded_at,
      r.canceled_at,
      r.disconnected_at,
      r.disconnected_by_side,
      pr.practice_name,
      COALESCE(ep.public_display_name, pr.practice_name) AS display_name,
      public.connect_practice_is_eligible(r.practice_id) AS practice_eligible
    FROM public.connect_relationships AS r
    INNER JOIN public.practices AS pr ON pr.id = r.practice_id
    LEFT JOIN public.employer_practice_profiles AS ep ON ep.practice_id = r.practice_id
    WHERE r.physician_profile_id = v_profile.id
  ) AS x;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_list_for_practice(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id,
      r.practice_id,
      r.status,
      r.initiator_side,
      r.opportunity_id,
      r.created_at,
      r.updated_at,
      r.responded_at,
      r.canceled_at,
      r.disconnected_at,
      r.disconnected_by_side,
      r.physician_profile_id,
      CASE
        WHEN r.status = 'accepted' THEN public._connect_unlocked_physician_json(p)
        ELSE public._connect_anonymous_physician_json(p)
      END AS physician
    FROM public.connect_relationships AS r
    INNER JOIN public.profiles AS p ON p.id = r.physician_profile_id
    WHERE r.practice_id = p_practice_id
  ) AS x;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_get_physician_profile(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row public.connect_relationships%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships
  WHERE id = p_relationship_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'relationship not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'physician profile is locked' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_edit_practice(v_uid, v_row.practice_id)
     AND NOT public.is_atlas_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_row.physician_profile_id;

  IF v_profile.id IS NULL OR v_profile.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'physician profile unavailable' USING ERRCODE = 'P0002';
  END IF;

  RETURN public._connect_unlocked_physician_json(v_profile)
    || jsonb_build_object(
      'relationship_id', v_row.id,
      'practice_id', v_row.practice_id,
      'status', v_row.status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_list_anonymous_physicians(
  p_practice_id uuid,
  p_clinical_focus text DEFAULT NULL,
  p_preferred_state text DEFAULT NULL,
  p_training_status text DEFAULT NULL,
  p_start_year text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  lim integer;
  off integer;
  v_result jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_practice(v_uid, p_practice_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public.connect_practice_is_eligible(p_practice_id) THEN
    RAISE EXCEPTION 'practice is not eligible for Connect' USING ERRCODE = '22023';
  END IF;

  lim := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  off := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.physician_profile_id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      p.id AS physician_profile_id,
      p.training_status,
      p.clinical_focus,
      p.preferred_state,
      p.start_year,
      p.practice_setting_preference
    FROM public.profiles AS p
    WHERE p.user_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.onboarding_complete IS TRUE
      AND p.open_to_practice_connections IS TRUE
      AND (
        p_clinical_focus IS NULL
        OR p_clinical_focus = ANY (COALESCE(p.clinical_focus, ARRAY[]::text[]))
      )
      AND (
        p_preferred_state IS NULL
        OR p_preferred_state = ANY (COALESCE(p.preferred_state, ARRAY[]::text[]))
      )
      AND (
        p_training_status IS NULL
        OR p.training_status = p_training_status
      )
      AND (
        p_start_year IS NULL
        OR p.start_year::text = p_start_year
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.connect_relationships AS r
        WHERE r.physician_profile_id = p.id
          AND r.practice_id = p_practice_id
          AND r.status IN ('pending', 'accepted')
      )
    ORDER BY p.id
    LIMIT lim
    OFFSET off
  ) AS x;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_active_for_pair(
  p_practice_id uuid,
  p_physician_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_physician_id uuid;
  v_row public.connect_relationships%ROWTYPE;
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id required' USING ERRCODE = '22023';
  END IF;

  IF p_physician_profile_id IS NULL THEN
    v_profile := public._connect_caller_physician_profile();
    v_physician_id := v_profile.id;
  ELSE
    -- Practice editors may look up active state for a discoverable physician.
    IF NOT public.can_edit_practice((SELECT auth.uid()), p_practice_id)
       AND NOT public.is_atlas_admin() THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_physician_id := p_physician_profile_id;
  END IF;

  SELECT * INTO v_row
  FROM public.connect_relationships AS r
  WHERE r.practice_id = p_practice_id
    AND r.physician_profile_id = v_physician_id
    AND r.status IN ('pending', 'accepted')
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'initiator_side', v_row.initiator_side,
    'practice_id', v_row.practice_id,
    'physician_profile_id', v_row.physician_profile_id,
    'created_at', v_row.created_at
  );
END;
$$;

-- =============================================================================
-- 6. Grants / revokes
-- =============================================================================

REVOKE ALL ON FUNCTION public.connect_practice_is_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_practice_is_eligible(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_practice_is_eligible(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._connect_active_organization_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_caller_physician_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_record_event(uuid, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_validate_opportunity(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_anonymous_physician_json(public.profiles) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_unlocked_physician_json(public.profiles) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_terminate_for_practice(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_terminate_for_physician(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connect_on_physician_soft_delete() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.connect_initiate_by_physician(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_initiate_by_physician(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_initiate_by_physician(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_initiate_by_practice(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_initiate_by_practice(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_initiate_by_practice(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_accept(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_accept(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_accept(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_decline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_decline(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_decline(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_cancel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_cancel(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_cancel(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_disconnect(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_disconnect(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_disconnect(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_list_for_physician() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_list_for_physician() FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_list_for_physician() TO authenticated;

REVOKE ALL ON FUNCTION public.connect_list_for_practice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_list_for_practice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_list_for_practice(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_get_physician_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_get_physician_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_get_physician_profile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_list_anonymous_physicians(uuid, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_list_anonymous_physicians(uuid, text, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_list_anonymous_physicians(uuid, text, text, text, text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.connect_active_for_pair(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_active_for_pair(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connect_active_for_pair(uuid, uuid) TO authenticated;
