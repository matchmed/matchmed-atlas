import type { EmployerOverlayRosterAssertion } from '@/lib/public-search'

export function formatRosterReviewedLabel(
  reviewedAt: string | null | undefined,
): string | null {
  if (!reviewedAt) return null
  const date = new Date(reviewedAt)
  if (Number.isNaN(date.getTime())) return null
  return `Roster last reviewed by practice, ${date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })}`
}

export function assertionsByDoctorId(
  assertions: EmployerOverlayRosterAssertion[] | undefined,
): Map<string, EmployerOverlayRosterAssertion> {
  const map = new Map<string, EmployerOverlayRosterAssertion>()
  for (const row of assertions ?? []) {
    map.set(row.doctor_id, row)
  }
  return map
}
