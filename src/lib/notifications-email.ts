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

function absoluteLink(path: string, emailClick = false): string {
  if (!path) return appOrigin()
  const base =
    path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${appOrigin()}${path.startsWith('/') ? path : `/${path}`}`
  if (!emailClick) return base
  const join = base.includes('?') ? '&' : '?'
  return `${base}${join}src=notification_email`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendResendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || 'MatchMed Atlas <notifications@matchmed.app>'

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

export function buildConnectEmail(input: {
  title: string
  body: string
  deepLink: string
}): { subject: string; html: string; text: string } {
  const link = absoluteLink(input.deepLink || '/connect', true)
  const subject = input.title
  const text = `${input.body}\n\nOpen Connect: ${link}\n\nManage email preferences: ${absoluteLink('/account')}`
  const html = `
    <div style="font-family:Georgia,serif;color:#141210;line-height:1.5">
      <p style="font-size:18px;font-weight:700;margin:0 0 12px">${escapeHtml(input.title)}</p>
      <p style="margin:0 0 16px">${escapeHtml(input.body)}</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="color:#1C4A45">Open Connect</a></p>
      <p style="font-size:12px;color:#8A8680;margin:0">
        <a href="${escapeHtml(absoluteLink('/account'))}" style="color:#8A8680">Manage email preferences</a>
      </p>
    </div>
  `
  return { subject, html, text }
}

export type DigestItem = {
  notification_type?: string
  title?: string
  body?: string
  deep_link?: string
}

export function buildDigestEmail(items: DigestItem[]): {
  subject: string
  html: string
  text: string
} {
  const matched = items.filter((i) => i.notification_type === 'opportunity_matched')
  const updated = items.filter((i) =>
    ['opportunity_changed', 'opportunity_closed', 'relationship_opportunity_update', 'relationship_practice_ready'].includes(
      i.notification_type || '',
    ),
  )
  const regional = items.filter((i) => i.notification_type === 'region_ready_milestone')

  const subject =
    matched.length > 0
      ? `${matched.length} new ${matched.length === 1 ? 'opportunity matches' : 'opportunities match'} your preferences`
      : updated.length > 0
        ? 'Updates on opportunities you follow'
        : 'Atlas regional growth update'

  const sections: string[] = []
  const textSections: string[] = []

  function pushSection(heading: string, rows: DigestItem[]) {
    if (!rows.length) return
    sections.push(`<h3 style="font-size:15px;margin:20px 0 8px;color:#1C4A45">${escapeHtml(heading)}</h3>`)
    textSections.push(heading)
    for (const row of rows) {
      const title = row.title || 'Update'
      const body = row.body || ''
      const link = absoluteLink(row.deep_link || '/notifications', true)
      sections.push(
        `<p style="margin:0 0 12px"><strong>${escapeHtml(title)}</strong><br/>${escapeHtml(body)}<br/><a href="${escapeHtml(link)}" style="color:#1C4A45">View</a></p>`,
      )
      textSections.push(`- ${title}: ${body}\n  ${link}`)
    }
  }

  pushSection('New opportunities', matched)
  pushSection('Opportunity updates', updated)
  pushSection('Regional Atlas growth', regional)

  const html = `
    <div style="font-family:Georgia,serif;color:#141210;line-height:1.5">
      <p style="font-size:18px;font-weight:700;margin:0 0 8px">Your Atlas digest</p>
      <p style="margin:0 0 8px;color:#5C5852">A summary of career and regional updates relevant to your preferences.</p>
      ${sections.join('\n')}
      <p style="margin:28px 0 8px"><a href="${escapeHtml(absoluteLink('/notifications', true))}" style="color:#1C4A45">Open notifications</a></p>
      <p style="font-size:12px;color:#8A8680;margin:0">
        <a href="${escapeHtml(absoluteLink('/account'))}" style="color:#8A8680">Manage email preferences</a>
      </p>
    </div>
  `
  const text = [
    'Your Atlas digest',
    '',
    ...textSections,
    '',
    `Open notifications: ${absoluteLink('/notifications', true)}`,
    `Manage email preferences: ${absoluteLink('/account')}`,
  ].join('\n')

  return { subject, html, text }
}
