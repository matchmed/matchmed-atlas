/**
 * Cross-site PostHog identity handoff and first-touch campaign helpers.
 *
 * PostHog captures utm_* natively and stores $initial_utm_* first-touch values
 * in persistence. That survives identify() on the same registrable domain.
 * Marketing hosts (matchmed.app / matchmedatlas.com) and Atlas
 * (atlas.matchmed.app) are not all subdomains of one cookie parent, so we
 * bootstrap distinct_id + session_id from a URL hash and immediately strip it.
 */

export const PH_DISTINCT_ID_PARAM = 'ph_distinct_id'
export const PH_SESSION_ID_PARAM = 'ph_session_id'

const STANDARD_UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

/** Anonymous PostHog IDs are UUID-like; reject anything else before bootstrap. */
const LINKER_ID_RE = /^[A-Za-z0-9_-]{8,128}$/

export function parseLinkerId(raw: string | null | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  if (!LINKER_ID_RE.test(value)) return undefined
  return value
}

export function hasStandardUtmParams(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return STANDARD_UTM_KEYS.some(key => {
    const value = params.get(key)
    return Boolean(value && value.trim())
  })
}

function persistenceKey(token: string): string {
  const safe = token.replace(/\+/g, 'PL').replace(/\//g, 'SL').replace(/=/g, 'EQ')
  return `ph_${safe}_posthog`
}

export function isStoredPostHogIdentified(token: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(persistenceKey(token))
    if (!raw) return false
    const parsed = JSON.parse(raw) as { $user_state?: string }
    return parsed.$user_state === 'identified'
  } catch {
    return false
  }
}

/**
 * Read marketing→Atlas linker params, strip them from the address bar, and
 * return bootstrap IDs. Skips overwrite when Atlas already has an identified user.
 */
export function consumeCrossSiteBootstrap(
  token: string,
): { distinctID?: string; sessionID?: string } | undefined {
  if (typeof window === 'undefined') return undefined

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const distinctID = parseLinkerId(hash.get(PH_DISTINCT_ID_PARAM))
  const sessionID = parseLinkerId(hash.get(PH_SESSION_ID_PARAM))

  if (hash.has(PH_DISTINCT_ID_PARAM) || hash.has(PH_SESSION_ID_PARAM)) {
    hash.delete(PH_DISTINCT_ID_PARAM)
    hash.delete(PH_SESSION_ID_PARAM)
    const nextHash = hash.toString()
    const next = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`
    window.history.replaceState(window.history.state, '', next)
  }

  if (isStoredPostHogIdentified(token)) return undefined
  if (!distinctID && !sessionID) return undefined
  return { distinctID, sessionID }
}
