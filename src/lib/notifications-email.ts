// @ts-expect-error TS5097 — node --experimental-strip-types resolves this .ts specifier.
import { emailBody, emailFooter, emailHeader, emailMutedLine, emailShell, emailTitle, escapeHtml, notificationCard, primaryButton, sectionHeading } from './notifications-email-layout.ts'

export type ResendSendResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

function appOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  return raw.replace(/\/$/, '') || 'https://atlas.matchmed.app'
}

export function absoluteEmailLink(path: string, emailClick = false): string {
  if (!path) return appOrigin()
  const base =
    path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${appOrigin()}${path.startsWith('/') ? path : `/${path}`}`
  if (!emailClick) return base
  const join = base.includes('?') ? '&' : '?'
  return `${base}${join}src=notification_email`
}

export async function sendResendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || 'Atlas by MatchMed <notifications@matchmed.app>'

  if (!apiKey) {
    return { ok: false, error: 'missing_resend_api_key' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })

    const json = (await response.json().catch(() => ({}))) as {
      id?: string
      message?: string
      name?: string
    }

    if (!response.ok) {
      return {
        ok: false,
        error: typeof json.message === 'string' ? json.message.slice(0, 200) : `http_${response.status}`,
      }
    }

    if (!json.id) {
      return { ok: false, error: 'missing_provider_id' }
    }

    return { ok: true, id: json.id }
  } catch {
    return { ok: false, error: 'resend_request_failed' }
  }
}

function extractPracticeNameFromConnectBody(body: string): string | null {
  const sent = body.match(/^(.+?) sent you a Connect request\.?$/i)
  if (sent?.[1]) return sent[1].trim()
  const accepted = body.match(/^(.+?) accepted your Connect request\.?$/i)
  if (accepted?.[1]) return accepted[1].trim()
  const message = body.match(/^(.+?) sent you a new message on Atlas\.?$/i)
  if (message?.[1]) return message[1].trim()
  return null
}

function threadDeepLink(deepLink: string, connectId?: string | null): string {
  const path = deepLink.trim() || '/connect'
  const id = connectId?.trim()
  if (!id || /[?&]thread=/.test(path)) return path
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}thread=${encodeURIComponent(id)}`
}

/** Name only from a structured title. Message text and intro notes are never parsed. */
function disclosedPhysicianName(title: string, kind: 'accepted' | 'message'): string | null {
  const trimmed = title.trim()
  const raw =
    kind === 'message'
      ? trimmed.match(/^New message from\s+(.+)$/i)?.[1]
      : trimmed.match(/^Connect accepted by\s+(.+)$/i)?.[1] ||
        trimmed.match(/^(.+?)\s+accepted your Connect request\.?$/i)?.[1]
  const who = raw?.replace(/\s+/g, ' ').trim() || ''
  if (!who || who.length > 80) return null
  if (/[.!?]/.test(who.replace(/^Dr\./i, ''))) return null
  return who
}

function employersOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_EMPLOYERS_URL ||
    process.env.EMPLOYERS_APP_URL ||
    'https://employers.matchmed.app'
  return raw.replace(/\/$/, '')
}

