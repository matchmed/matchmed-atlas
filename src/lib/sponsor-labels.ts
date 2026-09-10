/** MAT-16 sponsor section labels and helpers (no DB). */

export const SPONSOR_SECTION_TYPES = [
  'whats_new',
  'education',
  'clinical_evidence',
  'connect',
  'training_product_info',
] as const

export type SponsorSectionType = (typeof SPONSOR_SECTION_TYPES)[number]

export const SPONSOR_SECTION_LABELS: Record<SponsorSectionType, string> = {
  whats_new: "What's New",
  education: 'Education',
  clinical_evidence: 'Clinical Evidence',
  connect: 'Connect',
  training_product_info: 'Training / Product Info',
}

export const SPONSOR_SECTION_BLURBS: Record<SponsorSectionType, string> = {
  whats_new: 'Current and upcoming developments relevant to ophthalmology.',
  education: 'Educational programs, wet labs, webinars, and events.',
  clinical_evidence: 'Sponsor-provided scientific and clinical materials.',
  connect: 'Explicit, user-initiated ways to engage with the partner.',
  training_product_info: 'Practical product, platform, and training resources.',
}

export function isSponsorSectionType(value: string): value is SponsorSectionType {
  return (SPONSOR_SECTION_TYPES as readonly string[]).includes(value)
}

/** Canonical Atlas route for a vendor slug (vendors.slug uses underscores). */
export function sponsorPageHref(
  slug: string,
  opts?: { reportedIn?: string | null },
): string {
  const base = `/partners/${encodeURIComponent(slug)}`
  const reportedIn = sanitizeReportedInCategory(opts?.reportedIn)
  if (!reportedIn) return base
  return `${base}?reported_in=${encodeURIComponent(reportedIn)}`
}

/**
 * Display-only category context from a referring practice-tech link.
 * Not an authorization or provenance source — never treated as verified practice data.
 */
export function sanitizeReportedInCategory(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  return cleaned.slice(0, 80)
}

export function defaultSponsorDisclosure(displayLabel: string): string {
  return `${displayLabel} is an Atlas industry partner. Partnership does not affect practice scores, rankings, Opportunities, physician visibility, or technology reporting.`
}

export type SponsorContentItem = {
  section_type: SponsorSectionType
  title: string
  description: string | null
  url: string | null
  event_date: string | null
  status_label: string | null
  cta_label: string | null
  sort_order: number
}

/** Group content items under the five primary sections (empty sections still listed by UI). */
export function groupSponsorSections(items: SponsorContentItem[]): Record<
  SponsorSectionType,
  SponsorContentItem[]
> {
  const groups: Record<SponsorSectionType, SponsorContentItem[]> = {
    whats_new: [],
    education: [],
    clinical_evidence: [],
    connect: [],
    training_product_info: [],
  }
  for (const item of items) {
    groups[item.section_type].push(item)
  }
  return groups
}
