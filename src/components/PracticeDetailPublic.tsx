import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import {
  publicGetPractice,
  publicGetPracticeLocations,
  publicGetPracticeRoster,
} from '@/lib/public-search'
import PublicPracticeLocations from '@/components/PublicPracticeLocations'
import PublicPracticeRoster from '@/components/PublicPracticeRoster'
import UnlockAnalysisCta from '@/components/UnlockAnalysisCta'
import { nameToColor, getInitials, scoreColor, scoreBg } from '@/lib/utils'

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
  const hasScore = practice.retention_score != null
  const scoreLabel = hasScore ? practice.retention_score!.toFixed(1) : '—'

  return (
    <div className="public-profile">
      <div className="public-profile-back">
        <Link href="/" className="public-profile-link">
          ← Back to search
        </Link>
      </div>

      <div className="public-profile-header">
        <div
          className="public-profile-avatar is-practice"
          style={{ background: bg, color: fg }}
        >
          {initials}
        </div>
        <div className="public-profile-identity">
          <h1 className="font-serif public-profile-title is-practice">
            {name}
          </h1>
          <div className="public-profile-contact">
            {practice.phone && (
              <a href={`tel:${practice.phone}`} className="public-profile-link">
                {practice.phone}
              </a>
            )}
            {practice.website && (
              <a
                href={practice.website.startsWith('http') ? practice.website : `https://${practice.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="public-profile-link"
                style={{ wordBreak: 'break-all' }}
              >
                {practice.website}
              </a>
            )}
          </div>
        </div>
      </div>

      <PublicPracticeLocations locations={locations} />

      <PublicPracticeRoster roster={roster} />

      <section className="locked-analysis-module" aria-labelledby="locked-analysis-heading">
        <h2 id="locked-analysis-heading" className="locked-analysis-module-label">
          Atlas analysis
        </h2>

        <div className="locked-analysis-module-body">
          <div className="locked-metric-grid is-three">
            <div
              className="locked-metric-card is-public locked-metric-card-score"
              style={{ background: scoreBg(practice.retention_score) }}
            >
              <div className="locked-metric-label">Retention Score</div>
              <div className="locked-metric-value">
                <span
                  className="locked-metric-score-number"
                  style={{ color: scoreColor(practice.retention_score) }}
                >
                  {scoreLabel}
                </span>
                {hasScore && <span className="locked-metric-score-scale"> / 100</span>}
              </div>
              <p className="locked-metric-score-note">
                Higher scores reflect greater observed physician retention.
              </p>
            </div>
            <div className="locked-metric-card is-locked">
              <div className="locked-metric-label">Experience Level</div>
              <div className="locked-metric-skeleton" aria-hidden="true" />
            </div>
            <div className="locked-metric-card is-public">
              <div className="locked-metric-label">CMS Observation</div>
              <div className="locked-metric-value">
                {practice.latest_cms_observation_year?.toString() ?? '—'}
              </div>
            </div>
          </div>

          <UnlockAnalysisCta
            className="unlock-cta-emphasis unlock-cta-bridge"
            nextPath={nextPath}
            title="Why did this practice score this way?"
            body="See physician tenure, former physician history, and the full Atlas analysis."
          />

          <div className="locked-gate-stack">
            <div className="locked-tenure-block">
              <div className="locked-section-subhead">Tenure outcomes among all physicians observed since 2019</div>
              <div className="locked-tenure-bars">
                {(['0–1', '2–3', '4–5', '6–7', '8+ observed yrs'] as const).map((label, i) => (
                  <div key={label} className="locked-tenure-row">
                    <span
                      className="locked-tenure-label"
                      title={label === '8+ observed yrs'
                        ? 'Affiliations are observed beginning in 2019. Physicians already affiliated at the start of the data window may have longer actual tenure.'
                        : undefined}
                    >{label}</span>
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
          </div>
        </div>
      </section>

      <section className="public-profile-caveats" aria-labelledby="caveats-heading">
        <h2 id="caveats-heading" className="public-profile-caveats-title">
          Data notes
        </h2>
        <p className="public-profile-caveats-body">
          Atlas draws from the CMS Doctors and Clinicians database (billing-focused observations, not a complete employment registry).
          Rosters and locations can lag real-world changes.
        </p>
        <p className="public-profile-caveats-body">
          <Link href="/scoring-methodology" className="public-profile-link">Scoring methodology</Link>
          {' · '}
          Signed-in users can report corrections from the full practice page.
        </p>
      </section>
    </div>
  )
}
