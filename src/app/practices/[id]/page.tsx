import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { isAnalysisAuthorizedUser } from '@/lib/analysis-auth'
import { publicGetPractice } from '@/lib/public-search'
import PracticeDetailAuthorized from '@/components/PracticeDetailAuthorized'
import PracticeDetailPublic from '@/components/PracticeDetailPublic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await publicGetPractice(supabase, id)
  const name = data?.practice_name?.trim()
  return {
    title: name ? `${name} · MatchMed Atlas` : 'Practice · MatchMed Atlas',
    description: name
      ? `Public practice profile for ${name} on MatchMed Atlas.`
      : 'Public ophthalmology practice profile on MatchMed Atlas.',
    robots: { index: true, follow: true },
  }
}

export default async function PracticeDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const authorized = await isAnalysisAuthorizedUser(supabase, user?.id)

  if (authorized) {
    return <PracticeDetailAuthorized />
  }

  return <PracticeDetailPublic id={id} />
}
