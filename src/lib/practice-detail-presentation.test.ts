import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  locationSetsMatch,
  observedCmsYearsLabel,
  observedYearRangeLabel,
  ownershipLabel,
} from './practice-detail-presentation.ts'

describe('practice-detail-presentation', () => {
  it('labels stored tenure as CMS years observed without recomputing', () => {
    assert.equal(observedCmsYearsLabel(8), '8+ CMS years observed')
    assert.equal(observedCmsYearsLabel(3), '3 CMS years observed')
    assert.equal(observedCmsYearsLabel(1), '1 CMS year observed')
    assert.equal(observedYearRangeLabel(2019, 2026), 'Observed 2019–2026')
    assert.equal(observedYearRangeLabel(2024, 2024), 'Observed 2024–2024')
  })

  it('collapses only identical location sets', () => {
    const cms = [{ address: '1530 N Lindbergh Cir', city: 'Wichita', state: 'KS', zip: '67206' }]
    assert.equal(locationSetsMatch(cms, [{ address: '1530 n lindbergh cir', city: 'Wichita', state: 'ks', zip: '67206-1234' }]), true)
    assert.equal(locationSetsMatch(cms, [{ address: '1 Other St', city: 'Wichita', state: 'KS', zip: '67206' }]), false)
    assert.equal(locationSetsMatch([], cms), false)
  })

  it('uses existing ownership labels without inference', () => {
    assert.equal(ownershipLabel('physician_owned_group_practice'), 'Physician-owned group practice')
    assert.equal(ownershipLabel('pe_mso_owned'), 'PE/MSO-backed')
    assert.equal(ownershipLabel('other', 'Independent'), 'Other — Independent')
  })
})