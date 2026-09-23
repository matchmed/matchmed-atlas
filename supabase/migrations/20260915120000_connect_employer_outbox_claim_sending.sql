-- MAT-18 follow-up: mark employer outbox rows claimed so concurrent cron flushes cannot double-send.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).

ALTER TABLE public.connect_employer_email_outbox
  DROP CONSTRAINT IF EXISTS connect_employer_email_outbox_status_check;

ALTER TABLE public.connect_employer_email_outbox
  ADD CONSTRAINT connect_employer_email_outbox_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed'));

CREATE OR REPLACE FUNCTION public.connect_claim_employer_emails(p_limit integer DEFAULT 50)
RETURNS TABLE (
  outbox_id uuid,
  relationship_id uuid,
  practice_id uuid,
  recipient_user_id uuid,
  email text,
  email_kind text,
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
BEGIN
  FOR v_row IN
    SELECT o.*
    FROM public.connect_employer_email_outbox AS o
    WHERE o.status = 'pending'
    ORDER BY o.created_at ASC
    LIMIT v_limit
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.connect_employer_email_outbox
    SET status = 'sending'
    WHERE id = v_row.id;

    outbox_id := v_row.id;
    relationship_id := v_row.relationship_id;
    practice_id := v_row.practice_id;
    recipient_user_id := v_row.recipient_user_id;
    email := v_row.recipient_email;
    email_kind := v_row.email_kind;
    title := v_row.title;
    body := v_row.body;
    deep_link := v_row.deep_link;
    payload := v_row.payload;
    status := 'sending';
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_claim_employer_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_claim_employer_emails(integer) TO service_role;
