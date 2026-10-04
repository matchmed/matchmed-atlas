import Link from 'next/link'
import '@/app/partners/sponsor-surface.css'

export type PublicBriefItem = {
  position: number
  title: string
  summary: string
  source_label: string
  source_url: string | null
  cta_label: string | null
  cta_url: string | null
}

export type PublicBriefViewModel = {
  slug: string
  issue_slug: string
  title: string
  introduction: string
  state_label: 'current' | 'archived' | 'expired'
  display_label: string
  items: PublicBriefItem[]
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export function PublicBriefView({ brief, preview = false }: { brief: PublicBriefViewModel; preview?: boolean }) {
  const expired = brief.state_label === 'expired'
  return (
    <article className="sponsor-brief">
      {preview && <p className="sponsor-preview-banner">Internal preview. This is not a public page.</p>}
      <p className="sponsor-kicker">MatchMed monthly brief</p>
      <h1>{brief.title}</h1>
      <p className="sponsor-meta">
        {brief.display_label}
        {brief.state_label === 'archived' ? ' · Archived' : ''}
        {expired ? ' · Expired' : ''}
      </p>
      {expired ? (
        <p>This issue has expired. The items are no longer shown.</p>
      ) : (
        <>
          <p>{brief.introduction}</p>
          <ol className="sponsor-brief-items">
            {brief.items.map((item) => (
              <li key={item.position}>
                <h2>{item.title}</h2>
                <p>{item.summary}</p>
                <p className="sponsor-source">
                  Source: {item.source_label}
                  {item.source_url ? <> · <ExternalLink href={item.source_url}>Open source</ExternalLink></> : null}
                </p>
                {item.cta_url && item.cta_label ? (
                  <p><ExternalLink href={item.cta_url}>{item.cta_label}</ExternalLink></p>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="sponsor-neutrality">
        MatchMed publishes this brief after company-source review and MatchMed approval.
        Partnership does not affect practice scores, rankings, Opportunities, or physician visibility.
        This page does not know which practice or physician opened it.
      </p>
      <p>
        <Link href="/signup">Explore the full Atlas library</Link>
      </p>
    </article>
  )
}
