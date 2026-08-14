/**
 * PostHog property sanitation for public discovery and shared URL privacy.
 * Used by instrumentation-client `before_send`. Pure functions; no PostHog import.
 */

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const UUID_RE = new RegExp(UUID, 'gi')
const PRACTICE_PATH_RE = new RegExp(`\\/practices\\/${UUID}`, 'gi')
const PHYSICIAN_PATH_RE = new RegExp(`\\/physicians\\/${UUID}`, 'gi')

const SENSITIVE_URL_PARAMS = new Set([
  'code',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'error_description',
  'token_hash',
])

const URL_PROPERTY_KEYS = new Set([
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$session_entry_url',
])

const PATH_PROPERTY_KEYS = new Set([
  '$pathname',
  '$prev_pageview_pathname',
  '$session_entry_pathname',
  '$initial_pathname',
])

const PUBLIC_ELEMENT_TEXT_KEYS = new Set([
  '$el_text',
  '$el_text_content',
])

export const PUBLIC_PRACTICE_TITLE = 'Atlas Practice Profile'
export const PUBLIC_PHYSICIAN_TITLE = 'Atlas Physician Profile'

export function extractPathname(raw: string): string {
  const value = String(raw).trim()
  if (!value) return '/'
  try {
    const absolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)
    const url = absolute ? new URL(value) : new URL(value, 'http://local.invalid')
    return url.pathname || '/'
  } catch {
    return value.split(/[?#]/, 1)[0] || '/'
  }
}

export function sanitizePathname(raw: string): string {
  let path = extractPathname(raw)
  path = path.replace(PRACTICE_PATH_RE, '/practices/[practice]')
  path = path.replace(PHYSICIAN_PATH_RE, '/physicians/[physician]')
  return path || '/'
}

export function isAnalyticsPublicDiscoveryPath(rawPath: string | null | undefined): boolean {
  if (rawPath == null) return false
  const sanitized = sanitizePathname(String(rawPath))
  return (
    sanitized === '/' ||
    sanitized === '/practices/[practice]' ||
    sanitized === '/physicians/[physician]'
  )
}

export function publicDiscoveryTitle(rawPath: string): string | null {
  const sanitized = sanitizePathname(rawPath)
  if (sanitized === '/practices/[practice]') return PUBLIC_PRACTICE_TITLE
  if (sanitized === '/physicians/[physician]') return PUBLIC_PHYSICIAN_TITLE
  return null
}

function sanitizeNextParam(raw: string): string {
  try {
    const decoded = decodeURIComponent(raw)
    return sanitizePathname(decoded)
  } catch {
    return sanitizePathname(raw)
  }
}

const LINKER_HASH_PARAMS = new Set(['ph_distinct_id', 'ph_session_id'])

function redactHash(hash: string): string {
  if (hash.length <= 1) return ''
  const hashBody = hash.slice(1)
  if (!hashBody.includes('=')) return ''
  const hashParams = new URLSearchParams(hashBody)
  let changed = false
  for (const key of [...hashParams.keys()]) {
    const lower = key.toLowerCase()
    if (LINKER_HASH_PARAMS.has(lower)) {
      hashParams.delete(key)
      changed = true
    } else if (SENSITIVE_URL_PARAMS.has(lower)) {
      hashParams.set(key, '[redacted]')
      changed = true
    }
  }
  if (!changed) return hash
  const next = hashParams.toString()
  return next ? `#${next}` : ''
}

/**
 * Shared URL sanitation: normalize profile UUIDs, drop discovery query/hash,
 * redact auth tokens, and rewrite `next` to a sanitized path.
 */
export function sanitizeUrlString(raw: string): string {
  if (!raw || raw === '$direct') return raw
  try {
    const absolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)
    const url = absolute ? new URL(raw) : new URL(raw, 'http://local.invalid')
    url.pathname = sanitizePathname(url.pathname)

    const discovery = isAnalyticsPublicDiscoveryPath(url.pathname)
    if (discovery) {
      url.search = ''
      url.hash = ''
    } else {
      for (const key of [...url.searchParams.keys()]) {
        if (SENSITIVE_URL_PARAMS.has(key.toLowerCase())) {
          url.searchParams.set(key, '[redacted]')
        } else if (key.toLowerCase() === 'next') {
          url.searchParams.set(key, sanitizeNextParam(url.searchParams.get(key) || ''))
        }
      }
      url.hash = redactHash(url.hash)
    }

    if (!absolute) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    return url.toString()
  } catch {
    return sanitizePathname(raw).replace(UUID_RE, '[id]')
  }
}

function looksLikeUrl(key: string, value: string): boolean {
  if (value === '$direct') return false
  if (URL_PROPERTY_KEYS.has(key)) return true
  const lower = key.toLowerCase()
  if (lower.includes('referring_domain')) return false
  if (lower.includes('url') || lower.includes('referrer') || lower.includes('href')) return true
  return (
    /^https?:\/\//i.test(value) ||
    value.includes('access_token=') ||
    value.includes('refresh_token=')
  )
}

function looksLikePath(key: string): boolean {
  if (PATH_PROPERTY_KEYS.has(key)) return true
  return key.toLowerCase().includes('pathname')
}

function stripRemainingUuids(value: string): string {
  return value.replace(UUID_RE, '[id]')
}

export function isCampaignAttributionPropertyKey(key: string): boolean {
  const k = key.toLowerCase()
  return k.startsWith('utm_') || k.startsWith('$initial_utm_') || k.startsWith('$session_entry_utm_')
}

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!properties) return properties

  const next: Record<string, unknown> = { ...properties }
  const rawPath =
    (typeof next.$pathname === 'string' && next.$pathname) ||
    (typeof next.$current_url === 'string' && extractPathname(next.$current_url)) ||
    ''
  const discovery = isAnalyticsPublicDiscoveryPath(rawPath)

  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== 'string') continue
    // Keep native campaign properties intact; they are not PII.
    if (isCampaignAttributionPropertyKey(key)) continue

    if (looksLikePath(key)) {
      next[key] = sanitizePathname(value)
      continue
    }
    if (looksLikeUrl(key, value)) {
      next[key] = sanitizeUrlString(value)
      continue
    }
    if (discovery && PUBLIC_ELEMENT_TEXT_KEYS.has(key)) {
      next[key] = ''
      continue
    }
    if (discovery) {
      next[key] = stripRemainingUuids(value)
    }
  }

  if (discovery) {
    const generic = publicDiscoveryTitle(rawPath || '/')
    if (generic) next.$title = generic
    if (typeof next.elements_chain === 'string') {
      next.elements_chain = stripRemainingUuids(next.elements_chain)
    }
  }

  return next
}
