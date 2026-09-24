'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { isAuthPage } from '@/lib/auth-paths'
import { isPublicDiscoveryPath } from '@/lib/public-routes'
import { getUnreadNotificationCount } from '@/lib/notifications'
import { connectListForPhysician } from '@/lib/connect'
import {
  CONNECTIONS_ATTENTION_POLL_MS,
  connectionsAttentionCount,
  connectionsNavAriaLabel,
  formatConnectionsBadge,
} from '@/lib/connect-attention'
import { useState, useEffect, useRef } from 'react'
import Logo from './Logo'
import { PracticesIcon, PhysiciansIcon, FavoritesIcon, JobsIcon } from './nav-icons'
import posthog from 'posthog-js'

const primaryTabs = [
  {
    href: '/practices',
    label: 'Practices',
    icon: <PracticesIcon />,
  },
  {
    href: '/physicians',
    label: 'Physicians',
    icon: <PhysiciansIcon />,
  },
  {
    href: '/favorites',
    label: 'Favorites',
    icon: <FavoritesIcon />,
  },
  {
    href: '/opportunities',
    label: 'Opportunities',
    icon: <JobsIcon />,
  },
  {
    href: '/connect',
    label: 'Connections',
    icon: <PhysiciansIcon />,
  },
]

const secondaryLinks = [
  { href: '/scoring-methodology', label: 'Scoring Methodology' },
  { href: '/terms-and-conditions', label: 'Terms' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function linkClass(pathname: string, href: string) {
  return `nav-link ${isActive(pathname, href) ? 'nav-link-active' : 'nav-link-inactive'}`
}

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [initials, setInitials] = useState('?')
  const [unreadCount, setUnreadCount] = useState(0)
  const [connectionsAttention, setConnectionsAttention] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const identifiedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function getUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, training_status, is_internal')
          .eq('user_id', user.id)
          .maybeSingle()
        if (profile?.first_name) {
          setInitials(`${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase())
        } else {
          setInitials(user.email[0].toUpperCase())
        }
        // Identify once per auth UUID; never send email/name/phone as person properties.
        if (identifiedUserIdRef.current !== user.id) {
          identifiedUserIdRef.current = user.id
          posthog.identify(user.id, {
            training_status: profile?.training_status ?? undefined,
            is_internal: profile?.is_internal === true,
          })
        }
        if (
          typeof posthog?.startSessionRecording === 'function' &&
          !isPublicDiscoveryPath(pathname)
        ) {
          posthog.startSessionRecording()
        }
        const { count } = await getUnreadNotificationCount()
        setUnreadCount(count)
        const inbox = await connectListForPhysician()
        setConnectionsAttention(inbox.error ? 0 : connectionsAttentionCount(inbox.data))
      } else {
        setUnreadCount(0)
        setConnectionsAttention(0)
      }
    }
    getUser()
  }, [pathname])

  useEffect(() => {
    if (!userEmail) return
    const id = window.setInterval(() => {
      void connectListForPhysician().then((inbox) => {
        setConnectionsAttention(inbox.error ? 0 : connectionsAttentionCount(inbox.data))
      })
    }, CONNECTIONS_ATTENTION_POLL_MS)
    return () => window.clearInterval(id)
  }, [userEmail])

  useEffect(() => {
    function onInboxAttention(event: Event) {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count
      if (typeof count === 'number' && Number.isFinite(count)) {
        setConnectionsAttention(Math.max(0, Math.floor(count)))
      }
    }
    window.addEventListener('atlas:connections-attention', onInboxAttention)
    return () => window.removeEventListener('atlas:connections-attention', onInboxAttention)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (!error) {
      identifiedUserIdRef.current = null
      posthog.reset()
    }
    router.push('/login')
    router.refresh()
  }

  function renderDesktopLink(href: string, label: string) {
    const isConnections = href === '/connect'
    const badge = isConnections ? formatConnectionsBadge(connectionsAttention) : null
    return (
      <Link
        key={href}
        href={href}
        className={linkClass(pathname, href)}
        aria-label={isConnections ? connectionsNavAriaLabel(connectionsAttention) : undefined}
        style={isConnections ? { display: 'inline-flex', alignItems: 'center', gap: 6 } : undefined}
      >
        {label}
        {badge && (
          <span className="nav-count-badge" aria-hidden>
            {badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <>
      <nav className="nav-top">
        <div className="nav-top-inner">
          <Link href="/" style={{ marginRight: 24, flexShrink: 0, textDecoration: 'none' }}>
            <Logo size="sm" />
          </Link>

          <div className="nav-links-desktop">
            {primaryTabs.map(t => renderDesktopLink(t.href, t.label))}
            {secondaryLinks.map(l => renderDesktopLink(l.href, l.label))}
          </div>

          <div className="nav-top-spacer" />

          {userEmail && (
            <Link
              href="/notifications"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              style={{
                position: 'relative',
                marginLeft: 8,
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isActive(pathname, '/notifications') ? '#1C4A45' : '#5C5852',
                textDecoration: 'none',
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 99,
                    background: '#9B1C1C',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: '16px',
                    textAlign: 'center',
                    padding: '0 4px',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          )}

          <div ref={dropdownRef} style={{ position: 'relative', marginLeft: 12, flexShrink: 0 }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="Account menu"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#1C4A45',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials}
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                background: 'white',
                border: '1px solid #e0ddd8',
                borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                minWidth: 200,
                zIndex: 200,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0ddd8' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#141210', marginBottom: 2 }}>{initials}</div>
                  <div style={{ fontSize: 12, color: '#8A8680', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
                </div>

                <div style={{ padding: '6px 0' }}>
                  <div className="nav-dropdown-secondary">
                    {secondaryLinks.map(l => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setDropdownOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 16px',
                          fontSize: 13,
                          color: '#141210',
                          textDecoration: 'none',
                        }}
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>

                  <Link
                    href="/account"
                    onClick={() => setDropdownOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 16px',
                      fontSize: 13,
                      color: '#141210',
                      textDecoration: 'none',
                    }}
                  >
                    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Account settings
                  </Link>

                  <button
                    onClick={handleLogout}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 16px',
                      fontSize: 13,
                      color: '#141210',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {!isAuthPage(pathname) && (
        <nav className="nav-bottom" aria-label="Main navigation">
          <div className="nav-bottom-inner">
            {primaryTabs.map(tab => {
              const isConnections = tab.href === '/connect'
              const badge = isConnections ? formatConnectionsBadge(connectionsAttention) : null
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`nav-bottom-tab ${isActive(pathname, tab.href) ? 'nav-bottom-tab-active' : ''}`}
                  aria-label={isConnections ? connectionsNavAriaLabel(connectionsAttention) : undefined}
                >
                  {tab.icon}
                  <span className="nav-bottom-label">{tab.label}</span>
                  {badge && (
                    <span className="nav-count-badge nav-count-badge-bottom" aria-hidden>
                      {badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}