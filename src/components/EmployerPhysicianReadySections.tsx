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

const HORIZON_LABELS: Record<string, string> = {
  now: 'Now',
  within_1_year: 'Within 1 year',
  within_2_years: 'Within 2 years',
  within_3_to_5_years: 'Within 3–5 years',
}

const REASON_LABELS: Record<string, string> = {
  growth: 'Practice growth',
  retiring_doctor: 'Replacing a retiring physician',
  new_subspecialty_offering: 'Adding a new subspecialty',
  recent_loss_of_doctor: 'Recent physician departure',
  other: 'Other',
}

function formatUsd(min: number, max: number | null, openEnded: boolean): string {
  const fmt = (n: number) =>
    n >= 1_000_000
      ? '$1,000,000+'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(n)
  if (openEnded) return `${fmt(min)}–$1,000,000+`
  return `${fmt(min)}–${fmt(max ?? min)}`
}

export default function EmployerPhysicianReadySections({
  overlay,
}: {
  overlay: EmployerPracticeOverlay | null | undefined
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

      {outlook && (
        <section className="public-profile-section">
          <h2 className="public-profile-section-label">Recruiting outlook</h2>
          <div className="public-profile-card">
            <p className="public-profile-text" style={{ fontWeight: 600 }}>
              {outlook.status === 'actively_recruiting'
                ? 'Actively recruiting now'
                : 'Open to future conversations'}
            </p>
            <div style={{ display: 'grid', gap: 16, marginTop: 14 }}>
              {outlook.opportunities.map((opp) => (
                <div key={opp.clinical_focus}>
                  <p className="public-profile-text" style={{ fontWeight: 600 }}>
                    {opp.clinical_focus}
                    {opp.actively_recruiting_now ? ' · Actively recruiting now' : ''}
                  </p>
                  <p className="public-profile-muted">
                    Expected hiring: {HORIZON_LABELS[opp.hiring_horizon] ?? opp.hiring_horizon}
                  </p>
                  <p className="public-profile-muted">
                    Reason:{' '}
                    {opp.reasons
                      .map((r) =>
                        r.reason === 'other' && r.other_text
                          ? r.other_text
                          : REASON_LABELS[r.reason] ?? r.reason,
                      )
                      .join(', ') || '—'}
                  </p>
                  <p className="public-profile-muted">
                    Base compensation:{' '}
                    {formatUsd(
                      opp.base_compensation_min_usd,
                      opp.base_compensation_max_usd,
                      opp.base_compensation_max_is_open_ended,
                    )}
                  </p>
                  <p className="public-profile-muted">
                    Productivity structure: {opp.productivity_structure_available ? 'Yes' : 'No'}
                  </p>
                  <p className="public-profile-muted">
                    Signing bonus: {opp.signing_bonus_available ? 'Yes' : 'No'}
                  </p>
                  <p className="public-profile-muted">
                    Relocation assistance: {opp.relocation_assistance_available ? 'Yes' : 'No'}
                  </p>
                  {opp.hiring_notes && (
                    <p className="public-profile-text" style={{ marginTop: 6 }}>
                      {opp.hiring_notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="public-profile-muted" style={{ marginTop: 12 }}>
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
