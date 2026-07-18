'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/admin', label: 'Admin' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/report-builder', label: 'Report Builder' },
]

export default function AdminNav({ newReportCount }: { newReportCount: number }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin navigation" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 0' }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e8e8e8', overflowX: 'auto' }}>
        {links.map(link => {
          const active = link.href === '/admin'
            ? pathname === '/admin'
            : pathname === link.href || pathname.startsWith(`${link.href}/`)

          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                borderBottom: active ? '2px solid #1C4A45' : '2px solid transparent',
                marginBottom: -1,
                color: active ? '#1C4A45' : '#888',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {link.label}
              {link.href === '/admin/reports' && newReportCount > 0 && (
                <span style={{ minWidth: 19, height: 19, padding: '0 6px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#E8F0EF', color: '#1C4A45', fontSize: 10, fontWeight: 700 }}>
                  {newReportCount}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
