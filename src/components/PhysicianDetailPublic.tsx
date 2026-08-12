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
    <div className="public-profile">
      <div className="public-profile-back">
        <Link href="/" className="public-profile-link">
          ← Back to search
        </Link>
      </div>

      <div className="public-profile-header is-physician">
        <div
          className="public-profile-avatar is-physician"
          style={{ background: bg, color: fg }}
        >
          {initials}
        </div>
        <div>
          <h1 className="font-serif public-profile-title is-physician">
            {name}
          </h1>
          {doctor.npi && (
            <div className="public-profile-meta">
              NPI: <span className="public-profile-meta-strong">{doctor.npi}</span>
            </div>
          )}
        </div>
      </div>

      <section className="public-profile-section" aria-labelledby="current-affil-heading">
        <h2 id="current-affil-heading" className="public-profile-section-label is-accent">
          Current observed affiliation{affiliations.length === 1 ? '' : 's'}
        </h2>
        {affiliations.length === 0 ? (
          <p className="public-profile-muted">No current CMS-observed affiliation listed.</p>
        ) : (
          <ul className="public-profile-card-list">
            {affiliations.map((a, idx) => {
              const loc = formatPublicCityState(a.city, a.state)
              const key = a.practice_id || `${a.practice_name || 'affil'}-${idx}`
              const body = (
                <>
                  <div className="public-profile-card-title">
                    {a.practice_name || 'Practice'}
                  </div>
                  {loc && <div className="public-profile-card-meta">{loc}</div>}
                  {a.latest_cms_observation_year != null && (
                    <div className="public-profile-card-detail">
                      Latest CMS observation: {a.latest_cms_observation_year}
                    </div>
                  )}
                </>
              )
              return (
                <li key={key} className="public-profile-card">
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

      <section className="public-profile-caveats" aria-labelledby="phys-caveats-heading">
        <h2 id="phys-caveats-heading" className="public-profile-caveats-title">
          Data notes
        </h2>
        <p className="public-profile-caveats-body">
          Affiliations reflect CMS-observed billing relationships and may lag recent changes.{' '}
          <Link href="/scoring-methodology" className="public-profile-link">Scoring methodology</Link>
        </p>
      </section>
    </div>
  )
}
