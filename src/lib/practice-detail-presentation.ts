/** Inclusive CMS calendar-year span stored as tenure_years (last − first + 1), capped in UI at 8+. */

export const EXPERIENCE_LEVEL_CAPTION =
  'Current roster seniority based on median years since medical school. Higher values indicate a more senior roster. Not part of the Retention Score.'

export const SHORTER_OBSERVED_TENURE_LABEL = 'Shorter observed tenures'
export const SHORTER_OBSERVED_TENURE_NOTE = 'Departures within 4 observed years'

export const OWNERSHIP_LABELS: Record<string, string> = {
  solo: 'Solo practice',
  physician_owned_group_practice: 'Physician-owned group practice',
  pe_mso_owned: 'PE/MSO-backed',
  hmo: 'HMO',
  nonacademic_hospital_health_system: 'Hospital / health system',
  academic_institution: 'Academic',
  other: 'Other',
}

export function ownershipLabel(structure: string, otherText?: string | null): string {
  const base = OWNERSHIP_LABELS[structure] ?? structure
  if (structure === 'other' && otherText?.trim()) return `${base} — ${otherText.trim()}`
  return base
}

/** Display-only label. Does not recompute stored tenure_years. */
export function observedCmsYearsLabel(tenureYears: number | null | undefined): string {
  const n = tenureYears ?? 0
  if (n >= 8) return '8+ CMS years observed'
  if (n === 1) return '1 CMS year observed'
  return `${n} CMS years observed`
}

export function observedYearRangeLabel(
  firstYear: number | null | undefined,
  lastYear: number | null | undefined,
): string | null {
  if (firstYear == null || lastYear == null) return null
  return `Observed ${firstYear}–${lastYear}`
}

type ComparableLocation = {
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}

function locationKey(loc: ComparableLocation): string {
  const zip = (loc.zip || '').replace(/\D/g, '').slice(0, 5)
  return [
    (loc.address || '').trim().toLowerCase().replace(/\s+/g, ' '),
    (loc.city || '').trim().toLowerCase(),
    (loc.state || '').trim().toLowerCase(),
    zip,
  ].join('|')
}

/** True when practice-reported and CMS location sets are the same after light normalization. */
export function locationSetsMatch(
  cms: ComparableLocation[],
  practiceReported: ComparableLocation[],
): boolean {
  if (cms.length === 0 || practiceReported.length === 0) return false
  const cmsKeys = new Set(cms.map(locationKey))
  const reportedKeys = new Set(practiceReported.map(locationKey))
  if (cmsKeys.size !== reportedKeys.size) return false
  for (const key of cmsKeys) {
    if (!reportedKeys.has(key)) return false
  }
  return true
}
