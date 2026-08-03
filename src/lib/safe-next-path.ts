/**
 * Same-origin post-auth return paths for the public discovery funnel.
 * Only canonical practice/physician profile paths are accepted.
 */

const PROFILE_PATH =
  /^\/(practices|physicians)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const AUTH_LOOP_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/onboarding',
  '/auth/',
] as const

export function isCanonicalProfilePath(pathname: string): boolean {
  return PROFILE_PATH.test(pathname)
}

/**
 * Returns a safe in-app path or null.
 * Rejects external URLs, protocol-relative URLs, malformed paths, and auth loops.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let value = String(raw).trim()
  if (!value) return null

  try {
    value = decodeURIComponent(value)
  } catch {
    return null
  }

  value = value.trim()
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  if (value.includes('\\')) return null
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return null
  if (value.includes('://')) return null

  const pathOnly = value.split(/[?#]/, 1)[0] ?? ''
  if (!pathOnly || pathOnly.includes('..')) return null

  for (const prefix of AUTH_LOOP_PREFIXES) {
    if (pathOnly === prefix || pathOnly.startsWith(prefix)) return null
  }

  if (!PROFILE_PATH.test(pathOnly)) return null
  return pathOnly
}

export function withNextParam(basePath: string, next: string | null | undefined): string {
  const safe = safeNextPath(next)
  if (!safe) return basePath
  const join = basePath.includes('?') ? '&' : '?'
  return `${basePath}${join}next=${encodeURIComponent(safe)}`
}

export function authCallbackUrl(origin: string, next: string | null | undefined): string {
  const safe = safeNextPath(next)
  if (!safe) return `${origin}/auth/callback`
  return `${origin}/auth/callback?next=${encodeURIComponent(safe)}`
}
