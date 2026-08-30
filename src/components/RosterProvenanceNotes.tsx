import { employerAssertionLabel } from '@/lib/public-search'

export default function RosterProvenanceNotes({
  cmsStatus,
  employerAssertion,
  compact = false,
}: {
  cmsStatus?: string | null
  employerAssertion?: string | null
  compact?: boolean
}) {
  const cms = cmsStatus?.trim()
  const assertion = employerAssertion?.trim()
  if (!cms && !assertion) return null

  return (
    <p className={`roster-provenance${compact ? ' is-compact' : ''}`}>
      {cms && (
        <span>
          <span className="roster-provenance-kicker">CMS observed:</span>{' '}
          <span className="roster-provenance-value">{cms}</span>
        </span>
      )}
      {cms && assertion && <span className="roster-provenance-sep" aria-hidden="true"> · </span>}
      {assertion && (
        <span>
          <span className="roster-provenance-kicker">Practice reports:</span>{' '}
          <span className="roster-provenance-value">{employerAssertionLabel(assertion)}</span>
        </span>
      )}
    </p>
  )
}
