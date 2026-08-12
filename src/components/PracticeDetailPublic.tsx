import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import {
  publicGetPractice,
  publicGetPracticeLocations,
  publicGetPracticeRoster,
} from '@/lib/public-search'
import PublicPracticeLocations from '@/components/PublicPracticeLocations'
import UnlockAnalysisCta from '@/components/UnlockAnalysisCta'
import { nameToColor, getInitials } from '@/lib/utils'

/** Hard-coded neutral bar widths — not derived from any practice data. */
const TENURE_PLACEHOLDER_WIDTHS = ['42%', '68%', '54%', '36%', '58%'] as const

export default async function PracticeDetailPublic({ id }: { id: string }) {
  const supabase = await createClient()
  const [practiceRes, locationsRes, rosterRes] = await Promise.all([
    publicGetPractice(supabase, id),
    publicGetPracticeLocations(supabase, id),
    publicGetPracticeRoster(supabase, id),
  ])

  const practice = practiceRes.data
  if (!practice) {
    return (
      <div style={{ padding: 40, color: '#aaa', textAlign: 'center' }}>
        Practice not found.
      </div>
    )
  }

  const locations = locationsRes.data
  const roster = rosterRes.data
  const name = practice.practice_name || 'Practice'
  const [fg, bg] = nameToColor(name)
  const initials = getInitials(name)
  const nextPath = `/practices/${practice.id}`

  const metricCards = [
    { label: 'Retention Score', kind: 'locked' as const },
    { label: 'Experience Level', kind: 'locked' as const },
    {
      label: 'Current Roster',
      kind: 'public' as const,
      value: practice.latest_roster_size?.toString() ?? '—',
    },
    {
      label: 'CMS Observation',
      kind: 'public' as const,
      value: practice.latest_cms_observation_year?.toString() ?? '—',
    },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ fontSize: 13, color: '#1C4A45' }}>
          ← Back to search
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 28 }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 14,
            background: bg,
            color: fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 600,
            flexShrink: 0,
            letterSpacing: '-0.5px',
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="font-serif" style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 8, lineHeight: 1.2 }}>
            {name}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {practice.phone && (
              <a href={`tel:${practice.phone}`} style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}>
                {practice.phone}
              </a>
            )}
            {practice.website && (
              <a
                href={practice.website.startsWith('http') ? practice.website : `https://${practice.website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none', wordBreak: 'break-all' }}
              >
                {practice.website}
              </a>
            )}
          </div>
        </div>
      </div>

      <PublicPracticeLocations locations={locations} />

      <section className="locked-analysis-module" aria-labelledby="locked-analysis-heading">
        <h2 id="locked-analysis-heading" className="locked-analysis-module-label">
          Atlas analysis
        </h2>

        <div className="locked-analysis-module-body">
          {/* Public metric values stay sharp; locked metrics use static skeletons only. */}
          <div className="locked-metric-grid">
            {metricCards.map(c => (
              <div
                key={c.label}
                className={c.kind === 'locked' ? 'locked-metric-card is-locked' : 'locked-metric-card is-public'}
              >
                <div className="locked-metric-label">{c.label}</div>
                {c.kind === 'locked' ? (
                  <div className="locked-metric-skeleton" aria-hidden="true" />
                ) : (
                  <div className="locked-metric-value">{c.value}</div>
                )}
              </div>
            ))}
          </div>

          <div className="locked-gate-stack">
            <div className="locked-tenure-block">
              <div className="locked-section-subhead">Physician tenure distribution</div>
              <div className="locked-tenure-bars">
                {(['0–1', '2–3', '4–5', '6–7', '8+'] as const).map((label, i) => (
                  <div key={label} className="locked-tenure-row">
                    <span className="locked-tenure-label">{label}</span>
                    <div className="locked-tenure-gated" aria-hidden="true">
                      <div className="locked-tenure-track">
                        <div
                          className="locked-tenure-fill"
                          style={{ width: TENURE_PLACEHOLDER_WIDTHS[i] }}
                        />
                      </div>
                      <span className="locked-tenure-count" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="locked-former-block">
              <div className="locked-section-subhead">Former physician history</div>
              <div className="locked-former-gated">
                <div className="locked-former-list" aria-hidden="true">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="locked-former-row">
                      <div className="locked-former-avatar" />
                      <div className="locked-former-lines">
                        <div className="locked-skel-line locked-skel-line-lg" />
                        <div className="locked-skel-line locked-skel-line-sm" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="locked-analysis-fade" aria-hidden="true" />
              </div>
            </div>

            <UnlockAnalysisCta
              className="unlock-cta-overlay unlock-cta-emphasis"
              nextPath={nextPath}
              title="How long do physicians stay here? Who has left?"
              body="See the full Atlas analysis, including tenure, retention, and physician history."
            />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }} aria-labelledby="roster-heading">
        <p style={{ fontSize: 11, color: '#999', lineHeight: 1.5, margin: '0 0 12px' }}>
          Physician rosters reflect the latest CMS data and may lag recent departures or additions.
        </p>
        <h2 id="roster-heading" style={{ fontSize: 11, fontWeight: 600, color: '#1A6B3A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Currently observed physicians ({roster.length})
        </h2>
        {roster.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888' }}>No currently observed physicians listed.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {roster.map(doc => (
              <li key={doc.id} style={{ marginBottom: 8 }}>
                <Link
                  href={`/physicians/${doc.id}`}
                  style={{
                    display: 'block',
                    background: '#ffffff',
                    border: '1px solid #e8e8e8',
                    borderRadius: 10,
                    padding: '12px 14px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#1a1a1a',
                  }}
                >
                  {doc.physician_name || 'Physician'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="caveats-heading" style={{ borderTop: '1px solid #e8e5df', paddingTop: 18 }}>
        <h2 id="caveats-heading" style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
          Data notes
        </h2>
        <p style={{ fontSize: 12, color: '#777', lineHeight: 1.55, marginBottom: 8 }}>
          Atlas draws from the CMS Doctors and Clinicians database (billing-focused observations, not a complete employment registry).
          Rosters and locations can lag real-world changes.
        </p>
        <p style={{ fontSize: 12, color: '#777', lineHeight: 1.55, margin: 0 }}>
          <Link href="/scoring-methodology" style={{ color: '#1C4A45' }}>Scoring methodology</Link>
          {' · '}
          Signed-in users can report corrections from the full practice page.
        </p>
      </section>
    </div>
  )
}
