const AUTH_PATHS = [
  '/login',
  '/signup',
  '/onboarding',
  '/forgot-password',
  '/auth/set-password',
  '/auth/confirm',
] as const

export function isAuthPage(pathname: string) {
  return AUTH_PATHS.some(path => pathname === path)
}
