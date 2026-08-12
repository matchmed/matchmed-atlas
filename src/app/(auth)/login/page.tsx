'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Logo from '@/components/Logo'
import posthog from 'posthog-js'
import { authCallbackUrl, safeNextPath, withNextParam } from '@/lib/safe-next-path'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeNextPath(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (searchParams.get('error') === 'auth_failed') {
      setError('Your sign-in link has expired or is invalid. Please try signing in again.')
    }
  }, [searchParams])

  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      const supabase = createClient()
      setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            router.push(nextPath || '/')
            router.refresh()
          }
        })
      }, 500)
    }
  }, [nextPath, router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      const supabase2 = createClient()
      const { data: { user: loggedInUser } } = await supabase2.auth.getUser()
      if (loggedInUser) {
        posthog.identify(loggedInUser.id)
        posthog.capture('user_logged_in', { method: 'email' })
        const { data: profile } = await supabase2
          .from('profiles')
          .select('onboarding_complete')
          .eq('user_id', loggedInUser.id)
          .maybeSingle()
        if (!profile || profile.onboarding_complete !== true) {
          router.push(withNextParam('/onboarding', nextPath))
          router.refresh()
          return
        }
      }
      router.push(nextPath || '/')
      router.refresh()
    }
  }

  async function handleGoogleLogin() {
    posthog.capture('google_oauth_initiated', { context: 'login' })
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authCallbackUrl(window.location.origin, nextPath),
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
  }

  return (
    <div className="auth-split">
      <div className="auth-split-form">
        <div className="auth-split-inner">
          <div style={{ marginBottom: 40 }}>
            <Logo size="sm" />
          </div>

          <div className="auth-card bg-canvas" style={{ borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)', border: '1px solid #eee', padding: '32px 32px 28px' }}>
            <h1 className="font-serif" style={{ fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 6, letterSpacing: '-0.4px' }}>Welcome back</h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
              Log in to see how well any ophthalmology practice retains its physicians.
            </p>

            <form onSubmit={handleLogin}>
              <button
                type="button"
                onClick={handleGoogleLogin}
                style={{ width: '100%', padding: '10px 16px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, boxSizing: 'border-box' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>or</span>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#111', background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div className="auth-password-row">
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Password</label>
                  <a href="/forgot-password" style={{ fontSize: 12, color: '#1C4A45', textDecoration: 'none', whiteSpace: 'nowrap' }}>Forgot password?</a>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#111', background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '11px 16px', background: loading ? '#8ab4ae' : '#1C4A45', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.1px', boxSizing: 'border-box' }}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginTop: 20, marginBottom: 0 }}>
              Don&apos;t have an account?{' '}
              <a href={withNextParam('/signup', nextPath)} style={{ color: '#1C4A45', fontWeight: 500, textDecoration: 'none' }}>Sign up free</a>
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 20 }}>
            Free for early-career ophthalmologists.
          </p>
        </div>
      </div>

      <div className="auth-split-hero">
        <div
          className="auth-split-hero-bg"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80')` }}
        />
        <div className="auth-split-hero-content">
          <blockquote style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.5, marginBottom: 12, letterSpacing: '-0.2px' }}>
            &quot;The only platform that shows you how practices actually retain physicians, backed by real CMS data.&quot;
          </blockquote>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>MatchMed Atlas · Ophthalmology Workforce Intelligence</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loading-bar"><div className="loading-bar-inner" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
