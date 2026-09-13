-- MAT-10 Physician notifications V1
-- In-app inbox + email digest foundation. No sponsor/messaging scope.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_career_emails boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_regional_emails boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_connect_emails boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.notify_career_emails IS
  'Non-transactional career/opportunity email digest. In-app remains available when false.';
COMMENT ON COLUMN public.profiles.notify_regional_emails IS
  'Regional physician-ready milestone emails. In-app remains available when false.';
COMMENT ON COLUMN public.profiles.notify_connect_emails IS
  'Transactional Connect emails. In-app Connect state remains available when false.';

CREATE TABLE IF NOT EXISTS public.physician_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  delivery_channel text NOT NULL,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  destination_type text NOT NULL,
  destination_id uuid NULL,
  deep_link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL,
  emailed_at timestamptz NULL,
  email_batch_id uuid NULL,
  CONSTRAINT physician_notifications_type_check
    CHECK (notification_type IN (
      'opportunity_matched',
      'opportunity_changed',
      'opportunity_closed',
      'region_ready_milestone',
      'relationship_practice_ready',
      'relationship_opportunity_update',
      'connect_requested',
      'connect_accepted'
    )),
  CONSTRAINT physician_notifications_channel_check
    CHECK (delivery_channel IN ('digest', 'transactional')),
  CONSTRAINT physician_notifications_destination_check
    CHECK (destination_type IN ('opportunities', 'practice', 'connect', 'notifications')),
  CONSTRAINT physician_notifications_dedupe_key_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS physician_notifications_physician_created_idx
  ON public.physician_notifications (physician_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS physician_notifications_unread_idx
  ON public.physician_notifications (physician_profile_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS physician_notifications_digest_pending_idx
  ON public.physician_notifications (physician_profile_id, created_at)
  WHERE emailed_at IS NULL AND delivery_channel = 'digest';
CREATE INDEX IF NOT EXISTS physician_notifications_txn_pending_idx
  ON public.physician_notifications (created_at)
  WHERE emailed_at IS NULL AND delivery_channel = 'transactional';

CREATE TABLE IF NOT EXISTS public.physician_notification_email_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  batch_kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text NULL,
  error_detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  CONSTRAINT physician_notification_email_batches_kind_check
    CHECK (batch_kind IN ('daily_digest', 'connect_immediate')),
  CONSTRAINT physician_notification_email_batches_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS physician_notification_email_batches_physician_idx
  ON public.physician_notification_email_batches (physician_profile_id, created_at DESC);

ALTER TABLE public.physician_notifications
  DROP CONSTRAINT IF EXISTS physician_notifications_email_batch_id_fkey;
ALTER TABLE public.physician_notifications
  ADD CONSTRAINT physician_notifications_email_batch_id_fkey
  FOREIGN KEY (email_batch_id)
  REFERENCES public.physician_notification_email_batches(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.physician_region_ready_milestones (
  physician_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state text NOT NULL,
  milestone integer NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (physician_profile_id, state, milestone),
  CONSTRAINT physician_region_ready_milestones_milestone_check
    -- 0 = silent baseline sentinel (eligible below first public threshold).
    CHECK (milestone IN (0, 3, 5, 10, 25, 50)),
  CONSTRAINT physician_region_ready_milestones_state_check
    CHECK (state ~ '^[A-Z]{2}$')
);

COMMENT ON TABLE public.physician_region_ready_milestones IS
  'Per physician+state regional ready milestones. milestone=0 marks silent geography baseline; 3/5/10/25/50 may be silent (historical) or notified (live crossing).';

CREATE TABLE IF NOT EXISTS public.opportunity_notification_snapshots (
  opportunity_id uuid PRIMARY KEY
    REFERENCES public.employer_practice_recruiting_opportunities(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  clinical_focus text NOT NULL,
  hiring_horizon text NOT NULL,
  base_compensation_min_usd integer NOT NULL,
  base_compensation_max_usd integer NULL,
  base_compensation_max_is_open_ended boolean NOT NULL DEFAULT false,
  first_visible_at timestamptz NULL,
  last_material_version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_notification_snapshots_practice_idx
  ON public.opportunity_notification_snapshots (practice_id);

ALTER TABLE public.physician_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physician_notification_email_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physician_region_ready_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_notification_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS physician_notifications_select_own ON public.physician_notifications;
CREATE POLICY physician_notifications_select_own
  ON public.physician_notifications FOR SELECT TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = physician_profile_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS physician_notifications_update_own_read ON public.physician_notifications;
CREATE POLICY physician_notifications_update_own_read
  ON public.physician_notifications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = physician_profile_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = physician_profile_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

-- Physicians may only flip read_at via direct UPDATE; email/delivery fields stay privileged.
CREATE OR REPLACE FUNCTION public._physician_notifications_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Privileged writers: service_role JWT, or no JWT (SECURITY DEFINER owner / migration).
  IF nullif(current_setting('request.jwt.claim.role', true), '') IS NULL
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.physician_profile_id IS DISTINCT FROM OLD.physician_profile_id
     OR NEW.notification_type IS DISTINCT FROM OLD.notification_type
     OR NEW.delivery_channel IS DISTINCT FROM OLD.delivery_channel
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.destination_type IS DISTINCT FROM OLD.destination_type
     OR NEW.destination_id IS DISTINCT FROM OLD.destination_id
     OR NEW.deep_link IS DISTINCT FROM OLD.deep_link
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.emailed_at IS DISTINCT FROM OLD.emailed_at
     OR NEW.email_batch_id IS DISTINCT FROM OLD.email_batch_id THEN
    RAISE EXCEPTION 'not authorized to modify notification delivery fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS physician_notifications_guard_update ON public.physician_notifications;
CREATE TRIGGER physician_notifications_guard_update
  BEFORE UPDATE ON public.physician_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public._physician_notifications_guard_update();

REVOKE ALL ON TABLE public.physician_notifications FROM anon;
GRANT SELECT, UPDATE ON TABLE public.physician_notifications TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.physician_notifications FROM authenticated;

DROP POLICY IF EXISTS physician_notification_email_batches_select_own
  ON public.physician_notification_email_batches;
CREATE POLICY physician_notification_email_batches_select_own
  ON public.physician_notification_email_batches FOR SELECT TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = physician_profile_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

REVOKE ALL ON TABLE public.physician_notification_email_batches FROM anon;
GRANT SELECT ON TABLE public.physician_notification_email_batches TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.physician_notification_email_batches FROM authenticated;

DROP POLICY IF EXISTS physician_region_ready_milestones_select_own
  ON public.physician_region_ready_milestones;
CREATE POLICY physician_region_ready_milestones_select_own
  ON public.physician_region_ready_milestones FOR SELECT TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = physician_profile_id
        AND p.user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

REVOKE ALL ON TABLE public.physician_region_ready_milestones FROM anon;
GRANT SELECT ON TABLE public.physician_region_ready_milestones TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.physician_region_ready_milestones FROM authenticated;
REVOKE ALL ON TABLE public.opportunity_notification_snapshots FROM anon, authenticated;

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public._notification_practice_label(p_practice_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(
    nullif(btrim(epp.public_display_name), ''),
    nullif(btrim(pr.practice_name), ''),
    'A practice'
  )
  FROM public.practices AS pr
  LEFT JOIN public.employer_practice_profiles AS epp ON epp.practice_id = pr.id
  WHERE pr.id = p_practice_id;
$$;

CREATE OR REPLACE FUNCTION public._notification_opportunity_is_visible(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employer_practice_profiles AS epp
    WHERE epp.practice_id = p_practice_id
      AND epp.physician_ready_at IS NOT NULL
      AND public.employer_overlay_publicly_visible(p_practice_id)
  );
$$;

-- Canonical physician eligibility (aligns with Connect caller gate).
-- Shared profiles is intentional; employer-only users typically have no profiles row.
CREATE OR REPLACE FUNCTION public._notification_is_eligible_physician(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = p_profile_id
      AND p.user_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.onboarding_complete IS TRUE
  );
$$;

COMMENT ON FUNCTION public._notification_is_eligible_physician(uuid) IS
  'Physician notification eligibility: linked auth user + non-deleted + onboarding_complete. Not every profiles row.';

CREATE OR REPLACE FUNCTION public._notification_insert(
  p_physician_profile_id uuid,
  p_type text,
  p_channel text,
  p_dedupe_key text,
  p_title text,
  p_body text,
  p_payload jsonb,
  p_destination_type text,
  p_destination_id uuid,
  p_deep_link text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_physician_profile_id IS NULL
     OR NOT public._notification_is_eligible_physician(p_physician_profile_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.physician_notifications (
    physician_profile_id, notification_type, delivery_channel, dedupe_key,
    title, body, payload, destination_type, destination_id, deep_link
  ) VALUES (
    p_physician_profile_id, p_type, p_channel, p_dedupe_key,
    p_title, p_body, COALESCE(p_payload, '{}'::jsonb),
    p_destination_type, p_destination_id, p_deep_link
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._notification_matching_physicians(
  p_clinical_focus text,
  p_practice_id uuid
)
RETURNS TABLE (physician_profile_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id
  FROM public.profiles AS p
  WHERE p.user_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.onboarding_complete IS TRUE
    AND p.clinical_focus IS NOT NULL
    AND p.preferred_state IS NOT NULL
    AND p_clinical_focus = ANY (p.clinical_focus)
    AND EXISTS (
      SELECT 1
      FROM unnest(public._physician_opportunity_practice_states(p_practice_id)) AS st(state)
      WHERE upper(btrim(st.state)) = ANY (
        SELECT upper(btrim(x)) FROM unnest(p.preferred_state) AS x
      )
    );
$$;

CREATE OR REPLACE FUNCTION public._notification_related_physicians(p_practice_id uuid)
RETURNS TABLE (physician_profile_id uuid, relationship text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT s.physician_id, 'favorite'::text
  FROM public.shortlists AS s
  INNER JOIN public.profiles AS p ON p.id = s.physician_id
  WHERE s.practice_id = p_practice_id
    AND p.user_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.onboarding_complete IS TRUE
  UNION
  SELECT c.physician_profile_id, 'connected'::text
  FROM public.connect_relationships AS c
  INNER JOIN public.profiles AS p ON p.id = c.physician_profile_id
  WHERE c.practice_id = p_practice_id
    AND c.status = 'accepted'
    AND p.user_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.onboarding_complete IS TRUE;
$$;

CREATE OR REPLACE FUNCTION public._notification_material_changed(
  p_old_horizon text, p_old_min integer, p_old_max integer, p_old_open boolean,
  p_new_horizon text, p_new_min integer, p_new_max integer, p_new_open boolean
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    p_old_horizon IS DISTINCT FROM p_new_horizon
    OR p_old_min IS DISTINCT FROM p_new_min
    OR p_old_max IS DISTINCT FROM p_new_max
    OR COALESCE(p_old_open, false) IS DISTINCT FROM COALESCE(p_new_open, false);
$$;

-- =============================================================================
-- Opportunity enqueue + sync triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION public._notification_enqueue_opportunity_event(
  p_opportunity_id uuid,
  p_practice_id uuid,
  p_clinical_focus text,
  p_event text,
  p_version integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label text;
  v_matched uuid[] := ARRAY[]::uuid[];
  v_phys uuid;
  v_rel text;
  v_type text;
  v_channel text := 'digest';
  v_dedupe text;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_deep text;
BEGIN
  IF p_opportunity_id IS NULL OR p_practice_id IS NULL OR p_clinical_focus IS NULL THEN
    RETURN;
  END IF;
  IF p_event NOT IN ('matched', 'changed', 'closed') THEN
    RAISE EXCEPTION 'invalid notification opportunity event: %', p_event USING ERRCODE = '22023';
  END IF;

  v_label := public._notification_practice_label(p_practice_id);

  FOR v_phys IN
    SELECT m.physician_profile_id
    FROM public._notification_matching_physicians(p_clinical_focus, p_practice_id) AS m
  LOOP
    v_matched := array_append(v_matched, v_phys);

    IF p_event = 'matched' THEN
      v_type := 'opportunity_matched';
      v_dedupe := format('opportunity_created:%s:%s', p_opportunity_id, v_phys);
      v_title := 'New opportunity matches your preferences';
      v_body := format(
        '%s posted a %s opportunity that matches your focus and preferred states.',
        v_label, p_clinical_focus
      );
    ELSIF p_event = 'changed' THEN
      v_type := 'opportunity_changed';
      v_dedupe := format('opportunity_changed:%s:%s:%s', p_opportunity_id, p_version, v_phys);
      v_title := 'An opportunity you match was updated';
      v_body := format(
        '%s updated hiring or compensation details for a %s opportunity.',
        v_label, p_clinical_focus
      );
    ELSE
      v_type := 'opportunity_closed';
      v_dedupe := format('opportunity_closed:%s:%s', p_opportunity_id, v_phys);
      v_title := 'A matched opportunity is no longer available';
      v_body := format(
        'A %s opportunity at %s is no longer visible on Atlas.',
        p_clinical_focus, v_label
      );
    END IF;

    v_payload := jsonb_build_object(
      'opportunity_id', p_opportunity_id,
      'practice_id', p_practice_id,
      'clinical_focus', p_clinical_focus,
      'event', p_event,
      'version', p_version,
      'match', 'preference'
    );
    v_deep := format('/practices/%s', p_practice_id);

    PERFORM public._notification_insert(
      v_phys, v_type, v_channel, v_dedupe, v_title, v_body, v_payload,
      'practice', p_practice_id, v_deep
    );
  END LOOP;

  -- Favorites OR accepted Connect. Skip if already preference-matched for same opp.
  FOR v_phys, v_rel IN
    SELECT r.physician_profile_id, r.relationship
    FROM public._notification_related_physicians(p_practice_id) AS r
    WHERE NOT (r.physician_profile_id = ANY (v_matched))
  LOOP
    IF p_event = 'matched' THEN
      v_type := 'relationship_opportunity_update';
      v_dedupe := format('relationship_opp:%s:0:%s', p_opportunity_id, v_phys);
      v_title := 'A saved practice posted a new opportunity';
      v_body := format('%s (%s) posted a %s opportunity.', v_label, v_rel, p_clinical_focus);
    ELSIF p_event = 'changed' THEN
      v_type := 'relationship_opportunity_update';
      v_dedupe := format('relationship_opp:%s:%s:%s', p_opportunity_id, p_version, v_phys);
      v_title := 'A saved practice updated an opportunity';
      v_body := format('%s updated a %s opportunity.', v_label, p_clinical_focus);
    ELSE
      v_type := 'relationship_opportunity_update';
      v_dedupe := format('relationship_opp_closed:%s:%s', p_opportunity_id, v_phys);
      v_title := 'A saved practice opportunity is no longer available';
      v_body := format('A %s opportunity at %s is no longer visible.', p_clinical_focus, v_label);
    END IF;

    v_payload := jsonb_build_object(
      'opportunity_id', p_opportunity_id,
      'practice_id', p_practice_id,
      'clinical_focus', p_clinical_focus,
      'event', p_event,
      'version', p_version,
      'relationship', v_rel
    );
    v_deep := format('/practices/%s', p_practice_id);

    PERFORM public._notification_insert(
      v_phys, v_type, v_channel, v_dedupe, v_title, v_body, v_payload,
      'practice', p_practice_id, v_deep
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._notification_enqueue_opportunity_event(uuid, uuid, text, text, integer)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._notification_sync_opportunity_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snap public.opportunity_notification_snapshots%ROWTYPE;
  v_visible boolean;
  v_was_visible boolean;
  v_version integer;
  v_material boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_snap
    FROM public.opportunity_notification_snapshots AS s
    WHERE s.opportunity_id = OLD.id;

    IF FOUND AND v_snap.first_visible_at IS NOT NULL THEN
      PERFORM public._notification_enqueue_opportunity_event(
        OLD.id, OLD.practice_id, OLD.clinical_focus, 'closed', v_snap.last_material_version
      );
    END IF;

    DELETE FROM public.opportunity_notification_snapshots WHERE opportunity_id = OLD.id;
    RETURN OLD;
  END IF;

  v_visible := public._notification_opportunity_is_visible(NEW.practice_id);

  SELECT * INTO v_snap
  FROM public.opportunity_notification_snapshots AS s
  WHERE s.opportunity_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.opportunity_notification_snapshots (
      opportunity_id, practice_id, clinical_focus, hiring_horizon,
      base_compensation_min_usd, base_compensation_max_usd,
      base_compensation_max_is_open_ended, first_visible_at, last_material_version, updated_at
    ) VALUES (
      NEW.id, NEW.practice_id, NEW.clinical_focus, NEW.hiring_horizon,
      NEW.base_compensation_min_usd, NEW.base_compensation_max_usd,
      COALESCE(NEW.base_compensation_max_is_open_ended, false),
      CASE WHEN v_visible THEN now() ELSE NULL END,
      0,
      now()
    );

    IF v_visible THEN
      PERFORM public._notification_enqueue_opportunity_event(
        NEW.id, NEW.practice_id, NEW.clinical_focus, 'matched', 0
      );
    END IF;
    RETURN NEW;
  END IF;

  v_was_visible := v_snap.first_visible_at IS NOT NULL;
  v_material := public._notification_material_changed(
    v_snap.hiring_horizon, v_snap.base_compensation_min_usd,
    v_snap.base_compensation_max_usd, v_snap.base_compensation_max_is_open_ended,
    NEW.hiring_horizon, NEW.base_compensation_min_usd,
    NEW.base_compensation_max_usd, COALESCE(NEW.base_compensation_max_is_open_ended, false)
  );
  v_version := v_snap.last_material_version;
  IF v_material THEN
    v_version := v_snap.last_material_version + 1;
  END IF;

  IF v_visible AND NOT v_was_visible THEN
    UPDATE public.opportunity_notification_snapshots
    SET
      practice_id = NEW.practice_id,
      clinical_focus = NEW.clinical_focus,
      hiring_horizon = NEW.hiring_horizon,
      base_compensation_min_usd = NEW.base_compensation_min_usd,
      base_compensation_max_usd = NEW.base_compensation_max_usd,
      base_compensation_max_is_open_ended = COALESCE(NEW.base_compensation_max_is_open_ended, false),
      first_visible_at = now(),
      last_material_version = v_version,
      updated_at = now()
    WHERE opportunity_id = NEW.id;

    PERFORM public._notification_enqueue_opportunity_event(
      NEW.id, NEW.practice_id, NEW.clinical_focus, 'matched', v_version
    );
  ELSIF v_visible AND v_was_visible AND v_material THEN
    UPDATE public.opportunity_notification_snapshots
    SET
      practice_id = NEW.practice_id,
      clinical_focus = NEW.clinical_focus,
      hiring_horizon = NEW.hiring_horizon,
      base_compensation_min_usd = NEW.base_compensation_min_usd,
      base_compensation_max_usd = NEW.base_compensation_max_usd,
      base_compensation_max_is_open_ended = COALESCE(NEW.base_compensation_max_is_open_ended, false),
      last_material_version = v_version,
      updated_at = now()
    WHERE opportunity_id = NEW.id;

    PERFORM public._notification_enqueue_opportunity_event(
      NEW.id, NEW.practice_id, NEW.clinical_focus, 'changed', v_version
    );
  ELSIF NOT v_visible AND v_was_visible THEN
    PERFORM public._notification_enqueue_opportunity_event(
      NEW.id, NEW.practice_id, NEW.clinical_focus, 'closed', v_version
    );

    UPDATE public.opportunity_notification_snapshots
    SET
      practice_id = NEW.practice_id,
      clinical_focus = NEW.clinical_focus,
      hiring_horizon = NEW.hiring_horizon,
      base_compensation_min_usd = NEW.base_compensation_min_usd,
      base_compensation_max_usd = NEW.base_compensation_max_usd,
      base_compensation_max_is_open_ended = COALESCE(NEW.base_compensation_max_is_open_ended, false),
      first_visible_at = NULL,
      last_material_version = v_version,
      updated_at = now()
    WHERE opportunity_id = NEW.id;
  ELSE
    UPDATE public.opportunity_notification_snapshots
    SET
      practice_id = NEW.practice_id,
      clinical_focus = NEW.clinical_focus,
      hiring_horizon = NEW.hiring_horizon,
      base_compensation_min_usd = NEW.base_compensation_min_usd,
      base_compensation_max_usd = NEW.base_compensation_max_usd,
      base_compensation_max_is_open_ended = COALESCE(NEW.base_compensation_max_is_open_ended, false),
      last_material_version = v_version,
      updated_at = now()
    WHERE opportunity_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_sync_opportunity_row
  ON public.employer_practice_recruiting_opportunities;
CREATE TRIGGER notification_sync_opportunity_row
  AFTER INSERT OR UPDATE OR DELETE ON public.employer_practice_recruiting_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public._notification_sync_opportunity_row();

-- =============================================================================
-- Physician-ready trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public._notification_on_physician_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_opp record;
  v_label text;
  v_matched uuid[];
  v_phys uuid;
  v_rel text;
BEGIN
  IF OLD.physician_ready_at IS NULL AND NEW.physician_ready_at IS NOT NULL
     AND public.employer_overlay_publicly_visible(NEW.practice_id) THEN

    FOR v_opp IN
      SELECT
        o.id,
        o.practice_id,
        o.clinical_focus,
        o.hiring_horizon,
        o.base_compensation_min_usd,
        o.base_compensation_max_usd,
        o.base_compensation_max_is_open_ended
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.practice_id = NEW.practice_id
    LOOP
      INSERT INTO public.opportunity_notification_snapshots (
        opportunity_id, practice_id, clinical_focus, hiring_horizon,
        base_compensation_min_usd, base_compensation_max_usd,
        base_compensation_max_is_open_ended, first_visible_at, last_material_version, updated_at
      ) VALUES (
        v_opp.id, v_opp.practice_id, v_opp.clinical_focus, v_opp.hiring_horizon,
        v_opp.base_compensation_min_usd, v_opp.base_compensation_max_usd,
        COALESCE(v_opp.base_compensation_max_is_open_ended, false),
        now(), 0, now()
      )
      ON CONFLICT (opportunity_id) DO UPDATE
      SET
        first_visible_at = COALESCE(
          public.opportunity_notification_snapshots.first_visible_at, now()
        ),
        updated_at = now();

      PERFORM public._notification_enqueue_opportunity_event(
        v_opp.id, v_opp.practice_id, v_opp.clinical_focus, 'matched', 0
      );
    END LOOP;

    SELECT COALESCE(array_agg(DISTINCT m.physician_profile_id), ARRAY[]::uuid[])
    INTO v_matched
    FROM public.employer_practice_recruiting_opportunities AS o
    CROSS JOIN LATERAL public._notification_matching_physicians(
      o.clinical_focus, o.practice_id
    ) AS m
    WHERE o.practice_id = NEW.practice_id;

    v_label := public._notification_practice_label(NEW.practice_id);

    FOR v_phys, v_rel IN
      SELECT r.physician_profile_id, r.relationship
      FROM public._notification_related_physicians(NEW.practice_id) AS r
      WHERE NOT (r.physician_profile_id = ANY (v_matched))
    LOOP
      PERFORM public._notification_insert(
        v_phys,
        'relationship_practice_ready',
        'digest',
        format('relationship_ready:%s:%s', NEW.practice_id, v_phys),
        'A saved practice is now physician-ready',
        format('%s is now physician-ready on Atlas.', v_label),
        jsonb_build_object(
          'practice_id', NEW.practice_id,
          'relationship', v_rel
        ),
        'practice',
        NEW.practice_id,
        format('/practices/%s', NEW.practice_id)
      );
    END LOOP;

  ELSIF OLD.physician_ready_at IS NOT NULL AND NEW.physician_ready_at IS NULL THEN
    FOR v_opp IN
      SELECT o.id, o.practice_id, o.clinical_focus, s.last_material_version
      FROM public.employer_practice_recruiting_opportunities AS o
      INNER JOIN public.opportunity_notification_snapshots AS s
        ON s.opportunity_id = o.id
      WHERE o.practice_id = NEW.practice_id
        AND s.first_visible_at IS NOT NULL
    LOOP
      PERFORM public._notification_enqueue_opportunity_event(
        v_opp.id, v_opp.practice_id, v_opp.clinical_focus, 'closed',
        COALESCE(v_opp.last_material_version, 0)
      );
      UPDATE public.opportunity_notification_snapshots
      SET first_visible_at = NULL, updated_at = now()
      WHERE opportunity_id = v_opp.id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_on_physician_ready ON public.employer_practice_profiles;
CREATE TRIGGER notification_on_physician_ready
  AFTER UPDATE OF physician_ready_at ON public.employer_practice_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._notification_on_physician_ready();

-- =============================================================================
-- Connect transactional trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public._notification_on_connect_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel public.connect_relationships%ROWTYPE;
  v_label text;
BEGIN
  SELECT * INTO v_rel
  FROM public.connect_relationships AS c
  WHERE c.id = NEW.relationship_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_label := public._notification_practice_label(v_rel.practice_id);

  IF NEW.event_type = 'requested' AND NEW.actor_side = 'practice' THEN
    PERFORM public._notification_insert(
      v_rel.physician_profile_id,
      'connect_requested',
      'transactional',
      format('connect_requested:%s:%s', v_rel.id, v_rel.physician_profile_id),
      'New Connect request',
      format('%s sent you a Connect request.', v_label),
      jsonb_build_object(
        'connect_id', v_rel.id,
        'practice_id', v_rel.practice_id,
        'event_id', NEW.id
      ),
      'connect',
      v_rel.id,
      '/connect'
    );
  ELSIF NEW.event_type = 'accepted' AND NEW.actor_side = 'practice' THEN
    PERFORM public._notification_insert(
      v_rel.physician_profile_id,
      'connect_accepted',
      'transactional',
      format('connect_accepted:%s:%s', v_rel.id, v_rel.physician_profile_id),
      'Connect request accepted',
      format('%s accepted your Connect request.', v_label),
      jsonb_build_object(
        'connect_id', v_rel.id,
        'practice_id', v_rel.practice_id,
        'event_id', NEW.id
      ),
      'connect',
      v_rel.id,
      '/connect'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_on_connect_event ON public.connect_relationship_events;
CREATE TRIGGER notification_on_connect_event
  AFTER INSERT ON public.connect_relationship_events
  FOR EACH ROW
  EXECUTE FUNCTION public._notification_on_connect_event();

-- =============================================================================
-- Regional milestones (cron) — thresholds 3/5/10/25/50 with silent baselining
-- =============================================================================
-- First time a physician becomes eligible for a geography: silently record all
-- already-crossed milestones (and milestone=0 if count < 3). No notifications.
-- Later crossings after baseline emit once. Prefer preserving rows on remove/re-add.

CREATE OR REPLACE FUNCTION public.notifications_process_region_milestones()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_thresholds integer[] := ARRAY[3, 5, 10, 25, 50];
  v_state text;
  v_count integer;
  v_milestone integer;
  v_phys uuid;
  v_has_baseline boolean;
  v_inserted_phys uuid;
  v_created integer := 0;
  v_notif uuid;
BEGIN
  FOR v_state, v_count IN
    SELECT st.state, COUNT(DISTINCT epp.practice_id)::integer
    FROM public.employer_practice_profiles AS epp
    CROSS JOIN LATERAL unnest(
      public._physician_opportunity_practice_states(epp.practice_id)
    ) AS st(state)
    WHERE epp.physician_ready_at IS NOT NULL
      AND public.employer_overlay_publicly_visible(epp.practice_id)
      AND st.state ~ '^[A-Z]{2}$'
    GROUP BY st.state
  LOOP
    FOR v_phys IN
      SELECT p.id
      FROM public.profiles AS p
      WHERE p.user_id IS NOT NULL
        AND p.deleted_at IS NULL
        AND p.onboarding_complete IS TRUE
        AND p.preferred_state IS NOT NULL
        AND upper(v_state) = ANY (
          SELECT upper(btrim(x)) FROM unnest(p.preferred_state) AS x
        )
    LOOP
      SELECT EXISTS (
        SELECT 1
        FROM public.physician_region_ready_milestones AS m
        WHERE m.physician_profile_id = v_phys
          AND m.state = upper(v_state)
      ) INTO v_has_baseline;

      IF NOT v_has_baseline THEN
        -- Silent historical baseline for this physician+state.
        IF v_count < 3 THEN
          INSERT INTO public.physician_region_ready_milestones (
            physician_profile_id, state, milestone
          ) VALUES (
            v_phys, upper(v_state), 0
          )
          ON CONFLICT DO NOTHING;
        END IF;

        FOREACH v_milestone IN ARRAY v_thresholds
        LOOP
          IF v_count < v_milestone THEN
            CONTINUE;
          END IF;
          INSERT INTO public.physician_region_ready_milestones (
            physician_profile_id, state, milestone
          ) VALUES (
            v_phys, upper(v_state), v_milestone
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
        -- No notifications on baseline.
        CONTINUE;
      END IF;

      -- Already baselined: emit only newly crossed public thresholds.
      FOREACH v_milestone IN ARRAY v_thresholds
      LOOP
        IF v_count < v_milestone THEN
          CONTINUE;
        END IF;

        INSERT INTO public.physician_region_ready_milestones (
          physician_profile_id, state, milestone
        ) VALUES (
          v_phys, upper(v_state), v_milestone
        )
        ON CONFLICT DO NOTHING
        RETURNING physician_profile_id INTO v_inserted_phys;

        IF v_inserted_phys IS NOT NULL THEN
          v_notif := public._notification_insert(
            v_inserted_phys,
            'region_ready_milestone',
            'digest',
            format(
              'region_ready:%s:%s:%s',
              upper(v_state), v_milestone, v_inserted_phys
            ),
            format(
              '%s practices are physician-ready in %s',
              v_milestone, upper(v_state)
            ),
            format(
              '%s practices in %s are now physician-ready on Atlas.',
              v_milestone, upper(v_state)
            ),
            jsonb_build_object(
              'state', upper(v_state),
              'milestone', v_milestone,
              'ready_count', v_count,
              'baseline', false
            ),
            'opportunities',
            NULL,
            '/opportunities'
          );
          IF v_notif IS NOT NULL THEN
            v_created := v_created + 1;
          END IF;
          v_inserted_phys := NULL;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.notifications_process_region_milestones() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notifications_process_region_milestones() TO service_role;

-- =============================================================================
-- Physician inbox RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notifications_list_mine(
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  notification_type text,
  delivery_channel text,
  title text,
  body text,
  payload jsonb,
  destination_type text,
  destination_id uuid,
  deep_link text,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_profile_id uuid;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles AS p
  WHERE p.user_id = v_uid AND p.deleted_at IS NULL;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.notification_type,
    n.delivery_channel,
    n.title,
    n.body,
    n.payload,
    n.destination_type,
    n.destination_id,
    n.deep_link,
    n.created_at,
    n.read_at
  FROM public.physician_notifications AS n
  WHERE n.physician_profile_id = v_profile_id
    AND (p_before IS NULL OR n.created_at < p_before)
  ORDER BY n.created_at DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.notifications_unread_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_profile_id uuid;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles AS p
  WHERE p.user_id = v_uid AND p.deleted_at IS NULL;

  IF v_profile_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.physician_notifications AS n
  WHERE n.physician_profile_id = v_profile_id
    AND n.read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.notifications_mark_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_profile_id uuid;
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_notification_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles AS p
  WHERE p.user_id = v_uid AND p.deleted_at IS NULL;

  IF v_profile_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.physician_notifications AS n
  SET read_at = COALESCE(n.read_at, now())
  WHERE n.id = p_notification_id
    AND n.physician_profile_id = v_profile_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.notifications_mark_all_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_profile_id uuid;
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles AS p
  WHERE p.user_id = v_uid AND p.deleted_at IS NULL;

  IF v_profile_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.physician_notifications AS n
  SET read_at = now()
  WHERE n.physician_profile_id = v_profile_id
    AND n.read_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN COALESCE(v_updated, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.notifications_list_mine(integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_unread_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_mark_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_mark_all_read() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.notifications_list_mine(integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_mark_all_read() TO authenticated;

-- =============================================================================
-- Service-role claim / finalize helpers (transactional + daily digest)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notifications_claim_transactional_emails(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  batch_id uuid,
  notification_id uuid,
  physician_profile_id uuid,
  email text,
  notification_type text,
  title text,
  body text,
  deep_link text,
  payload jsonb,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_row record;
  v_batch_id uuid;
  v_status text;
BEGIN
  FOR v_row IN
    SELECT
      n.id AS notification_id,
      n.physician_profile_id,
      n.notification_type,
      n.title,
      n.body,
      n.deep_link,
      n.payload,
      p.email,
      COALESCE(p.notify_connect_emails, true) AS allow_email
    FROM public.physician_notifications AS n
    INNER JOIN public.profiles AS p ON p.id = n.physician_profile_id
    WHERE n.emailed_at IS NULL
      AND n.email_batch_id IS NULL
      AND n.delivery_channel = 'transactional'
      AND p.user_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.onboarding_complete IS TRUE
      AND nullif(btrim(COALESCE(p.email, '')), '') IS NOT NULL
    ORDER BY n.created_at ASC
    LIMIT v_limit
    FOR UPDATE OF n SKIP LOCKED
  LOOP
    -- notify_connect_emails=false suppresses email only; in-app row already exists.
    IF v_row.allow_email THEN
      v_status := 'pending';
    ELSE
      v_status := 'skipped';
    END IF;

    INSERT INTO public.physician_notification_email_batches (
      physician_profile_id, batch_kind, status
    ) VALUES (
      v_row.physician_profile_id, 'connect_immediate', v_status
    )
    RETURNING id INTO v_batch_id;

    IF v_status = 'skipped' THEN
      UPDATE public.physician_notifications
      SET emailed_at = now(), email_batch_id = v_batch_id
      WHERE id = v_row.notification_id;
    ELSE
      UPDATE public.physician_notifications
      SET email_batch_id = v_batch_id
      WHERE id = v_row.notification_id;
    END IF;

    batch_id := v_batch_id;
    notification_id := v_row.notification_id;
    physician_profile_id := v_row.physician_profile_id;
    email := v_row.email;
    notification_type := v_row.notification_type;
    title := v_row.title;
    body := v_row.body;
    deep_link := v_row.deep_link;
    payload := v_row.payload;
    status := v_status;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.notifications_claim_daily_digest(
  p_limit_physicians integer DEFAULT 100
)
RETURNS TABLE (
  batch_id uuid,
  physician_profile_id uuid,
  email text,
  status text,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit_physicians, 100), 500));
  v_phys record;
  v_batch_id uuid;
  v_items jsonb;
  v_ids uuid[];
  v_allow_career boolean;
  v_allow_regional boolean;
BEGIN
  FOR v_phys IN
    SELECT
      p.id AS physician_profile_id,
      p.email,
      COALESCE(p.data_sharing, false) AS data_sharing,
      COALESCE(p.notify_career_emails, true) AS notify_career_emails,
      COALESCE(p.notify_regional_emails, true) AS notify_regional_emails
    FROM public.profiles AS p
    WHERE p.user_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.onboarding_complete IS TRUE
      AND nullif(btrim(COALESCE(p.email, '')), '') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.physician_notifications AS n
        WHERE n.physician_profile_id = p.id
          AND n.emailed_at IS NULL
          AND n.email_batch_id IS NULL
          AND n.delivery_channel = 'digest'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.physician_notification_email_batches AS b
        WHERE b.physician_profile_id = p.id
          AND b.batch_kind = 'daily_digest'
          AND b.status = 'sent'
          AND b.sent_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
      )
    ORDER BY p.id
    LIMIT v_limit
  LOOP
    v_allow_career := v_phys.data_sharing AND v_phys.notify_career_emails;
    v_allow_regional := v_phys.data_sharing AND v_phys.notify_regional_emails;

    SELECT
      COALESCE(array_agg(n.id ORDER BY n.created_at), ARRAY[]::uuid[]),
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', n.id,
            'notification_type', n.notification_type,
            'title', n.title,
            'body', n.body,
            'deep_link', n.deep_link,
            'payload', n.payload,
            'created_at', n.created_at
          )
          ORDER BY n.created_at
        ),
        '[]'::jsonb
      )
    INTO v_ids, v_items
    FROM public.physician_notifications AS n
    WHERE n.physician_profile_id = v_phys.physician_profile_id
      AND n.emailed_at IS NULL
      AND n.email_batch_id IS NULL
      AND n.delivery_channel = 'digest'
      AND (
        (
          n.notification_type IN (
            'opportunity_matched',
            'opportunity_changed',
            'opportunity_closed',
            'relationship_practice_ready',
            'relationship_opportunity_update'
          )
          AND v_allow_career
        )
        OR (
          n.notification_type = 'region_ready_milestone'
          AND v_allow_regional
        )
      );

    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
      INSERT INTO public.physician_notification_email_batches (
        physician_profile_id, batch_kind, status, sent_at
      ) VALUES (
        v_phys.physician_profile_id, 'daily_digest', 'skipped', now()
      )
      RETURNING id INTO v_batch_id;

      UPDATE public.physician_notifications AS n
      SET emailed_at = now(), email_batch_id = v_batch_id
      WHERE n.physician_profile_id = v_phys.physician_profile_id
        AND n.emailed_at IS NULL
        AND n.email_batch_id IS NULL
        AND n.delivery_channel = 'digest';

      batch_id := v_batch_id;
      physician_profile_id := v_phys.physician_profile_id;
      email := v_phys.email;
      status := 'skipped';
      items := '[]'::jsonb;
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.physician_notification_email_batches (
      physician_profile_id, batch_kind, status
    ) VALUES (
      v_phys.physician_profile_id, 'daily_digest', 'pending'
    )
    RETURNING id INTO v_batch_id;

    UPDATE public.physician_notifications AS n
    SET email_batch_id = v_batch_id
    WHERE n.id = ANY (v_ids);

    -- Preference-muted digest rows stay in-app but must not re-enter daily claims forever.
    UPDATE public.physician_notifications AS n
    SET emailed_at = now(), email_batch_id = v_batch_id
    WHERE n.physician_profile_id = v_phys.physician_profile_id
      AND n.emailed_at IS NULL
      AND n.email_batch_id IS NULL
      AND n.delivery_channel = 'digest'
      AND NOT (n.id = ANY (v_ids));

    batch_id := v_batch_id;
    physician_profile_id := v_phys.physician_profile_id;
    email := v_phys.email;
    status := 'pending';
    items := v_items;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.notifications_finalize_email_batch(
  p_batch_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_batch_id IS NULL THEN
    RETURN;
  END IF;
  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid batch status: %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.physician_notification_email_batches AS b
  SET
    status = p_status,
    provider_message_id = COALESCE(p_provider_message_id, b.provider_message_id),
    error_detail = CASE
      WHEN p_status = 'failed' THEN left(COALESCE(p_error_detail, ''), 2000)
      ELSE NULL
    END,
    sent_at = CASE WHEN p_status IN ('sent', 'skipped') THEN now() ELSE b.sent_at END
  WHERE b.id = p_batch_id;

  IF p_status IN ('sent', 'skipped') THEN
    UPDATE public.physician_notifications AS n
    SET emailed_at = COALESCE(n.emailed_at, now())
    WHERE n.email_batch_id = p_batch_id;
  ELSIF p_status = 'failed' THEN
    UPDATE public.physician_notifications AS n
    SET email_batch_id = NULL
    WHERE n.email_batch_id = p_batch_id
      AND n.emailed_at IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notifications_claim_transactional_emails(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_claim_daily_digest(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_finalize_email_batch(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.notifications_claim_transactional_emails(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_claim_daily_digest(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_finalize_email_batch(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public._notification_practice_label(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._notification_opportunity_is_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._notification_is_eligible_physician(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._notification_insert(uuid, text, text, text, text, text, jsonb, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._notification_matching_physicians(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._notification_related_physicians(uuid) FROM PUBLIC;
