import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicBriefView, type PublicBriefViewModel } from '@/components/PublicBriefView'
import { PUBLIC_SPONSOR_BRIEFS_ANONYMOUS } from '@/lib/sponsor-launch'
import { createClient } from '@/lib/supabase-server'

type PageProps = {
  params: Promise<{ slug: string; issue: string }>
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PublicSponsorBriefPage({ params }: PageProps) {
  if (!PUBLIC_SPONSOR_BRIEFS_ANONYMOUS) notFound()

  const { slug, issue } = await params
  const publicSlug = decodeURIComponent(slug || '').trim().toLowerCase()
  const issueSlug = decodeURIComponent(issue || '').trim()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_public_sponsor_brief', {
    p_slug: publicSlug,
    p_issue: issueSlug,
  })
  if (error || !data || typeof data !== 'object') notFound()
  const brief = data as PublicBriefViewModel
  if (!brief.title && brief.state_label !== 'expired') notFound()
  return <PublicBriefView brief={{ ...brief, slug: publicSlug, issue_slug: issueSlug, items: brief.items ?? [] }} />
}
