'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { isAuthPage } from '@/lib/auth-paths'
import { useState, useEffect, useRef } from 'react'

const primaryTabs = [
  {
    href: '/practices',
    label: 'Practices',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-16 0H3m2-16h10M9 7h1m-1 4h1m4-4h1m-1 4h1" />
      </svg>
    ),
  },
  {
    href: '/physicians',
    label: 'Physicians',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    href: '/favorites',
    label: 'Favorites',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    href: '/jobs',
    label: 'Jobs',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
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
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function getUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', user.id)
          .maybeSingle()
        if (profile?.first_name) {
          setInitials(`${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase())
        } else {
          setInitials(user.email[0].toUpperCase())
        }
      }
    }
    getUser()
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
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function renderDesktopLink(href: string, label: string) {
    return (
      <Link key={href} href={href} className={linkClass(pathname, href)}>
        {label}
      </Link>
    )
  }

  return (
    <>
      <nav className="nav-top">
        <div className="nav-top-inner">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 24, flexShrink: 0, textDecoration: 'none' }}>
            <img
              src="/MatchMed_Logo.jpg"
              alt="MatchMed Atlas"
              style={{ width: 28, height: 28, borderRadius: 6 }}
            />
            <span className="nav-logo-text">MatchMed Atlas</span>
          </Link>

          <div className="nav-links-desktop">
            {primaryTabs.map(t => renderDesktopLink(t.href, t.label))}
            {secondaryLinks.map(l => renderDesktopLink(l.href, l.label))}
          </div>

          <div className="nav-top-spacer" />

          <div ref={dropdownRef} style={{ position: 'relative', marginLeft: 12, flexShrink: 0 }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="Account menu"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#185FA5',
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
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                minWidth: 200,
                zIndex: 200,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{initials}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
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
                          color: '#374151',
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
                      color: '#374151',
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
                      color: '#374151',
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
            {primaryTabs.map(tab => (
              <Link key={tab.href} href={tab.href} className={`nav-bottom-tab ${isActive(pathname, tab.href) ? 'nav-bottom-tab-active' : ''}`}>
                {tab.icon}
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  )
}
