import Link from 'next/link'
import { fetchActiveSponsorsServer } from '@/lib/sponsors-server'
import { sponsorPageHref } from '@/lib/sponsor-labels'

const howPartnershipWorks = [
  {
    title: 'Free Physician Access',
    description:
      'Partner support helps keep Atlas available to residents, fellows, and practicing ophthalmologists at no cost.',
  },
  {
    title: 'Broader Reach',
    description:
      'Partners may help introduce Atlas through resident education, fellowship programs, wet labs, and professional relationships.',
  },
  {
    title: 'Physician Choice',
    description:
      'Physicians decide whether they want educational opportunities or direct communication from any partner.',
  },
]

export default async function PartnersPage() {
  const { data: sponsors, error } = await fetchActiveSponsorsServer()

  return (
    <div
      className="partners-page"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '48px 0 80px',
        color: '#1a1a1a',
      }}
    >
      <div className="partners-intro">
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: '#1C4A45',
            marginBottom: 12,
          }}
        >
          Atlas by MatchMed
        </div>
        <h1
          className="font-serif"
          style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}
        >
          Partners Supporting Career Transparency
        </h1>
        <p style={{ fontSize: 15, color: '#666', margin: '0 0 24px', lineHeight: 1.6 }}>
          Atlas is free for ophthalmologists. Strategic partners help fund the data infrastructure,
          quality control, technology, and physician education required to keep it that way.
        </p>
        <p style={{ fontSize: 15, color: '#666', margin: '0 0 40px', lineHeight: 1.6 }}>
          Partners may also help introduce Atlas to residents, fellows, and early-career surgeons
          through educational programs and professional networks. Atlas remains independently
          operated by MatchMed.
        </p>
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: '#999',
          margin: '0 0 16px',
          paddingBottom: 8,
          borderBottom: '0.5px solid #e8e8e8',
        }}
      >
        How Partnership Works
      </div>

      <div className="partners-how-grid">
        {howPartnershipWorks.map((card) => (
          <div
            key={card.title}
            className="bg-canvas"
            style={{ border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '16px 18px', minWidth: 0 }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
              {card.title}
            </div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>{card.description}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: '#999',
          margin: '0 0 16px',
          paddingBottom: 8,
          borderBottom: '0.5px solid #e8e8e8',
        }}
      >
        Atlas Industry Partners
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#842029', margin: '0 0 24px' }}>
          Partner directory is temporarily unavailable.
        </p>
      )}

      {!error && sponsors.length === 0 && (
        <div
          className="bg-canvas"
          style={{ border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '20px 24px', marginBottom: 48 }}
        >
          <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, margin: 0 }}>
            Active industry partners will appear here when available. Partnership never affects
            scores, rankings, Opportunities, or practice technology reporting.
          </p>
        </div>
      )}

      {sponsors.length > 0 && (
        <div className="partners-directory-grid" style={{ marginBottom: 48 }}>
          {sponsors.map((s) => (
            <Link
              key={s.slug}
              href={sponsorPageHref(s.slug)}
              className="partners-directory-card bg-canvas"
            >
              <div className="partners-directory-logo-tile">
                {s.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- first-party sponsor logos
                  <img
                    src={s.logo_url}
                    alt={s.display_label}
                    className="partners-directory-logo"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="partners-directory-logo-fallback" aria-hidden>
                    {s.display_label.slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="partners-directory-card-copy">
                <div className="partners-directory-card-title">{s.display_label}</div>
                {s.short_description && (
                  <div className="partners-directory-card-desc">{s.short_description}</div>
                )}
                <div className="partners-directory-card-cta">View partner page →</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ padding: 24, border: '0.5px solid #e8e8e8', borderRadius: 10, background: '#f9f9f9' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: '#999',
            marginBottom: 12,
          }}
        >
          Atlas Independence
        </div>
        <div className="partners-independence-copy">
          <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: '0 0 10px' }}>
            Partners cannot purchase rankings, alter scores, influence practice profiles or
            methodology, insert themselves into practice technology stacks, or access private
            physician due-diligence activity. Partner communication is optional, and physicians
            remain in control of whether they connect.
          </p>
          <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: 0 }}>
            Use of Atlas is subject to our{' '}
            <Link href="/terms-and-conditions" style={{ color: '#1C4A45' }}>
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy-policy" style={{ color: '#1C4A45' }}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
