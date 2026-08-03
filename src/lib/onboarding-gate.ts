/**
 * Paths an authenticated but incomplete user may access without finishing onboarding.
 * Legal pages are public informational routes, not an app escape hatch.
 */
export function isOnboardingExemptPath(pathname: string): boolean {
  if (pathname === '/onboarding') return true
  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/terms-and-conditions' ||
    pathname === '/privacy-policy'
  ) {
    return true
  }
  if (pathname.startsWith('/auth/')) return true
  return false
}

export function needsOnboardingRedirect(
  profile: { onboarding_complete?: boolean | null } | null | undefined,
): boolean {
  return !profile || profile.onboarding_complete !== true
}
