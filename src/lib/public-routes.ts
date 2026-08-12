/**
 * Public discovery route helpers (proxy allowlist + chrome + privacy).
 */

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const PRACTICE_DETAIL = new RegExp(`^/practices/${UUID}$`, 'i')
const PHYSICIAN_DETAIL = new RegExp(`^/physicians/${UUID}$`, 'i')

export function isPublicPracticeDetailPath(pathname: string): boolean {
  return PRACTICE_DETAIL.test(pathname)
}

export function isPublicPhysicianDetailPath(pathname: string): boolean {
  return PHYSICIAN_DETAIL.test(pathname)
}

/** Anonymous practice/physician profile pages (excludes public home). */
export function isPublicProfileDetailPath(pathname: string): boolean {
  return isPublicPracticeDetailPath(pathname) || isPublicPhysicianDetailPath(pathname)
}

/** Routes anonymous visitors may open without logging in. */
export function isAnonymousAllowlistedPath(pathname: string): boolean {
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/terms-and-conditions' ||
    pathname === '/privacy-policy' ||
    pathname === '/scoring-methodology'
  ) {
    return true
  }
  if (pathname.startsWith('/auth/')) return true
  if (isPublicPracticeDetailPath(pathname)) return true
  if (isPublicPhysicianDetailPath(pathname)) return true
  return false
}

/**
 * Canonical public discovery surfaces where session replay must not run
 * (including for authenticated visitors).
 */
export function isPublicDiscoveryPath(pathname: string): boolean {
  if (pathname === '/') return true
  if (isPublicPracticeDetailPath(pathname)) return true
  if (isPublicPhysicianDetailPath(pathname)) return true
  return false
}
