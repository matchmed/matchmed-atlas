import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { isAnalysisAuthorizedUser } from '@/lib/analysis-auth'
import { publicGetPhysician } from '@/lib/public-search'
import PhysicianDetailAuthorized from '@/components/PhysicianDetailAuthorized'
import PhysicianDetailPublic from '@/components/PhysicianDetailPublic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await publicGetPhysician(supabase, id)
  const name = data?.physician_name?.trim()
  return {
    title: name ? `${name} · MatchMed Atlas` : 'Physician · MatchMed Atlas',
    description: name
      ? `Public physician profile on MatchMed Atlas.`
      : 'Public ophthalmology physician profile on MatchMed Atlas.',
    robots: { index: false, follow: true },
  }
}

export default async function PhysicianDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const authorized = await isAnalysisAuthorizedUser(supabase, user?.id)

  if (authorized) {
    return <PhysicianDetailAuthorized />
  }

  return <PhysicianDetailPublic id={id} />
}
