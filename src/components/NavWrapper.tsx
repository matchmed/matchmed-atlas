'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'
import Logo from '@/components/Logo'
import Nav from '@/components/Nav'
import { createClient } from '@/lib/supabase'
import { isAuthPage } from '@/lib/auth-paths'
import { isPublicDiscoveryPath } from '@/lib/public-routes'

function PublicChrome() {
  return (
    <header className="public-chrome">
      <Link href="/" className="public-chrome-brand" aria-label="MatchMed Atlas home">
        <Logo size="sm" />
      </Link>
      <nav className="public-chrome-actions" aria-label="Account">
        <Link href="/login" className="public-chrome-link">
          Log in
        </Link>
        <Link href="/signup" className="public-chrome-button" aria-label="Create free account">
          <span className="public-chrome-cta-full" aria-hidden="true">Create free account</span>
          <span className="public-chrome-cta-short" aria-hidden="true">Sign up</span>
        </Link>
      </nav>
    </header>
  )
}

/**
 * Keeps session replay off on public discovery routes for every visitor,
 * including authenticated users viewing canonical public profile URLs.
 */
function PublicRoutePrivacy() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof posthog?.stopSessionRecording !== 'function') return
    if (isPublicDiscoveryPath(pathname)) {
      posthog.stopSessionRecording()
    }
  }, [pathname])

  return null
}

export default function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const onAuthPage = isAuthPage(pathname)
  const [authChecked, setAuthChecked] = useState(false)
  const [hasUser, setHasUser] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!cancelled) {
        setHasUser(Boolean(user))
        setAuthChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pathname])

  const showPublicChrome =
    authChecked && !hasUser && !onAuthPage && isPublicDiscoveryPath(pathname)
  const showAppNav = !onAuthPage && (!authChecked || hasUser || !isPublicDiscoveryPath(pathname))

  // While checking auth on public discovery, avoid flashing the full product nav.
  const hideNavWhileChecking =
    !authChecked && !onAuthPage && isPublicDiscoveryPath(pathname)

  return (
    <>
      <PublicRoutePrivacy />
      {showPublicChrome && <PublicChrome />}
      {!hideNavWhileChecking && showAppNav && !showPublicChrome && <Nav />}
      {onAuthPage ? (
        children
      ) : (
        <main className={showPublicChrome ? 'public-main-content' : 'nav-main-content'}>
          {children}
        </main>
      )}
    </>
  )
}