function absoluteEmployersLink(path: string, emailClick = false): string {
  if (!path) return employersOrigin()
  const base =
    path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${employersOrigin()}${path.startsWith('/') ? path : `/${path}`}`
  if (!emailClick) return base
  const join = base.includes('?') ? '&' : '?'
  return `${base}${join}src=notification_email`
}

function footerBlock(options?: { preferencesUrl?: string; openUrl?: string; openLabel?: string }): string {
  return emailFooter({
    preferencesUrl: options?.preferencesUrl || absoluteEmailLink('/account'),
    openAtlasUrl: options?.openUrl || absoluteEmailLink('/', true),
  })
}

export function buildConnectEmail(input: {
  title: string
  body: string
  deepLink: string
  notificationType?: string
  connectId?: string | null
}): { subject: string; html: string; text: string } {
  const type = input.notificationType || ''
  const link = absoluteEmailLink(threadDeepLink(input.deepLink || '/connect', input.connectId), true)
  const practiceName = extractPracticeNameFromConnectBody(input.body)
  const practice = practiceName || 'a practice'

  let headline = 'New Connect request'
  let ctaLabel = 'View Connect request'
  let subject = 'New Connect request'
  let bodyCopy = `${practice === 'a practice' ? 'A practice' : practice} would like to connect with you on Atlas.`
  let preheader = practiceName
    ? `${practiceName} would like to connect with you.`
    : 'A practice would like to connect with you.'

  if (type === 'connect_message' || /new message/i.test(input.title)) {
    headline = 'New message'
    ctaLabel = 'Open conversation'
    subject = practiceName ? `New message from ${practiceName}` : 'New message on Atlas'
    bodyCopy = practiceName
      ? `${practiceName} sent you a new message on Atlas.`
      : 'You have a new message on Atlas.'
    preheader = practiceName ? `${practiceName} sent you a new message.` : 'You have a new message on Atlas.'
  } else if (type === 'connect_accepted' || /accepted/i.test(input.title)) {
    headline = 'You’re connected'
    ctaLabel = 'Open conversation'
    subject = practiceName
      ? `${practiceName} accepted your Connect request`
      : 'Your Connect request was accepted'
    bodyCopy = practiceName
      ? `${practiceName} accepted your Connect request.`
      : 'Your Connect request was accepted.'
    preheader = practiceName
      ? `You’re now connected with ${practiceName}.`
      : 'You’re now connected.'
  } else if (practiceName) {
    subject = `New Connect request from ${practiceName}`
    bodyCopy = `${practiceName} would like to connect with you on Atlas.`
    preheader = `${practiceName} would like to connect with you.`
  }

  const html = emailShell(
    [
      emailHeader(),
      emailTitle(headline),
      emailBody(bodyCopy),
      primaryButton(link, ctaLabel),
      footerBlock(),
    ].join('\n'),
    { preheader },
  )

  const text = [
    'Atlas by MatchMed',
    '',
    preheader,
    '',
    headline,
    '',
    bodyCopy,
    '',
    `${ctaLabel}: ${link}`,
    '',
    'You’re receiving this because of your Atlas notification preferences.',
    `Manage email preferences: ${absoluteEmailLink('/account')}`,
    `Open Atlas: ${absoluteEmailLink('/', true)}`,
  ].join('\n')

  return { subject, html, text }
}

export function employerConnectEmailsEnabled(value: string | undefined): boolean {
  return value === 'true'
}

/** Employer-side Connect transactional email (Atlas Resend → practice editors). */
export function buildEmployerConnectEmail(input: {
  title: string
  body: string
  deepLink: string
  emailKind?: string
  practiceName?: string | null
  identityDisclosed?: boolean
}): { subject: string; html: string; text: string } {
  const link = absoluteEmployersLink(input.deepLink, true)
  const kind = input.emailKind || ''
  const practice = input.practiceName?.trim() || ''
  const practiceLabel = practice || 'your practice'
  const dashboardUrl = absoluteEmployersLink('/', true)

  let headline = 'Connect update'
  let ctaLabel = 'Open conversation'
  let subject = 'Connect update'
  let bodyCopy = 'There is a Connect update for your practice on Atlas.'
  let preheader = 'There is a Connect update for your practice.'

  if (kind === 'connect_requested') {
    headline = 'New Connect request'
    ctaLabel = 'View Connect request'
    subject = practice ? `New Connect request for ${practice}` : 'New Connect request'
    bodyCopy = `A physician sent ${practiceLabel} a Connect request on Atlas.`
    preheader = `A physician wants to connect with ${practiceLabel}.`
  } else if (kind === 'connect_accepted') {
    headline = 'You’re connected'
    ctaLabel = 'Open conversation'
    const who = input.identityDisclosed === false ? null : disclosedPhysicianName(input.title, 'accepted')
    subject = who && practice
      ? `Connect accepted by ${who} for ${practice}`
      : who
        ? `Connect accepted by ${who}`
        : practice
          ? `Connect request accepted for ${practice}`
          : 'Connect request accepted'
    bodyCopy = who
      ? `${who} accepted your Connect request on Atlas.`
      : `A physician accepted a Connect request for ${practiceLabel}.`
    preheader = who
      ? `${who} accepted ${practiceLabel}’s Connect request.`
      : `A physician accepted ${practiceLabel}’s Connect request.`
  } else if (kind === 'connect_message') {
    headline = 'New message'
    ctaLabel = 'Open conversation'
    const who =
      input.identityDisclosed === true ? disclosedPhysicianName(input.title, 'message') : null
    if (who) {
      subject = `New message from ${who}`
      bodyCopy = `${who} sent ${practiceLabel} a new message on Atlas.`
      preheader = `${who} sent ${practiceLabel} a new message.`
    } else {
      subject = 'New message'
      bodyCopy = practice
        ? `You have a new message for ${practice} on Atlas.`
        : 'You have a new message on Atlas.'
      preheader = practice ? `You have a new message for ${practice}.` : 'You have a new message.'
    }
  }

  const reason = `You’re receiving this because you manage ${practiceLabel} on Atlas.`
  const html = emailShell(
    [
      emailHeader(),
      emailTitle(headline),
      emailBody(bodyCopy),
      primaryButton(link, ctaLabel),
      emailFooter({
        openAtlasUrl: dashboardUrl,
        openLabel: 'Open practice dashboard',
        reason,
        showPreferences: false,
      }),
    ].join('\n'),
    { preheader },
  )

  const text = [
    'Atlas by MatchMed',
    '',
    preheader,
    '',
    headline,
    '',
    bodyCopy,
    '',
    `${ctaLabel}: ${link}`,
    '',
    reason,
    `Open practice dashboard: ${dashboardUrl}`,
  ].join('\n')

  return { subject, html, text }
}

export type DigestItem = {
  notification_type?: string
  title?: string
  body?: string
  deep_link?: string
  payload?: Record<string, unknown> | null
}

const CAREER_TYPES = new Set([
  'opportunity_matched',
  'opportunity_changed',
  'opportunity_closed',
])

const FOLLOWED_TYPES = new Set([
  'relationship_opportunity_update',
  'relationship_practice_ready',
])

function payloadString(payload: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = payload?.[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function digestCtaLabel(type: string | undefined): string {
  if (type === 'opportunity_matched' || type === 'opportunity_changed') return 'View opportunity'
  if (type === 'opportunity_closed') return 'View practice'
  if (type === 'relationship_practice_ready' || type === 'relationship_opportunity_update') {
    return 'View practice'
  }
  return 'Open notifications'
}

function digestCardHeading(item: DigestItem): string {
  // Prefer a practice-forward heading when title already names the practice.
  const title = (item.title || '').trim()
  if (title) return title
  return 'Update'
}

function digestMetaLines(item: DigestItem): string[] {
  const focus = payloadString(item.payload ?? undefined, 'clinical_focus')
  const lines: string[] = []
  if (focus) lines.push(focus)
  return lines
}

function digestSubject(career: DigestItem[], followed: DigestItem[]): string {
  const matched = career.filter((i) => i.notification_type === 'opportunity_matched')
  if (matched.length === 1) {
    const focus = payloadString(matched[0].payload ?? undefined, 'clinical_focus')
    if (focus) return `New ${focus} opportunity matches your preferences`
    return '1 new opportunity matches your preferences'
  }
  if (matched.length > 1) {
    return `${matched.length} new opportunities match your preferences`
  }
  if (career.length > 0) {
    const changed = career.filter((i) => i.notification_type === 'opportunity_changed').length
    if (changed > 0 && changed === career.length) {
      return changed === 1
        ? 'Opportunity update matching your preferences'
        : `${changed} opportunity updates matching your preferences`
    }
    return 'Career & opportunity updates on Atlas'
  }
  if (followed.length === 1) {
    const title = (followed[0].title || '').trim()
    if (title) return title
    return 'Update from a practice you follow'
  }
  if (followed.length > 1) {
    return 'Updates from practices you follow'
  }
  return 'Your Atlas updates'
}

export function buildDigestEmail(items: DigestItem[]): {
  subject: string
  html: string
  text: string
} {
  // Never include deprecated regional milestones in digest email.
  const eligible = items.filter((i) => i.notification_type !== 'region_ready_milestone')
  const career = eligible.filter((i) => CAREER_TYPES.has(i.notification_type || ''))
  const followed = eligible.filter((i) => FOLLOWED_TYPES.has(i.notification_type || ''))

  const subject = digestSubject(career, followed)

  const intro =
    career.length > 0 && followed.length > 0
      ? 'Career matches and meaningful updates from practices you follow.'
      : career.length > 0
        ? 'New career opportunities and updates matching your preferences.'
        : followed.length > 0
          ? 'Meaningful updates from practices you’ve favorited or connected with.'
          : 'Updates from Atlas.'

  const rows: string[] = [
    emailHeader(),
    emailTitle('Your Atlas digest'),
    emailMutedLine(intro),
  ]

  const textSections: string[] = ['Atlas by MatchMed', '', 'Your Atlas digest', '', intro, '']

  function pushSection(heading: string, sectionItems: DigestItem[]) {
    if (!sectionItems.length) return
    rows.push(sectionHeading(heading))
    textSections.push(heading)
    for (const item of sectionItems) {
      const href = absoluteEmailLink(item.deep_link || '/notifications', true)
      const cta = digestCtaLabel(item.notification_type)
      const headingText = digestCardHeading(item)
      const body = (item.body || '').trim()
      rows.push(
        notificationCard({
          heading: headingText,
          body: body || undefined,
          metaLines: digestMetaLines(item),
          ctaHref: href,
          ctaLabel: cta,
        }),
      )
      textSections.push(`- ${headingText}${body ? `: ${body}` : ''}`)
      textSections.push(`  ${cta}: ${href}`)
    }
  }

  pushSection('Career & opportunity updates', career)
  pushSection('Practice updates you follow', followed)

  // Secondary path to full inbox (not a competing primary CTA).
  rows.push(`
    <tr>
      <td style="padding:8px 0 0 0;font-family:Arial, Helvetica, sans-serif;">
        <p style="margin:0;font-size:13px;color:#8A8680;">
          <a href="${escapeHtml(absoluteEmailLink('/notifications', true))}" style="color:#8A8680;text-decoration:underline;">
            Open notifications
          </a>
        </p>
      </td>
    </tr>
  `)

  rows.push(footerBlock())

  const html = emailShell(rows.join('\n'))
  const text = [
    ...textSections,
    '',
    `Open notifications: ${absoluteEmailLink('/notifications', true)}`,
    `Manage email preferences: ${absoluteEmailLink('/account')}`,
    `Open Atlas: ${absoluteEmailLink('/', true)}`,
  ].join('\n')

  return { subject, html, text }
}
