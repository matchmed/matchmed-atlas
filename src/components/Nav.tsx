'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useState, useEffect, useRef } from 'react'

const links = [
  { href: '/practices', label: 'Practices' },
  { href: '/physicians', label: 'Physicians' },
  { href: '/favorites', label: 'Favorites' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/scoring-methodology', label: 'Scoring Methodology' },
  { href: '/terms-and-conditions', label: 'Terms' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
]

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
        // Get initials from profile or email
        const supabase2 = createClient()
        const { data: profile } = await supabase2
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

  return (
    <nav style={{
      borderBottom: '1px solid #e8e8e8',
      background: '#fff',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        height: 56,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 24, flexShrink: 0 }}>
          <img
            src="/MatchMed_Logo.jpg"
            alt="MatchMed Atlas"
            style={{ width: 28, height: 28, borderRadius: 6 }}
          />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a', letterSpacing: '-0.01em' }}>
            MatchMed Atlas
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflowX: 'auto' }}>
          {links.map(l => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/')
            const linkStyle = {
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? '#185FA5' : '#666',
              padding: '6px 12px',
              borderRadius: 6,
              background: active ? '#e8f0fb' : 'transparent',
              whiteSpace: 'nowrap' as const,
              textDecoration: 'none',
              transition: 'all 0.12s',
            }

            if (l.href === '/favorites') {
              return (
                <a
                key={l.href}
                href={l.href}
                  onClick={e => {
                    e.preventDefault()
                    window.location.href = '/favorites'
                  }}
                  style={linkStyle}
                >
                  {l.label}
                </a>
              )
            }

            return (
              <Link key={l.href} href={l.href} style={linkStyle}>
                {l.label}
              </Link>
            )
          })}
        </div>

        {/* Avatar dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative', marginLeft: 12, flexShrink: 0 }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
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
              {/* User info */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{initials}</div>
                <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
              </div>

              {/* Menu items */}
              <div style={{ padding: '6px 0' }}>
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
  )
}