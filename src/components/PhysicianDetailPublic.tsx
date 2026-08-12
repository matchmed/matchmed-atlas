import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import {
  formatPublicCityState,
  publicGetPhysician,
} from '@/lib/public-search'
import UnlockAnalysisCta from '@/components/UnlockAnalysisCta'
import { nameToColor, getInitials } from '@/lib/utils'

export default async function PhysicianDetailPublic({ id }: { id: string }) {
  const supabase = await createClient()
  const { data: doctor } = await publicGetPhysician(supabase, id)

  if (!doctor) {
    return (
      <div style={{ padding: 40, color: '#aaa', textAlign: 'center' }}>
        Physician not found.
      </div>
    )
  }

  const name = doctor.physician_name || 'Physician'
  const [fg, bg] = nameToColor(name)
  const initials = getInitials(name)
  const nextPath = `/physicians/${doctor.id}`
  const affiliations = doctor.current_affiliations || []

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ fontSize: 13, color: '#1C4A45' }}>
          ← Back to search
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: bg,
            color: fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div>
          <h1 className="font-serif" style={{ fontSize: 22, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 8 }}>
            {name}
          </h1>
          {doctor.npi && (
            <div style={{ fontSize: 13, color: '#888' }}>
              NPI: <span style={{ color: '#444', fontWeight: 500 }}>{doctor.npi}</span>
            </div>
          )}
        </div>
      </div>

      <section style={{ marginBottom: 28 }} aria-labelledby="current-affil-heading">
        <h2 id="current-affil-heading" style={{ fontSize: 11, fontWeight: 600, color: '#1A6B3A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Current observed affiliation{affiliations.length === 1 ? '' : 's'}
        </h2>
        {affiliations.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888' }}>No current CMS-observed affiliation listed.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {affiliations.map((a, idx) => {
              const loc = formatPublicCityState(a.city, a.state)
              const key = a.practice_id || `${a.practice_name || 'affil'}-${idx}`
              const body = (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                    {a.practice_name || 'Practice'}
                  </div>
                  {loc && <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{loc}</div>}
                  {a.latest_cms_observation_year != null && (
                    <div style={{ fontSize: 12, color: '#666' }}>
                      Latest CMS observation: {a.latest_cms_observation_year}
                    </div>
                  )}
                </>
              )
              return (
                <li
                  key={key}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e8e8e8',
                    borderRadius: 10,
                    padding: '16px 18px',
                    marginBottom: 10,
                  }}
                >
                  {a.practice_id ? (
                    <Link href={`/practices/${a.practice_id}`} style={{ display: 'block', color: 'inherit' }}>
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="locked-analysis-module" aria-labelledby="locked-career-heading">
        <h2 id="locked-career-heading" className="locked-analysis-module-label">
          Career history
        </h2>

        <div className="locked-analysis-module-body">
          <UnlockAnalysisCta
            className="unlock-cta-emphasis unlock-cta-bridge"
            nextPath={nextPath}
            title="Where has this physician practiced? How long did they stay?"
            body="See previous affiliations, tenure, and career movement with Atlas."
          />

          <div className="locked-gate-stack">
            <div className="locked-career-gated" aria-hidden="true">
              <div className="locked-career-timeline">
                <div className="locked-career-rail">
                  {[0, 1, 2, 3].map(i => (
                    <span key={i} className="locked-career-dot" />
                  ))}
                </div>
                <div className="locked-career-segments">
                  <div className="locked-skel-line locked-skel-line-md" />
                  <div className="locked-skel-line locked-skel-line-sm" />
                </div>
              </div>
            </div>

            <div className="locked-former-block">
              <div className="locked-section-subhead">Previous affiliations</div>
              <div className="locked-former-gated">
                <div className="locked-former-list" aria-hidden="true">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="locked-affil-row">
                      <div className="locked-affil-main">
                        <div className="locked-skel-line locked-skel-line-lg" />
                        <div className="locked-skel-line locked-skel-line-sm" />
                      </div>
                      <div className="locked-affil-meta">
                        <div className="locked-skel-chip" />
                        <div className="locked-skel-line locked-skel-line-xs" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="locked-analysis-fade" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="phys-caveats-heading" style={{ borderTop: '1px solid #e8e5df', paddingTop: 18 }}>
        <h2 id="phys-caveats-heading" style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
          Data notes
        </h2>
        <p style={{ fontSize: 12, color: '#777', lineHeight: 1.55, margin: 0 }}>
          Affiliations reflect CMS-observed billing relationships and may lag recent changes.{' '}
          <Link href="/scoring-methodology" style={{ color: '#1C4A45' }}>Scoring methodology</Link>
        </p>
      </section>
    </div>
  )
}
