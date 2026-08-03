import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { isAnalysisAuthorizedUser } from '@/lib/analysis-auth'
import HomePageClient from './HomePageClient'
import PublicSearchHome from '@/components/PublicSearchHome'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    return {
      title: 'MatchMed Atlas',
      description: 'Ophthalmology physician workforce intelligence',
      robots: { index: false, follow: false },
    }
  }
  return {
    title: 'MatchMed Atlas · Research a practice before you sign',
    description:
      'Search ophthalmology practices and physicians with public CMS-observed workforce data.',
    robots: { index: true, follow: true },
  }
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <PublicSearchHome />
  }

  const authorized = await isAnalysisAuthorizedUser(supabase, user.id)
  if (!authorized) {
    redirect('/onboarding')
  }

  return <HomePageClient />
}
