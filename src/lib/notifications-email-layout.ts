/**
 * Email-safe layout primitives for Atlas notification emails.
 * Table-based + inline styles for Gmail / Apple Mail / Outlook.
 */

export const EMAIL_THEME = {
  font: 'Arial, Helvetica, sans-serif',
  pageBg: '#F3F2EF',
  cardBg: '#FFFFFF',
  border: '#E4E1DB',
  text: '#1A1917',
  muted: '#5C5852',
  subtle: '#8A8680',
  brand: '#1C4A45',
  buttonBg: '#1C4A45',
  buttonText: '#FFFFFF',
  divider: '#EEEBE6',
  cardInnerBg: '#FAF9F7',
  maxWidth: 600,
} as const

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function emailHeader(): string {
  return `
    <tr>
      <td style="padding:0 0 28px 0;font-family:${EMAIL_THEME.font};">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${EMAIL_THEME.brand};">
          Atlas by MatchMed
        </p>
      </td>
    </tr>
  `.trim()
}

export function emailTitle(title: string): string {
  return `
    <tr>
      <td style="padding:0 0 12px 0;font-family:${EMAIL_THEME.font};">
        <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:${EMAIL_THEME.text};">
          ${escapeHtml(title)}
        </h1>
      </td>
    </tr>
  `.trim()
}

export function emailBody(text: string): string {
  return `
    <tr>
      <td style="padding:0 0 24px 0;font-family:${EMAIL_THEME.font};">
        <p style="margin:0;font-size:16px;line-height:1.55;color:${EMAIL_THEME.muted};">
          ${escapeHtml(text)}
        </p>
      </td>
    </tr>
  `.trim()
}

export function emailMutedLine(text: string): string {
  return `
    <tr>
      <td style="padding:0 0 24px 0;font-family:${EMAIL_THEME.font};">
        <p style="margin:0;font-size:14px;line-height:1.5;color:${EMAIL_THEME.subtle};">
          ${escapeHtml(text)}
        </p>
      </td>
    </tr>
  `.trim()
}

/** Outlook-safe bulletproof button (VML + HTML). */
export function primaryButton(href: string, label: string): string {
  const safeHref = escapeHtml(href)
  const safeLabel = escapeHtml(label)
  return `
    <tr>
      <td style="padding:0 0 28px 0;font-family:${EMAIL_THEME.font};">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="14%" stroke="f" fillcolor="${EMAIL_THEME.buttonBg}">
          <w:anchorlock/>
          <center style="color:${EMAIL_THEME.buttonText};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;">
            ${safeLabel}
          </center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${safeHref}"
           style="display:inline-block;background:${EMAIL_THEME.buttonBg};color:${EMAIL_THEME.buttonText};font-family:${EMAIL_THEME.font};font-size:15px;font-weight:600;line-height:44px;text-align:center;text-decoration:none;border-radius:8px;padding:0 22px;min-height:44px;mso-hide:all;">
          ${safeLabel}
        </a>
        <!--<![endif]-->
      </td>
    </tr>
  `.trim()
}

export function notificationCard(input: {
  heading: string
  body?: string
  metaLines?: string[]
  ctaHref: string
  ctaLabel: string
}): string {
  const meta = (input.metaLines || [])
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 4px 0;font-size:13px;line-height:1.4;color:${EMAIL_THEME.subtle};font-family:${EMAIL_THEME.font};">${escapeHtml(line)}</p>`,
    )
    .join('')

  const body = input.body
    ? `<p style="margin:8px 0 0 0;font-size:15px;line-height:1.5;color:${EMAIL_THEME.muted};font-family:${EMAIL_THEME.font};">${escapeHtml(input.body)}</p>`
    : ''

  return `
    <tr>
      <td style="padding:0 0 12px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${EMAIL_THEME.border};border-radius:10px;background:${EMAIL_THEME.cardInnerBg};">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0;font-size:16px;font-weight:700;line-height:1.35;color:${EMAIL_THEME.text};font-family:${EMAIL_THEME.font};">
                ${escapeHtml(input.heading)}
              </p>
              ${meta}
              ${body}
              <p style="margin:14px 0 0 0;font-family:${EMAIL_THEME.font};">
                <a href="${escapeHtml(input.ctaHref)}"
                   style="display:inline-block;background:${EMAIL_THEME.buttonBg};color:${EMAIL_THEME.buttonText};font-size:14px;font-weight:600;line-height:40px;text-align:center;text-decoration:none;border-radius:8px;padding:0 16px;min-height:40px;">
                  ${escapeHtml(input.ctaLabel)}
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `.trim()
}

export function sectionHeading(text: string): string {
  return `
    <tr>
      <td style="padding:8px 0 12px 0;font-family:${EMAIL_THEME.font};">
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${EMAIL_THEME.brand};">
          ${escapeHtml(text)}
        </p>
      </td>
    </tr>
  `.trim()
}

export function emailFooter(input: {
  preferencesUrl: string
  openAtlasUrl: string
}): string {
  return `
    <tr>
      <td style="padding:28px 0 0 0;border-top:1px solid ${EMAIL_THEME.divider};font-family:${EMAIL_THEME.font};">
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:${EMAIL_THEME.text};">
          Atlas by MatchMed
        </p>
        <p style="margin:0 0 12px 0;font-size:12px;line-height:1.5;color:${EMAIL_THEME.subtle};">
          You’re receiving this because of your Atlas notification preferences.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:${EMAIL_THEME.subtle};">
          <a href="${escapeHtml(input.preferencesUrl)}" style="color:${EMAIL_THEME.subtle};text-decoration:underline;">Manage email preferences</a>
          &nbsp;·&nbsp;
          <a href="${escapeHtml(input.openAtlasUrl)}" style="color:${EMAIL_THEME.subtle};text-decoration:underline;">Open Atlas</a>
        </p>
      </td>
    </tr>
  `.trim()
}

export function emailShell(contentRowsHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Atlas by MatchMed</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_THEME.pageBg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    Atlas notification
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_THEME.pageBg};margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_THEME.maxWidth}px;width:100%;background:${EMAIL_THEME.cardBg};border:1px solid ${EMAIL_THEME.border};border-radius:12px;">
          <tr>
            <td style="padding:32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${contentRowsHtml}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
