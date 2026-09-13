import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mergeCurrentPhysicians,
  mergedCurrentPhysicianCount,
  practiceReportedCurrentOnly,
  PRACTICE_REPORTED_CURRENT_LABEL,
} from './current-roster-merge.ts'
import type { EmployerOverlayRosterAssertion } from './public-search.ts'

function aff(id: string, doctorId: string, status: string, name = 'Doc') {
  return {
    id,
    npi: '111',
    status,
    doctors: { id: doctorId, physician_name: name, npi: '111' },
  }
}

function assertion(
  doctorId: string,
  opts: Partial<EmployerOverlayRosterAssertion> = {},
): EmployerOverlayRosterAssertion {
  return {
    doctor_id: doctorId,
    physician_name: 'Doc',
    npi: null,
    assertion: 'confirm_current',
    asserted_at: null,
    cms_confirmed_at: null,
    cms_current_at_practice: false,
    ...opts,
  }
}

describe('current-roster-merge', () => {
  it('dedupes CMS current + practice-reported for the same doctor', () => {
    const merged = mergeCurrentPhysicians(
      [aff('a1', 'd1', 'On roster', 'Alice')],
      [assertion('d1')],
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0].source, 'cms')
    assert.equal(merged[0].employerAssertion, 'confirm_current')
  })

  it('adds Layer 3-only physicians to current roster', () => {
    const merged = mergeCurrentPhysicians(
      [aff('a1', 'd1', 'On roster', 'Alice')],
      [assertion('d2', { physician_name: 'Bob', npi: '222' })],
    )
    assert.equal(merged.length, 2)
    assert.equal(merged[1].source, 'practice_reported')
    assert.equal(merged[1].physicianName, 'Bob')
    assert.equal(PRACTICE_REPORTED_CURRENT_LABEL.includes('Practice-reported'), true)
  })

  it('does not treat former CMS physicians as current unless practice-reported', () => {
    const merged = mergeCurrentPhysicians(
      [aff('a1', 'd1', 'Not on roster', 'Alice')],
      [assertion('d1')],
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0].source, 'practice_reported')
  })

  it('excludes practice-reported rows already flagged cms_current_at_practice', () => {
    const only = practiceReportedCurrentOnly(
      [assertion('d1', { cms_current_at_practice: true })],
      new Set(),
    )
    assert.equal(only.length, 0)
  })

  it('counts unique merged current physicians', () => {
    assert.equal(
      mergedCurrentPhysicianCount(
        [aff('a1', 'd1', 'On roster'), aff('a2', 'd2', 'Not on roster')],
        [assertion('d1'), assertion('d3')],
      ),
      2,
    )
  })
})
