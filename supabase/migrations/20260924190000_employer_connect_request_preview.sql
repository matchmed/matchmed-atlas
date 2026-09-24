-- Pending employer Connect notices may name a broad specialty.
-- Employer email stays the general anonymous sentence and never includes the intro note.
-- Does not update existing outbox rows or employer_notifications rows.

CREATE OR REPLACE FUNCTION public._connect_anonymous_request_notice(
  p_practice text,
  p_clinical_focus text[]
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_practice text := COALESCE(NULLIF(btrim(COALESCE(p_practice, '')), ''), 'your practice');
  v_role text;
BEGIN
  IF COALESCE(array_length(p_clinical_focus, 1), 0) IS DISTINCT FROM 1 THEN
    RETURN format('An anonymous physician sent %s a Connect request.', v_practice);
  END IF;

  v_role := CASE btrim(p_clinical_focus[1])
    WHEN 'Cataract Surgery / Refractive Surgery' THEN 'cataract and refractive surgeon'
    WHEN 'Glaucoma (medical and/or surgical)' THEN 'glaucoma specialist'
    WHEN 'Retinal Diseases +/- Uveitis' THEN 'retina specialist'
    WHEN 'Corneal Disease' THEN 'cornea specialist'
    WHEN 'Dry Eye / Ocular Surface Disease' THEN 'ocular surface specialist'
    WHEN 'Oculoplastics' THEN 'oculoplastics specialist'
    WHEN 'Neuro-ophthalmology / Strabismus' THEN 'neuro-ophthalmologist'
    WHEN 'Pediatric Ophthalmology' THEN 'pediatric ophthalmologist'
    WHEN 'General Ophthalmology (multiple areas)' THEN 'comprehensive ophthalmologist'
    ELSE NULL
  END;

  IF v_role IS NULL THEN
    RETURN format('An anonymous physician sent %s a Connect request.', v_practice);
  END IF;

  RETURN format('An anonymous %s sent %s a Connect request.', v_role, v_practice);
END;
$$;

REVOKE ALL ON FUNCTION public._connect_anonymous_request_notice(text, text[])
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._connect_enqueue_employer_emails(
  p_relationship_id uuid,
  p_practice_id uuid,
  p_email_kind text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_payload jsonb,
  p_dedupe_prefix text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rec record;
  v_n integer := 0;
  v_inserted integer;
  v_practice text;
  v_title text;
  v_body text;
  v_email_body text;
  v_notice_body text;
  v_deep text;
  v_payload jsonb;
  v_disclosed boolean;
  v_who text;
  v_focus text[];
BEGIN
  v_practice := COALESCE(public._notification_practice_label(p_practice_id), 'your practice');
  v_deep := format('/practices/%s/manage/connect?thread=%s', p_practice_id, p_relationship_id);
  v_disclosed := COALESCE((p_payload->>'identity_disclosed')::boolean, false);

  IF p_email_kind = 'connect_requested' THEN
    v_disclosed := false;
    v_title := 'New Connect request';
    v_email_body := format('A physician sent %s a Connect request on Atlas.', v_practice);
    SELECT p.clinical_focus INTO v_focus
    FROM public.connect_relationships AS r
    INNER JOIN public.profiles AS p ON p.id = r.physician_profile_id
    WHERE r.id = p_relationship_id;
    v_notice_body := public._connect_anonymous_request_notice(v_practice, v_focus);
    v_body := v_email_body;
  ELSIF p_email_kind = 'connect_accepted' THEN
    v_disclosed := true;
    v_title := COALESCE(nullif(btrim(p_title), ''), 'Connect request accepted');
    v_body := format('%s This update is for %s.', btrim(regexp_replace(COALESCE(p_body, ''), '\s+', ' ', 'g')), v_practice);
    v_email_body := v_body;
    v_notice_body := v_body;
  ELSIF p_email_kind = 'connect_message' THEN
    v_who := nullif(regexp_replace(COALESCE(p_title, ''), '^New message from\s+', ''), '');
    IF v_disclosed AND v_who IS NOT NULL THEN
      v_title := format('New message from %s', v_who);
      v_body := format('%s sent %s a new message on Atlas.', v_who, v_practice);
    ELSE
      v_disclosed := false;
      v_title := 'New message';
      v_body := format('You have a new message for %s on Atlas.', v_practice);
    END IF;
    v_email_body := v_body;
    v_notice_body := v_body;
  ELSE
    RAISE EXCEPTION 'invalid employer email kind' USING ERRCODE = '22023';
  END IF;

  v_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
    'practice_id', p_practice_id,
    'practice_name', v_practice,
    'connect_id', p_relationship_id,
    'identity_disclosed', v_disclosed
  );
  -- Never keep a message transcript or intro note on the notice payload.
  v_payload := v_payload - 'message_body' - 'body' - 'intro_note';

  FOR v_rec IN
    SELECT * FROM public._connect_practice_editor_recipients(p_practice_id)
  LOOP
    INSERT INTO public.connect_employer_email_outbox (
      relationship_id, practice_id, recipient_user_id, recipient_email,
      email_kind, title, body, deep_link, payload, dedupe_key, status
    ) VALUES (
      p_relationship_id,
      p_practice_id,
      v_rec.user_id,
      v_rec.email,
      p_email_kind,
      v_title,
      v_email_body,
      v_deep,
      v_payload,
      format('%s:%s:%s', p_dedupe_prefix, p_relationship_id, v_rec.user_id),
      'pending'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    INSERT INTO public.employer_notifications (
      recipient_user_id, practice_id, relationship_id, notification_type,
      title, body, payload, deep_link, dedupe_key
    ) VALUES (
      v_rec.user_id,
      p_practice_id,
      p_relationship_id,
      p_email_kind,
      v_title,
      v_notice_body,
      v_payload,
      v_deep,
      format('inapp:%s:%s:%s', p_dedupe_prefix, p_relationship_id, v_rec.user_id)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_n := v_n + COALESCE(v_inserted, 0);
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public._connect_enqueue_employer_emails(uuid, uuid, text, text, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
