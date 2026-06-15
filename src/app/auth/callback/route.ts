import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  if (token_hash && (type === 'invite' || type === 'recovery')) {
    const { data: { user }, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'invite' | 'recovery',
    })
    if (error) {
      console.error('[auth/callback] verifyOtp failed:', error.message, { type })
    }
    if (user) {
      const destination = type === 'recovery' ? '/auth/set-password' : '/'
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  if (code) {
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code)
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!profile || !profile.onboarding_complete) {
        return NextResponse.redirect(`${origin}/onboarding`)
      } else {
        return NextResponse.redirect(`${origin}/`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/practices`)
}