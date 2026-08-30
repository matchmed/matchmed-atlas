import type { EmployerOverlayRosterAssertion } from '@/lib/public-search'

export function assertionsByDoctorId(
  assertions: EmployerOverlayRosterAssertion[] | undefined,
): Map<string, EmployerOverlayRosterAssertion> {
  const map = new Map<string, EmployerOverlayRosterAssertion>()
  for (const row of assertions ?? []) {
    map.set(row.doctor_id, row)
  }
  return map
}
