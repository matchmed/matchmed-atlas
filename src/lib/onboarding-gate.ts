import {
  isPublicPracticeDetailPath,
  isPublicPhysicianDetailPath,
} from '@/lib/public-routes'

/**
 * Paths an authenticated but incomplete user may access without finishing onboarding.
 * Legal pages and canonical public profiles are viewable; they are not an app escape hatch.
 */
export function isOnboardingExemptPath(pathname: string): boolean {
  if (pathname === '/onboarding') return true
  if (
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
  // Incomplete users may open public profile shells (RPC-only / locked analysis).
  if (isPublicPracticeDetailPath(pathname)) return true
  if (isPublicPhysicianDetailPath(pathname)) return true
  return false
}

export function needsOnboardingRedirect(
  profile: { onboarding_complete?: boolean | null } | null | undefined,
): boolean {
  return !profile || profile.onboarding_complete !== true
}
