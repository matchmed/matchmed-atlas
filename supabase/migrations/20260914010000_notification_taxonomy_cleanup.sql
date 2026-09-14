-- MAT-10 taxonomy cleanup: career / followed-practice / Connect.
-- Disables generic regional milestone notifications (keep silent baseline state).
-- Adds notify_followed_practice_emails; deprecates notify_regional_emails for delivery.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_followed_practice_emails boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.notify_followed_practice_emails IS
  'Digest email for meaningful updates from favorited/connected practices. In-app remains when false.';
COMMENT ON COLUMN public.profiles.notify_career_emails IS
  'Digest email for preference-matched career/opportunity updates. In-app remains when false.';
COMMENT ON COLUMN public.profiles.notify_regional_emails IS
  'Deprecated. Generic regional growth emails are no longer sent. Column retained for compatibility.';
COMMENT ON COLUMN public.profiles.notify_connect_emails IS
  'Transactional Connect emails. In-app Connect state remains when false.';

-- Existing physicians who opted out of career mail start followed-practice off too.
UPDATE public.profiles
SET notify_followed_practice_emails = notify_career_emails
WHERE notify_followed_practice_emails IS DISTINCT FROM notify_career_emails;

-- =============================================================================
-- Opportunity enqueue copy + category semantics (career vs followed)
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

  -- Career & opportunity updates (preference match). One notification per physician+event.
  FOR v_phys IN
    SELECT m.physician_profile_id
    FROM public._notification_matching_physicians(p_clinical_focus, p_practice_id) AS m
  LOOP
    v_matched := array_append(v_matched, v_phys);

    IF p_event = 'matched' THEN
      v_type := 'opportunity_matched';
      v_dedupe := format('opportunity_created:%s:%s', p_opportunity_id, v_phys);
      v_title := format('New %s opportunity matches your preferences', p_clinical_focus);
      v_body := format(
        '%s added a %s opportunity that matches your specialty and preferred locations.',
        v_label, p_clinical_focus
      );
    ELSIF p_event = 'changed' THEN
      v_type := 'opportunity_changed';
      v_dedupe := format('opportunity_changed:%s:%s:%s', p_opportunity_id, p_version, v_phys);
      v_title := format('%s updated a matching opportunity', v_label);
      v_body := format(
        'Hiring timeline or compensation changed for a %s opportunity at %s.',
        p_clinical_focus, v_label
      );
    ELSE
      v_type := 'opportunity_closed';
      v_dedupe := format('opportunity_closed:%s:%s', p_opportunity_id, v_phys);
      v_title := format('A matching %s opportunity is no longer available', p_clinical_focus);
      v_body := format(
        'The %s opportunity at %s is no longer listed on Atlas.',
        p_clinical_focus, v_label
      );
    END IF;

    v_payload := jsonb_build_object(
      'opportunity_id', p_opportunity_id,
      'practice_id', p_practice_id,
      'clinical_focus', p_clinical_focus,
      'event', p_event,
      'version', p_version,
      'category', 'career',
      'match', 'preference'
    );
    v_deep := format('/practices/%s', p_practice_id);

    PERFORM public._notification_insert(
      v_phys, v_type, v_channel, v_dedupe, v_title, v_body, v_payload,
      'practice', p_practice_id, v_deep
    );
  END LOOP;

  -- Practice updates you follow. Skip if already covered by preference match (dedupe).
  FOR v_phys, v_rel IN
    SELECT r.physician_profile_id, r.relationship
    FROM public._notification_related_physicians(p_practice_id) AS r
    WHERE NOT (r.physician_profile_id = ANY (v_matched))
  LOOP
    IF p_event = 'matched' THEN
      v_type := 'relationship_opportunity_update';
      v_dedupe := format('relationship_opp:%s:0:%s', p_opportunity_id, v_phys);
      v_title := format('%s added a new opportunity', v_label);
      v_body := format(
        'A practice you follow posted a %s opportunity.',
        p_clinical_focus
      );
    ELSIF p_event = 'changed' THEN
      v_type := 'relationship_opportunity_update';
      v_dedupe := format('relationship_opp:%s:%s:%s', p_opportunity_id, p_version, v_phys);
      v_title := format('%s updated an opportunity', v_label);
      v_body := format(
        'A practice you follow updated hiring or compensation for a %s opportunity.',
        p_clinical_focus
      );
    ELSE
      v_type := 'relationship_opportunity_update';
      v_dedupe := format('relationship_opp_closed:%s:%s', p_opportunity_id, v_phys);
      v_title := format('%s removed an opportunity', v_label);
      v_body := format(
        'A %s opportunity from a practice you follow is no longer listed.',
        p_clinical_focus
      );
    END IF;

    v_payload := jsonb_build_object(
      'opportunity_id', p_opportunity_id,
      'practice_id', p_practice_id,
      'clinical_focus', p_clinical_focus,
      'event', p_event,
      'version', p_version,
      'relationship', v_rel,
      'category', 'followed_practice'
    );
    v_deep := format('/practices/%s', p_practice_id);

    PERFORM public._notification_insert(
      v_phys, v_type, v_channel, v_dedupe, v_title, v_body, v_payload,
      'practice', p_practice_id, v_deep
    );
  END LOOP;
END;
$$;

-- Followed practice becomes recruiting-visible (no "physician-ready" user wording).
CREATE OR REPLACE FUNCTION public._notification_on_physician_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_opp record;
  v_phys uuid;
  v_rel text;
  v_label text;
  v_matched uuid[];
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
        format('%s is now recruiting on Atlas', v_label),
        format(
          'A practice you follow completed its recruiting profile and is visible on Atlas.'
        ),
        jsonb_build_object(
          'practice_id', NEW.practice_id,
          'relationship', v_rel,
          'category', 'followed_practice'
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

-- Regional milestones: silent baseline only. No notification rows, no email.
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
  v_baselined integer := 0;
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

      IF v_has_baseline THEN
        -- Already baselined: record newly crossed thresholds silently (no notify).
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
        CONTINUE;
      END IF;

      -- First eligibility: silent historical baseline only.
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
      v_baselined := v_baselined + 1;
    END LOOP;
  END LOOP;

  RETURN v_baselined;
END;
$$;

COMMENT ON FUNCTION public.notifications_process_region_milestones() IS
  'Silent regional baseline bookkeeping only. Does not create physician notifications or emails.';

-- Digest claim: career vs followed-practice prefs; never email region_ready_milestone.
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
  v_allow_followed boolean;
BEGIN
  FOR v_phys IN
    SELECT
      p.id AS physician_profile_id,
      p.email,
      COALESCE(p.data_sharing, false) AS data_sharing,
      COALESCE(p.notify_career_emails, true) AS notify_career_emails,
      COALESCE(p.notify_followed_practice_emails, true) AS notify_followed_practice_emails
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
          AND n.notification_type <> 'region_ready_milestone'
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
    v_allow_followed := v_phys.data_sharing AND v_phys.notify_followed_practice_emails;

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
            'opportunity_closed'
          )
          AND v_allow_career
        )
        OR (
          n.notification_type IN (
            'relationship_practice_ready',
            'relationship_opportunity_update'
          )
          AND v_allow_followed
        )
      );

    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
      INSERT INTO public.physician_notification_email_batches (
        physician_profile_id, batch_kind, status, sent_at
      ) VALUES (
        v_phys.physician_profile_id, 'daily_digest', 'skipped', now()
      )
      RETURNING id INTO v_batch_id;

      -- Suppress email for remaining digest rows (muted prefs or deprecated regional).
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
