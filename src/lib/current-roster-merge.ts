import type { EmployerOverlayRosterAssertion } from '@/lib/public-search'

export const CURRENT_PHYSICIANS_TOOLTIP =
  'Best-known current roster: CMS-observed current physicians plus active practice-reported current affiliations. Historical Retention Index metrics remain CMS-only.'

export const PRACTICE_REPORTED_CURRENT_LABEL = 'Practice-reported current'
export const PRACTICE_REPORTED_CURRENT_NOTE = 'Not yet reflected in latest CMS roster'

export type CmsAffiliationLike = {
  id: string
  npi?: string | null
  status: string | null
  doctors: { id: string; physician_name: string | null; npi: string } | null
}

export type MergedCurrentPhysician =
  | {
      source: 'cms'
      doctorId: string
      physicianName: string | null
      npi: string | null
      affiliation: CmsAffiliationLike
      employerAssertion: string | null
    }
  | {
      source: 'practice_reported'
      doctorId: string
      physicianName: string | null
      npi: string | null
      employerAssertion: 'confirm_current'
    }

function isCmsCurrentStatus(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === 'on roster'
}

/** Active confirm_current assertions that are not already CMS-current at this practice. */
export function practiceReportedCurrentOnly(
  assertions: EmployerOverlayRosterAssertion[] | undefined,
  cmsCurrentDoctorIds: Set<string>,
): EmployerOverlayRosterAssertion[] {
  return (assertions ?? []).filter(
    (row) =>
      row.assertion === 'confirm_current' &&
      !cmsCurrentDoctorIds.has(row.doctor_id) &&
      row.cms_current_at_practice !== true,
  )
}

/**
 * Merge CMS On-roster affiliations with active Layer 3 confirm_current assertions.
 * Dedupes by doctor_id. Does not change former/history lists.
 */
export function mergeCurrentPhysicians(
  affiliations: CmsAffiliationLike[],
  assertions: EmployerOverlayRosterAssertion[] | undefined,
): MergedCurrentPhysician[] {
  const cmsCurrent = affiliations.filter((a) => isCmsCurrentStatus(a.status))
  const assertionByDoctor = new Map(
    (assertions ?? []).map((row) => [row.doctor_id, row] as const),
  )
  const cmsIds = new Set(
    cmsCurrent.map((a) => a.doctors?.id).filter((id): id is string => Boolean(id)),
  )

  const merged: MergedCurrentPhysician[] = cmsCurrent.map((affiliation) => {
    const doctorId = affiliation.doctors?.id ?? ''
    const assertion = doctorId ? assertionByDoctor.get(doctorId) : undefined
    return {
      source: 'cms' as const,
      doctorId,
      physicianName: affiliation.doctors?.physician_name ?? null,
      npi: affiliation.doctors?.npi ?? affiliation.npi ?? null,
      affiliation,
      employerAssertion: assertion?.assertion ?? null,
    }
  })

  for (const row of practiceReportedCurrentOnly(assertions, cmsIds)) {
    merged.push({
      source: 'practice_reported',
      doctorId: row.doctor_id,
      physicianName: row.physician_name,
      npi: row.npi ?? null,
      employerAssertion: 'confirm_current',
    })
  }

  return merged.filter((row) => Boolean(row.doctorId))
}

export function mergedCurrentPhysicianCount(
  affiliations: CmsAffiliationLike[],
  assertions: EmployerOverlayRosterAssertion[] | undefined,
): number {
  return mergeCurrentPhysicians(affiliations, assertions).length
}
