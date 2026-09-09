'use client'

import ConnectPracticeCta from '@/components/ConnectPracticeCta'
import {
  formatOpportunityCompensation,
  opportunityHorizonLabel,
  OPPORTUNITY_REASON_LABELS,
} from '@/lib/opportunity-labels'
import type { EmployerPracticeOverlay } from '@/lib/public-search'

const OWNERSHIP_LABELS: Record<string, string> = {
  solo: 'Solo practice',
  physician_owned_group_practice: 'Physician-owned group practice',
  pe_mso_owned: 'PE/MSO-owned',
  hmo: 'HMO',
  nonacademic_hospital_health_system: 'Non-academic hospital / health system',
  academic_institution: 'Academic institution',
  other: 'Other',
}

export default function EmployerPhysicianReadySections({
  overlay,
  practiceId,
  showConnect = false,
}: {
  overlay: EmployerPracticeOverlay | null | undefined
  practiceId?: string
  /** Authorized practice detail can show Connect per opportunity. */
  showConnect?: boolean
}) {
  if (!overlay?.visible || !overlay.physician_ready) return null

  const attribution = overlay.attribution_label ?? 'Practice-reported'
  const ownership = overlay.ownership
  const outlook = overlay.recruiting_outlook
  const infrastructure = (overlay.infrastructure ?? []).filter(
    (c) => c.review_state === 'vendors_selected' && c.vendors.length > 0,
  )
  const fit = overlay.profile?.physician_fit_description
  const future = overlay.profile?.future_practice_description

  return (
    <div className="employer-physician-ready-sections">
      {ownership && (
        <section className="public-profile-section">
          <h2 className="public-profile-section-label">Practice ownership</h2>
          <div className="public-profile-card">
            <p className="public-profile-text">
              {OWNERSHIP_LABELS[ownership.structure] ?? ownership.structure}
              {ownership.structure === 'other' && ownership.other_text
                ? ` — ${ownership.other_text}`
                : ''}
            </p>
            <p className="public-profile-muted" style={{ marginTop: 8 }}>
              {attribution}
            </p>
          </div>
        </section>
      )}

      {outlook && outlook.opportunities.length > 0 && (
        <section className="public-profile-section">
          <h2 className="public-profile-section-label">Opportunities</h2>
          <div className="public-profile-card">
            <div style={{ display: 'grid', gap: 18 }}>
              {outlook.opportunities.map((opp) => (
                <div
                  key={opp.id ?? opp.clinical_focus}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    paddingBottom: 14,
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <p className="public-profile-text" style={{ fontWeight: 600, margin: 0 }}>
                        {opp.clinical_focus}
                      </p>
                      <p className="public-profile-muted" style={{ margin: '4px 0 0' }}>
                        {opportunityHorizonLabel(opp.hiring_horizon)}
                      </p>
                    </div>
                    {showConnect && practiceId && opp.id && (
                      <ConnectPracticeCta
                        practiceId={practiceId}
                        opportunityId={opp.id}
                        source="practice_opportunity"
                      />
                    )}
                  </div>
                  <p className="public-profile-muted" style={{ margin: 0 }}>
                    Reason:{' '}
                    {opp.reasons
                      .map((r) =>
                        r.reason === 'other' && r.other_text
                          ? r.other_text
                          : OPPORTUNITY_REASON_LABELS[r.reason] ?? r.reason,
                      )
                      .join(', ') || '—'}
                  </p>
                  <p className="public-profile-muted" style={{ margin: 0 }}>
                    Base compensation:{' '}
                    {formatOpportunityCompensation(
                      opp.base_compensation_min_usd,
                      opp.base_compensation_max_usd,
                      opp.base_compensation_max_is_open_ended,
                    )}
                  </p>
                  <p className="public-profile-muted" style={{ margin: 0 }}>
                    Productivity structure: {opp.productivity_structure_available ? 'Yes' : 'No'}
                    {' · '}
                    Signing bonus: {opp.signing_bonus_available ? 'Yes' : 'No'}
                    {' · '}
                    Relocation: {opp.relocation_assistance_available ? 'Yes' : 'No'}
                  </p>
                  {opp.hiring_notes && (
                    <p className="public-profile-text" style={{ margin: '4px 0 0' }}>
                      {opp.hiring_notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="public-profile-muted" style={{ marginTop: 4 }}>
              {attribution}
            </p>
          </div>
        </section>
      )}

      {infrastructure.length > 0 && (
        <section className="public-profile-section">
          <h2 className="public-profile-section-label">Clinical + practice technology</h2>
          <div className="public-profile-card">
            <div style={{ display: 'grid', gap: 12 }}>
              {infrastructure.map((cat) => (
                <div key={cat.category_slug}>
                  <p className="public-profile-text" style={{ fontWeight: 600 }}>
                    {cat.category_label}
                  </p>
                  <p className="public-profile-muted">
                    {cat.vendors
                      .map((v) => v.vendor_label || v.other_vendor_name)
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              ))}
            </div>
            <p className="public-profile-muted" style={{ marginTop: 12 }}>
              {attribution}
            </p>
          </div>
        </section>
      )}

      {(fit || future) && (
        <section className="public-profile-section">
          <h2 className="public-profile-section-label">About recruiting fit</h2>
          <div className="public-profile-card">
            {fit && (
              <>
                <p className="employer-recruiting-contact-label">What kind of physician thrives here?</p>
                <p className="public-profile-text">{fit}</p>
              </>
            )}
            {future && (
              <>
                <p className="employer-recruiting-contact-label" style={{ marginTop: 12 }}>
                  Building over the next 3–5 years
                </p>
                <p className="public-profile-text">{future}</p>
              </>
            )}
            <p className="public-profile-muted" style={{ marginTop: 12 }}>
              {attribution}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
