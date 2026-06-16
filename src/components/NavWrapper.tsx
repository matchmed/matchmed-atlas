'use client'

import { usePathname } from 'next/navigation'
import { isAuthPage } from '@/lib/auth-paths'
import Nav from './Nav'

export default function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const onAuthPage = isAuthPage(pathname)

  return (
    <>
      {!onAuthPage && <Nav />}
      {onAuthPage ? (
        children
      ) : (
        <main className="nav-main-content">
          {children}
        </main>
      )}
    </>
  )
}
