import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { isAnalysisAuthorizedUser } from '@/lib/analysis-auth'
import {
  practiceProfileDocumentTitle,
  resolvePracticePublicName,
} from '@/lib/practice-display-name'
import {
  publicGetEmployerPracticeOverlay,
  publicGetPractice,
} from '@/lib/public-search'
import PracticeDetailAuthorized from '@/components/PracticeDetailAuthorized'
import PracticeDetailPublic from '@/components/PracticeDetailPublic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const [practiceRes, overlayRes] = await Promise.all([
    publicGetPractice(supabase, id),
    publicGetEmployerPracticeOverlay(supabase, id),
  ])
  const cmsName = practiceRes.data?.practice_name
  const approvedName = overlayRes.data?.visible
    ? overlayRes.data.profile?.public_display_name
    : null
  const displayName = resolvePracticePublicName(cmsName, approvedName, '')
  return {
    title: practiceProfileDocumentTitle(cmsName, approvedName),
    description: displayName
      ? `Public practice profile for ${displayName} on MatchMed Atlas.`
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
