import SponsorVendorPageClient from '@/components/SponsorVendorPageClient'
import { sanitizeReportedInCategory } from '@/lib/sponsor-labels'
import { fetchSponsorPageServer } from '@/lib/sponsors-server'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ reported_in?: string | string[] }>
}

export default async function PartnerVendorPage({ params, searchParams }: PageProps) {
  const { slug: rawSlug } = await params
  const sp = await searchParams
  const slug = decodeURIComponent(rawSlug || '').trim().toLowerCase()
  const reportedRaw = sp.reported_in
  const reportedIn = sanitizeReportedInCategory(
    Array.isArray(reportedRaw) ? reportedRaw[0] : reportedRaw,
  )

  const { data } = slug ? await fetchSponsorPageServer(slug) : { data: null }

  return (
    <SponsorVendorPageClient
      slug={slug}
      reportedIn={reportedIn}
      initialPage={data}
    />
  )
}
