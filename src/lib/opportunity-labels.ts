/** Canonical Opportunity clinical focus — must match employer Layer 3 / Atlas onboarding. */
export const OPPORTUNITY_CLINICAL_FOCUS_VALUES = [
  'Cataract Surgery / Refractive Surgery',
  'Glaucoma (medical and/or surgical)',
  'Retinal Diseases +/- Uveitis',
  'Corneal Disease',
  'Dry Eye / Ocular Surface Disease',
  'Oculoplastics',
  'Neuro-ophthalmology / Strabismus',
  'Pediatric Ophthalmology',
  'General Ophthalmology (multiple areas)',
] as const

export type OpportunityClinicalFocus = (typeof OPPORTUNITY_CLINICAL_FOCUS_VALUES)[number]

export const OPPORTUNITY_HIRING_HORIZONS = [
  { value: 'now', label: 'Hiring now' },
  { value: 'within_1_year', label: 'Hiring within 1 year' },
  { value: 'within_2_years', label: 'Hiring within 2 years' },
  { value: 'within_3_to_5_years', label: 'Hiring in 3–5 years' },
] as const

export type OpportunityHiringHorizon = (typeof OPPORTUNITY_HIRING_HORIZONS)[number]['value']

export const OPPORTUNITY_REASON_LABELS: Record<string, string> = {
  growth: 'Practice growth',
  retiring_doctor: 'Replacing a retiring physician',
  new_subspecialty_offering: 'Adding a new subspecialty',
  recent_loss_of_doctor: 'Recent physician departure',
  other: 'Other',
}

export function opportunityHorizonLabel(horizon: string | null | undefined): string {
  const hit = OPPORTUNITY_HIRING_HORIZONS.find((h) => h.value === horizon)
  return hit?.label ?? horizon ?? 'Hiring timeline TBD'
}

export function formatOpportunityCompensation(
  min: number,
  max: number | null,
  openEnded: boolean,
): string {
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

export function formatOpportunityStates(states: string[] | null | undefined): string | null {
  if (!states || states.length === 0) return null
  return states.join(', ')
}
