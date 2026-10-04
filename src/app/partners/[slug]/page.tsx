import type { Metadata } from 'next'
import SponsorVendorPageClient from '@/components/SponsorVendorPageClient'
import { fetchSponsorPageServer } from '@/lib/sponsors-server'

type PageProps = {
  params: Promise<{ slug: string }>
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PartnerVendorPage({ params }: PageProps) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug || '').trim().toLowerCase()
  const { data } = slug ? await fetchSponsorPageServer(slug) : { data: null }

  return <SponsorVendorPageClient slug={slug} initialPage={data} />
}
