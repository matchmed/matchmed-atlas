import { notFound } from 'next/navigation'
import { PublicBriefView } from '@/components/PublicBriefView'
import { createClient } from '@/lib/supabase-server'
import { SponsorPublicationControls } from '../publish-controls'

export const dynamic = 'force-dynamic'

type Preview = {
  slug: string
  vendor_slug: string
  display_label: string
  is_active: boolean
  directory_visible: boolean
  atlas_enabled: boolean
  employers_enabled: boolean
  content: Array<{ id: string; title: string; publication_state: string; audience: string; url: string | null }>
  briefs: Array<{ id: string; issue_slug: string; revision_number: number; title: string; publication_state: string; published_at: string | null; public_sharing_enabled: boolean }>
}

export default async function AdminSponsorPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const publicSlug = decodeURIComponent(slug).trim().toLowerCase()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_get_sponsor_preview', { p_slug: publicSlug })
  if (error || !data) notFound()
  const preview = data as Preview

  return (
    <main className="sponsor-admin">
      <h1>{preview.display_label}</h1>
      <p>Internal vendor identity {preview.vendor_slug}. Public URL identity {preview.slug}.</p>
      <dl>
        <div><dt>Global kill switch</dt><dd>{preview.is_active ? 'Active' : 'Inactive'}</dd></div>
        <div><dt>Directory</dt><dd>{preview.directory_visible ? 'Visible' : 'Hidden'}</dd></div>
        <div><dt>Atlas audience</dt><dd>{preview.atlas_enabled ? 'Enabled' : 'Off'}</dd></div>
        <div><dt>Employers audience</dt><dd>{preview.employers_enabled ? 'Enabled' : 'Off'}</dd></div>
      </dl>
      <h2>Library revisions</h2>
      <ul>
        {preview.content.map((item) => (
          <li key={item.id}>
            {item.title} — {item.publication_state} — {item.audience}
            {item.publication_state === 'draft' || item.publication_state === 'unpublished' ? (
              <SponsorPublicationControls kind="library" id={item.id} slug={preview.slug} draftUrl={item.url} />
            ) : null}
          </li>
        ))}
      </ul>
      <h2>Brief revisions</h2>
      <ul>
        {preview.briefs.map((brief) => (
          <li key={brief.id}>
            {brief.issue_slug} rev {brief.revision_number}: {brief.title} — {brief.publication_state === 'published' && brief.published_at && new Date(brief.published_at) > new Date() ? 'scheduled' : brief.publication_state}
            {brief.publication_state === 'draft' || brief.publication_state === 'unpublished' ? (
              <SponsorPublicationControls kind="brief" id={brief.id} slug={preview.slug} />
            ) : null}
          </li>
        ))}
      </ul>
      <PublicBriefView
        preview
        brief={{
          slug: preview.slug,
          issue_slug: '2026-10',
          title: `${preview.display_label} brief preview`,
          introduction: 'This preview uses the public brief layout. It is not anonymous and it is not a published issue.',
          state_label: 'current',
          display_label: preview.display_label,
          items: [],
        }}
      />
    </main>
  )
}
