'use client'

import { usePathname } from 'next/navigation'
import Nav from './Nav'

export default function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/login' || pathname === '/signup'

  return (
    <>
      {!isAuthPage && <Nav />}
      {isAuthPage ? (
        children
      ) : (
        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
          {children}
        </main>
      )}
    </>
  )
}