import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AdminNav from '@/components/AdminNav'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/')

  const { count } = await supabase
    .from('practice_error_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')

  return (
    <>
      <AdminNav newReportCount={count ?? 0} />
      {children}
    </>
  )
}
