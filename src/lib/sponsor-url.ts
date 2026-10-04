/**
 * Sponsor destination checks.
 *
 * The database function sponsor_https_url_problem enforces the same syntax
 * rules and literal-address rules. Postgres does not resolve DNS, so this
 * module's DNS check is the publication-time control in the Atlas admin
 * server action. Neither layer rechecks DNS when a visitor clicks, so this
 * is not a DNS-rebinding guarantee after publication.
 */

export type SponsorUrlFailure =
  | 'empty'
  | 'malformed'
  | 'scheme'
  | 'protocol-relative'
  | 'credentials'
  | 'local-host'
  | 'private-address'
  | 'context-query'

const CONTEXT_QUERY = /[?&](practice_id|practice|physician_id|physician|user_id|user|npi|reported_in|referral|ref|utm_[a-z0-9]+)=/i

export function sponsorHttpsUrlProblem(raw: string | null | undefined): SponsorUrlFailure | null {
  if (raw == null) return null
  const value = raw.trim()
  if (!value) return 'empty'
  if (/[\s\\]/.test(value) || /[\u0000-\u001f]/.test(value)) return 'malformed'
  if (value.startsWith('//')) return 'protocol-relative'
  if (!value.toLowerCase().startsWith('https://')) return 'scheme'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'malformed'
  }
  if (url.username || url.password) return 'credentials'
  if (url.protocol !== 'https:') return 'scheme'
  if (CONTEXT_QUERY.test(url.search)) return 'context-query'
  const host = url.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return 'local-host'
  }
  if (isBlockedAddress(host)) return 'private-address'
  return null
}

export function normalizeSponsorHttpsUrl(raw: string): string {
  const problem = sponsorHttpsUrlProblem(raw)
  if (problem) throw new Error(problem)
  const url = new URL(raw.trim())
  url.hostname = url.hostname.toLowerCase()
  if (url.port === '443') url.port = ''
  return url.toString()
}

export function isBlockedAddress(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) {
    return true
  }
  const mapped = value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value
  const parts = mapped.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return true
  return false
}
