import Link from 'next/link'
import '@/app/partners/sponsor-surface.css'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const PREVIEW = [
  { slug: 'bausch-lomb', label: 'Bausch + Lomb' },
  { slug: 'johnson-and-johnson-vision', label: 'Johnson & Johnson Vision' },
] as const

export default async function AdminSponsorsPage() {
  const supabase = await createClient()
  const previews = await Promise.all(
    PREVIEW.map(async (sponsor) => {
      const { data, error } = await supabase.rpc('admin_get_sponsor_preview', { p_slug: sponsor.slug })
      return { ...sponsor, data, error: error?.message ?? null }
    }),
  )

  return (
    <main className="sponsor-admin">
      <h1>Sponsor preview</h1>
      <p>MatchMed admins can preview drafts here. Publishing a draft uses the server publication check. Nothing on this page is anonymous or published.</p>
      <ul>
        {previews.map((sponsor) => (
          <li key={sponsor.slug}>
            <Link href={`/admin/sponsors/${sponsor.slug}`}>{sponsor.label}</Link>
            {sponsor.error ? <span> — preview unavailable until the publication migration is applied</span> : null}
            {sponsor.data && typeof sponsor.data === 'object' ? (
              <span> — active: {String((sponsor.data as { is_active?: boolean }).is_active)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  )
}
