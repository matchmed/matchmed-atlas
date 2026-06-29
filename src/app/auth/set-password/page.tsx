'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

function clearRecoveryParamsFromUrl() {
  window.history.replaceState({}, '', '/auth/set-password')
}

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)
  const [initError, setInitError] = useState('')

  useEffect(() => {
    async function establishRecoverySession() {
      const supabase = createClient()
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const token_hash = params.get('token_hash')
      const type = params.get('type')
      const hash = window.location.hash

      try {
        if (code) {
          console.info('[set-password] PKCE code detected, exchanging for session')
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('[set-password] exchangeCodeForSession failed:', exchangeError.message, exchangeError)
            setInitError('This reset link is invalid or has expired. Please request a new one.')
            return
          }
          clearRecoveryParamsFromUrl()
        } else if (token_hash && type === 'recovery') {
          console.info('[set-password] token_hash recovery detected, verifying OTP')
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery',
          })
          if (verifyError) {
            console.error('[set-password] verifyOtp failed:', verifyError.message, verifyError)
            setInitError('This reset link is invalid or has expired. Please request a new one.')
            return
          }
          clearRecoveryParamsFromUrl()
        } else if (hash.includes('access_token')) {
          console.info('[set-password] access_token hash detected, waiting for session')
          const session = await new Promise<Session | null>((resolve) => {
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
              if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
                subscription.unsubscribe()
                resolve(session)
              }
            })
            setTimeout(async () => {
              subscription.unsubscribe()
              const { data: { session } } = await supabase.auth.getSession()
              resolve(session)
            }, 3000)
          })
          if (!session) {
            console.error('[set-password] no session established from hash tokens')
            setInitError('This reset link is invalid or has expired. Please request a new one.')
            return
          }
          clearRecoveryParamsFromUrl()
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          console.error('[set-password] getSession failed:', sessionError.message, sessionError)
        }
        if (session) {
          console.info('[set-password] recovery session ready, user:', session.user.id)
          setSessionReady(true)
        } else {
          console.error('[set-password] no session after recovery processing', {
            hadCode: !!code,
            hadTokenHash: !!token_hash,
            hadHash: hash.includes('access_token'),
          })
          setInitError('This reset link is invalid or has expired. Please request a new one.')
        }
      } catch (err) {
        console.error('[set-password] unexpected error establishing recovery session:', err)
        setInitError('Something went wrong. Please request a new reset link.')
      }
    }

    establishRecoverySession()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      console.error('[set-password] updateUser failed:', error.message, error)
      setError(error.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!profile || !profile.onboarding_complete) {
        router.push('/onboarding')
      } else {
        router.push('/')
      }
    } else {
      router.push('/')
    }
  }

  if (initError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div className="bg-canvas" style={{ width: '100%', maxWidth: 380, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)', border: '1px solid #eee', padding: '32px', textAlign: 'center' }}>
          <h1 className="font-serif" style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Reset link expired</h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>{initError}</p>
          <a
            href="/forgot-password"
            style={{ display: 'inline-block', padding: '11px 20px', background: '#1C4A45', color: 'white', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
          >
            Request a new reset link
          </a>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ fontSize: 14, color: '#888' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 36, height: 36, background: '#1C4A45', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#111', letterSpacing: '-0.3px' }}>MatchMed Atlas</span>
        </div>

        <div className="bg-canvas" style={{ borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)', border: '1px solid #eee', padding: '32px' }}>
          <h1 className="font-serif" style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 8, letterSpacing: '-0.3px' }}>Set a new password</h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
            Choose a strong password for your Atlas account.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>New password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#111', background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Confirm password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
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
              disabled={loading || !password || !confirm}
              style={{
                width: '100%', padding: '11px 16px',
                background: loading || !password || !confirm ? '#8ab4ae' : '#1C4A45',
                color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: loading || !password || !confirm ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box'
              }}
            >
              {loading ? 'Saving...' : 'Set password and log in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
