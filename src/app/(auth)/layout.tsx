import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'MatchMed Atlas',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
