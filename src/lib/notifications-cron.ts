import { createServiceClient } from '@/lib/supabase-service'
import {
  buildConnectEmail,
  buildDigestEmail,
  buildEmployerConnectEmail,
  employerConnectEmailsEnabled,
  sendResendEmail,
  type DigestItem,
} from '@/lib/notifications-email'
import { captureServerEvent } from '@/lib/posthog-server'

export type NotificationCronResult = {
  regionMilestones: number
  transactionalClaimed: number
  transactionalSent: number
  transactionalSkipped: number
  transactionalFailed: number
  employerClaimed: number
  employerSent: number
  employerFailed: number
  digestClaimed: number
  digestSent: number
  digestSkipped: number
  digestFailed: number
}

type TxnClaimRow = {
  batch_id: string
  notification_id: string
  physician_profile_id: string
  email: string
  notification_type: string
  title: string
  body: string
  deep_link: string
  payload: Record<string, unknown> | null
  status: string
}

type EmployerClaimRow = {
  outbox_id: string
  relationship_id: string
  practice_id: string
  recipient_user_id: string
  email: string
  email_kind: string
  title: string
  body: string
  deep_link: string
  payload: Record<string, unknown> | null
  status: string
}

type DigestClaimRow = {
  batch_id: string
  physician_profile_id: string
  email: string
  status: string
  items: DigestItem[] | null
}

export async function runNotificationsCron(options: {
  includeDigest?: boolean
}): Promise<NotificationCronResult> {
  const supabase = createServiceClient()
  const result: NotificationCronResult = {
    regionMilestones: 0,
    transactionalClaimed: 0,
    transactionalSent: 0,
    transactionalSkipped: 0,
    transactionalFailed: 0,
    employerClaimed: 0,
    employerSent: 0,
    employerFailed: 0,
    digestClaimed: 0,
    digestSent: 0,
    digestSkipped: 0,
    digestFailed: 0,
  }

  const { data: milestoneCount, error: milestoneError } = await supabase.rpc(
    'notifications_process_region_milestones',
  )
  if (!milestoneError && typeof milestoneCount === 'number') {
    result.regionMilestones = milestoneCount
  }

  const { data: txnRows, error: txnError } = await supabase.rpc(
    'notifications_claim_transactional_emails',
    { p_limit: 50 },
  )
  if (txnError) {
    throw new Error(txnError.message || 'claim_transactional_failed')
  }

  for (const row of (txnRows as TxnClaimRow[] | null) ?? []) {
    result.transactionalClaimed += 1
    if (row.status === 'skipped') {
      result.transactionalSkipped += 1
      continue
    }

    const content = buildConnectEmail({
      title: row.title,
      body: row.body,
      deepLink: row.deep_link,
      notificationType: row.notification_type,
    })
    const send = await sendResendEmail({
      to: row.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })

    if (send.ok) {
      await supabase.rpc('notifications_finalize_email_batch', {
        p_batch_id: row.batch_id,
        p_status: 'sent',
        p_provider_message_id: send.id,
        p_error_detail: null,
      })
      result.transactionalSent += 1
      await captureServerEvent(row.physician_profile_id, 'notification_email_sent', {
        batch_kind: 'connect_immediate',
        notification_type: row.notification_type,
      })
    } else {
      await supabase.rpc('notifications_finalize_email_batch', {
        p_batch_id: row.batch_id,
        p_status: 'failed',
        p_provider_message_id: null,
        p_error_detail: send.error,
      })
      result.transactionalFailed += 1
    }
  }

  if (employerConnectEmailsEnabled(process.env.ENABLE_EMPLOYER_CONNECT_EMAILS)) {
  const { data: employerRows, error: employerError } = await supabase.rpc(
    'connect_claim_employer_emails',
    { p_limit: 50 },
  )
  if (employerError) {
    throw new Error(employerError.message || 'claim_employer_emails_failed')
  }

  for (const row of (employerRows as EmployerClaimRow[] | null) ?? []) {
    result.employerClaimed += 1
    const payload = row.payload ?? {}
    const practiceName = typeof payload.practice_name === 'string' ? payload.practice_name : null
    const identityDisclosed = payload.identity_disclosed === true || row.email_kind === 'connect_accepted'
    const content = buildEmployerConnectEmail({
      title: row.title,
      body: row.body,
      deepLink: row.deep_link,
      emailKind: row.email_kind,
      practiceName,
      identityDisclosed,
    })
    const send = await sendResendEmail({
      to: row.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })

    if (send.ok) {
      await supabase.rpc('connect_finalize_employer_email', {
        p_outbox_id: row.outbox_id,
        p_status: 'sent',
        p_provider_message_id: send.id,
        p_error_detail: null,
      })
      result.employerSent += 1
      await captureServerEvent(row.recipient_user_id, 'notification_email_sent', {
        batch_kind: 'employer_connect',
        email_kind: row.email_kind,
      })
    } else {
      await supabase.rpc('connect_finalize_employer_email', {
        p_outbox_id: row.outbox_id,
        p_status: 'failed',
        p_provider_message_id: null,
        p_error_detail: send.error,
      })
      result.employerFailed += 1
    }
  }
  }

  if (!options.includeDigest) {
    return result
  }

  const { data: digestRows, error: digestError } = await supabase.rpc(
    'notifications_claim_daily_digest',
    { p_limit_physicians: 100 },
  )
  if (digestError) {
    throw new Error(digestError.message || 'claim_digest_failed')
  }

  for (const row of (digestRows as DigestClaimRow[] | null) ?? []) {
    result.digestClaimed += 1
    if (row.status === 'skipped') {
      result.digestSkipped += 1
      continue
    }

    const items = Array.isArray(row.items) ? row.items : []
    if (!items.length) {
      await supabase.rpc('notifications_finalize_email_batch', {
        p_batch_id: row.batch_id,
        p_status: 'skipped',
        p_provider_message_id: null,
        p_error_detail: null,
      })
      result.digestSkipped += 1
      continue
    }

    const content = buildDigestEmail(items)
    const send = await sendResendEmail({
      to: row.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })

    if (send.ok) {
      await supabase.rpc('notifications_finalize_email_batch', {
        p_batch_id: row.batch_id,
        p_status: 'sent',
        p_provider_message_id: send.id,
        p_error_detail: null,
      })
      result.digestSent += 1
      await captureServerEvent(row.physician_profile_id, 'notification_email_sent', {
        batch_kind: 'daily_digest',
        item_count: items.length,
      })
    } else {
      await supabase.rpc('notifications_finalize_email_batch', {
        p_batch_id: row.batch_id,
        p_status: 'failed',
        p_provider_message_id: null,
        p_error_detail: send.error,
      })
      result.digestFailed += 1
    }
  }

  return result
}
