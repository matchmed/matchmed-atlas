'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: '#185FA5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>A</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a', letterSpacing: '-0.01em' }}>
            MatchMed Atlas
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflowX: 'auto' }}>
          {links.map(l => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/')
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? '#185FA5' : '#666',
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: active ? '#e8f0fb' : 'transparent',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.12s',
                }}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
