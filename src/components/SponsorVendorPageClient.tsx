'use client'

import {
  SPONSOR_SECTION_BLURBS,
  SPONSOR_SECTION_LABELS,
  SPONSOR_SECTION_TYPES,
  groupSponsorSections,
  type SponsorSectionType,
} from '@/lib/sponsor-labels'
import { captureAnalyticsEvent } from '@/lib/posthog-client'
import {
  fetchSponsorPage,
  type SponsorContentItem,
  type SponsorPage,
} from '@/lib/sponsors'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

function formatEventDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function OutboundCta({
  href,
  label,
  section,
}: {
  href: string
  label: string
  section: SponsorSectionType
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="sponsor-outbound-cta"
      data-sponsor-section={section}
      onClick={() => {
        // Internal Atlas analytics only — never exposed to the sponsor.
        captureAnalyticsEvent('sponsor_outbound_click', { section })
      }}
    >
      {label}
    </a>
  )
}

function ContentCard({
  item,
  section,
}: {
  item: SponsorContentItem
  section: SponsorSectionType
}) {
  const when = formatEventDate(item.event_date)
  const cta = item.cta_label?.trim() || (item.url ? 'Open' : null)
  return (
    <article className="sponsor-content-card bg-canvas">
      <div className="sponsor-content-card-top">
        <h3 className="sponsor-content-card-title">{item.title}</h3>
        {(item.status_label || when) && (
          <div className="sponsor-content-card-meta">
            {item.status_label && <span>{item.status_label}</span>}
            {item.status_label && when && <span aria-hidden>·</span>}
            {when && <span>{when}</span>}
          </div>
        )}
      </div>
      {item.description && <p className="sponsor-content-card-desc">{item.description}</p>}
      {item.url && cta && <OutboundCta href={item.url} label={cta} section={section} />}
    </article>
  )
}

function SectionBlock({
  section,
  items,
}: {
  section: SponsorSectionType
  items: SponsorContentItem[]
}) {
  return (
    <section id={`section-${section}`} className="sponsor-section">
      <div className="sponsor-section-header">
        <h2 className="sponsor-section-label">{SPONSOR_SECTION_LABELS[section]}</h2>
        <p className="sponsor-section-blurb">{SPONSOR_SECTION_BLURBS[section]}</p>
      </div>
      {items.length === 0 ? (
        <p className="sponsor-section-empty">No items listed in this section yet.</p>
      ) : (
        <div className="sponsor-content-grid">
          {items.map((item) => (
            <ContentCard
              key={`${section}-${item.sort_order}-${item.title}`}
              item={item}
              section={section}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function SponsorVendorPageClient({
  slug,
  reportedIn,
  initialPage,
}: {
  slug: string
  reportedIn: string | null
  initialPage: SponsorPage | null
}) {
  const [fetchedPage, setFetchedPage] = useState<SponsorPage | null>(null)
  const [loading, setLoading] = useState(!initialPage)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialPage) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await fetchSponsorPage(slug)
      if (cancelled) return
      if (err || !data) {
        setFetchedPage(null)
        setError('This partner page is unavailable.')
      } else {
        setFetchedPage(data)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug, initialPage])

  const page = initialPage ?? fetchedPage
  const grouped = useMemo(
    () => (page ? groupSponsorSections(page.sections) : null),
    [page],
  )

  if (!initialPage && loading) {
    return <p style={{ color: '#888', fontSize: 14 }}>Loading partner page…</p>
  }

  if (error || !page || !grouped) {
    return (
      <div className="partners-page" style={{ padding: '48px 0 80px' }}>
        <h1 className="font-serif" style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>
          Partner not found
        </h1>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 20px', lineHeight: 1.6 }}>
          This industry partner page is inactive or does not exist.
        </p>
        <Link href="/partners" style={{ color: '#1C4A45', fontSize: 14, fontWeight: 600 }}>
          ← Back to Partners
        </Link>
      </div>
    )
  }

  return (
    <div className="partners-page sponsor-page" style={{ padding: '40px 0 80px', color: '#1a1a1a' }}>
      <div className="sponsor-breadcrumb">
        <Link href="/partners" style={{ color: '#1C4A45', fontSize: 13, fontWeight: 600 }}>
          ← Atlas Industry Partners
        </Link>
      </div>

      <header className="sponsor-header bg-canvas">
        <div className="sponsor-header-main">
          {page.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external sponsor logo URLs
            <img src={page.logo_url} alt="" className="sponsor-logo" />
          ) : (
            <div className="sponsor-logo-fallback" aria-hidden>
              {page.display_label.slice(0, 1)}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: '#1C4A45',
                marginBottom: 8,
              }}
            >
              Atlas Industry Partner
            </div>
            <h1
              className="font-serif"
              style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}
            >
              {page.display_label}
            </h1>
            {page.short_description && (
              <p style={{ fontSize: 15, color: '#555', margin: 0, lineHeight: 1.6 }}>
                {page.short_description}
              </p>
            )}
          </div>
        </div>
        <p className="sponsor-disclosure">{page.disclosure_text}</p>
        {reportedIn && (
          <p className="sponsor-practice-context">
            Referring link category context: {reportedIn}. This label is display-only from the
            link you followed and is not independently verified on this page.
          </p>
        )}
      </header>

      <nav className="sponsor-section-nav" aria-label="Partner page sections">
        {SPONSOR_SECTION_TYPES.map((section) => (
          <a key={section} href={`#section-${section}`} className="sponsor-section-nav-link">
            {SPONSOR_SECTION_LABELS[section]}
          </a>
        ))}
      </nav>

      {SPONSOR_SECTION_TYPES.map((section) => (
        <SectionBlock key={section} section={section} items={grouped[section]} />
      ))}

      <p style={{ fontSize: 12, color: '#999', lineHeight: 1.6, marginTop: 32 }}>
        Outbound links leave Atlas and are operated by the partner. Atlas does not automatically
        share your identity, contact information, or browsing activity with industry partners.
      </p>
    </div>
  )
}
