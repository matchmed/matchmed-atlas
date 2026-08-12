'use client'

import Link from 'next/link'
import { withNextParam } from '@/lib/safe-next-path'

export default function UnlockAnalysisCta({
  nextPath,
  title,
  body,
  className = '',
}: {
  nextPath: string
  title: string
  body: string
  className?: string
}) {
  const signupHref = withNextParam('/signup', nextPath)
  const loginHref = withNextParam('/login', nextPath)

  return (
    <div className={`unlock-cta ${className}`.trim()} role="region" aria-label={title}>
      <h2 className="font-serif unlock-cta-title">{title}</h2>
      <p className="unlock-cta-body">{body}</p>
      <div className="unlock-cta-actions">
        <Link href={signupHref} className="unlock-cta-primary">
          Create Free Account
        </Link>
        <Link href={loginHref} className="unlock-cta-secondary">
          Log In
        </Link>
      </div>
    </div>
  )
}
