import type { Metadata } from 'next'
import './globals.css'
import NavWrapper from '@/components/NavWrapper'

import { Cormorant_Garamond, Inter } from 'next/font/google'

const display = Cormorant_Garamond({
  weight: ['600'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

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
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <NavWrapper>
          {children}
        </NavWrapper>
      </body>
    </html>
  )
}