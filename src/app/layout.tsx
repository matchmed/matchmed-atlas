import type { Metadata } from 'next'
import './globals.css'
import NavWrapper from '@/components/NavWrapper'

export const metadata: Metadata = {
  title: 'MatchMed Atlas',
  description: 'Ophthalmology physician workforce intelligence',
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon-180x180.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavWrapper>
          {children}
        </NavWrapper>
      </body>
    </html>
  )
}