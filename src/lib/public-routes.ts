/**
 * Public discovery route helpers (proxy allowlist + chrome + privacy).
 */
import { PUBLIC_SPONSOR_BRIEFS_ANONYMOUS } from './sponsor-launch'

const PUBLIC_BRIEF = /^\/partners\/[a-z0-9]+(?:-[a-z0-9]+)*\/briefs\/[0-9]{4}-[0-9]{2}$/

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const PRACTICE_DETAIL = new RegExp(`^/practices/${UUID}$`, 'i')
const PRACTICE_EMPLOYER_PREVIEW = new RegExp(`^/practices/${UUID}/employer-preview$`, 'i')
const PHYSICIAN_DETAIL = new RegExp(`^/physicians/${UUID}$`, 'i')

export function isPublicPracticeDetailPath(pathname: string): boolean {
  return PRACTICE_DETAIL.test(pathname)
}

/** Token-gated employer preview of the physician-facing practice page. */
export function isEmployerPreviewPath(pathname: string): boolean {
  return PRACTICE_EMPLOYER_PREVIEW.test(pathname)
}

export function isPublicPhysicianDetailPath(pathname: string): boolean {
  return PHYSICIAN_DETAIL.test(pathname)
}

/** Canonical public brief. Anonymous access stays off until launch flips the flag. */
export function isPublicSponsorBriefPath(pathname: string): boolean {
  return PUBLIC_SPONSOR_BRIEFS_ANONYMOUS && PUBLIC_BRIEF.test(pathname)
}

/** Anonymous practice/physician profile pages (excludes public home). */
export function isPublicProfileDetailPath(pathname: string): boolean {
  return isPublicPracticeDetailPath(pathname) || isPublicPhysicianDetailPath(pathname)
}

/**
 * PostHog reverse-proxy paths (`api_host: '/ingest'`).
 * These are not application routes and must not share the public page allowlist.
 */
export function isPostHogIngestPath(pathname: string): boolean {
  return pathname === '/ingest' || pathname.startsWith('/ingest/')
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
  if (isEmployerPreviewPath(pathname)) return true
  if (isPublicPhysicianDetailPath(pathname)) return true
  if (isPublicSponsorBriefPath(pathname)) return true
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
  if (isPublicSponsorBriefPath(pathname)) return true
  return false
}
