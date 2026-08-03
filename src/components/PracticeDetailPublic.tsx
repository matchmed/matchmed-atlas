import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import {
  formatPublicCityState,
  publicGetPractice,
  publicGetPracticeLocations,
  publicGetPracticeRoster,
} from '@/lib/public-search'
import PracticeLocationsDisclaimer from '@/components/PracticeLocationsDisclaimer'
import UnlockAnalysisCta from '@/components/UnlockAnalysisCta'
import { nameToColor, getInitials } from '@/lib/utils'

function formatLocationLine(loc: {
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}): string {
  const parts = [
    (loc.address || '').trim(),
    formatPublicCityState(loc.city, loc.state),
    (loc.zip || '').trim(),
  ].filter(Boolean)
  return parts.join(' · ')
}

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

  const placeholderMetrics = [
    { label: 'Retention Score', value: '—' },
    { label: 'Experience Level', value: '—' },
    { label: 'Current Roster', value: practice.latest_roster_size?.toString() ?? '—' },
    { label: 'CMS Observation', value: practice.latest_cms_observation_year?.toString() ?? '—' },
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

      <section style={{ marginBottom: 28 }} aria-labelledby="public-locations-heading">
        <h2 id="public-locations-heading" style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
          Locations
        </h2>
        {locations.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888' }}>No CMS billing locations listed.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {locations.map(loc => (
              <li key={loc.id} style={{ fontSize: 13, color: '#555', lineHeight: 1.45 }}>
                {formatLocationLine(loc) || 'Location'}
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 8 }}>
          <PracticeLocationsDisclaimer />
        </div>
      </section>

      <section style={{ marginBottom: 28 }} aria-labelledby="locked-analysis-heading">
        <h2 id="locked-analysis-heading" style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
          Atlas analysis
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 16 }}>
          {placeholderMetrics.map(c => (
            <div
              key={c.label}
              style={{
                background: '#f3f1ec',
                borderRadius: 10,
                padding: '14px 12px',
                border: '0.5px solid rgba(0,0,0,0.07)',
              }}
            >
              <div style={{ fontSize: 11, color: '#888', marginBottom: 5, fontWeight: 500 }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#b0aaa0', lineHeight: 1.1 }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
            Physician tenure distribution
          </div>
          {['0–1', '2–3', '4–5', '6–7', '8+'].map(label => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: '#888', width: 54, textAlign: 'right', flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, background: '#ebebeb', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                <div style={{ width: '18%', background: '#d9d4cb', height: '100%', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#bbb', width: 22 }}>—</span>
            </div>
          ))}
        </div>

        <div style={{ borderLeft: '3px solid #ccc', padding: '12px 16px', background: '#f9f9f9', borderRadius: '0 8px 8px 0', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6, margin: 0 }}>
            Workforce stability insights, score history, and former physicians are available after you create a free Atlas account.
          </p>
        </div>

        <UnlockAnalysisCta
          nextPath={nextPath}
          title="Unlock Full Atlas Analysis"
          body="Create a free account to review workforce stability, physician tenure, score history, and former physicians."
        />
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
