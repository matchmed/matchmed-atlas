'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ConfirmPage() {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/')
      else router.push('/login')
    })
  }, [])
  return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>Logging you in...</div>
}