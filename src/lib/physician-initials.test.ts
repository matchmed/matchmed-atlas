import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getInitials } from './utils.ts'
import { getPhysicianInitials } from './physician-initials.ts'

describe('getPhysicianInitials canonical names', () => {
  it('uses first and last name for the reported physicians', () => {
    assert.equal(getPhysicianInitials({ firstName: 'AMIT', lastName: 'BAJAJ' }), 'AB')
    assert.equal(
      getPhysicianInitials({ firstName: 'EVAN DRESKIN', lastName: 'SCHOENBERG' }),
      'ES',
    )
    assert.equal(
      getPhysicianInitials({ firstName: 'THOMAS ELLIOT', lastName: 'EDWARDS' }),
      'TE',
    )
    assert.equal(getPhysicianInitials({ firstName: 'GERARDO', lastName: 'PARADA' }), 'GP')
    assert.equal(getPhysicianInitials({ firstName: 'EUGENE', lastName: 'GABIANELLI' }), 'EG')
  })

  it('ignores a last-name-first display string when canonical fields are present', () => {
    assert.equal(
      getPhysicianInitials({
        firstName: 'AMIT',
        lastName: 'BAJAJ',
        displayName: 'WRONG, NAME',
      }),
      'AB',
    )
  })

  it('does not let a middle name replace the last-name initial', () => {
    assert.equal(
      getPhysicianInitials({ firstName: 'EVAN DRESKIN', lastName: 'SCHOENBERG' }),
      'ES',
    )
    assert.notEqual(
      getPhysicianInitials({ firstName: 'EVAN DRESKIN', lastName: 'SCHOENBERG' }),
      'ED',
    )
    assert.equal(getPhysicianInitials('SCHOENBERG, EVAN DRESKIN'), 'ES')
    assert.equal(getPhysicianInitials('EDWARDS, THOMAS ELLIOT'), 'TE')
  })

  it('uses the first character of hyphenated and multi-part surnames', () => {
    assert.equal(
      getPhysicianInitials({ firstName: 'ANNE-MARIE', lastName: 'SMITH-JONES' }),
      'AS',
    )
    assert.equal(getPhysicianInitials('SMITH-JONES, ANNE-MARIE'), 'AS')
    assert.equal(
      getPhysicianInitials({ firstName: 'ANNA', lastName: 'VAN DER BERG' }),
      'AV',
    )
    assert.equal(getPhysicianInitials('VAN DER BERG, ANNA MARIE'), 'AV')
  })

  it('returns one initial when only one canonical component exists', () => {
    assert.equal(getPhysicianInitials({ firstName: null, lastName: 'BAJAJ' }), 'B')
    assert.equal(getPhysicianInitials({ firstName: 'AMIT', lastName: null }), 'A')
    assert.equal(
      getPhysicianInitials({ firstName: '   ', lastName: 'BAJAJ', displayName: 'BAJAJ, AMIT' }),
      'B',
    )
  })

  it('trims whitespace and uppercases lowercase input', () => {
    assert.equal(getPhysicianInitials({ firstName: '  amit ', lastName: ' bajaj ' }), 'AB')
    assert.equal(getPhysicianInitials('  bajaj, amit  '), 'AB')
    assert.equal(getPhysicianInitials('schoenberg, evan dreskin'), 'ES')
  })

  it('uses the existing neutral fallback when nothing is usable', () => {
    assert.equal(getPhysicianInitials(null), '?')
    assert.equal(getPhysicianInitials(undefined), '?')
    assert.equal(getPhysicianInitials(''), '?')
    assert.equal(getPhysicianInitials('   '), '?')
    assert.equal(getPhysicianInitials({ firstName: null, lastName: null, displayName: null }), '?')
    assert.equal(getPhysicianInitials({ firstName: '', lastName: '  ', displayName: '' }), '?')
  })
})

describe('last-name-first display fallback', () => {
  it('derives initials from CMS LAST, FIRST MIDDLE strings', () => {
    assert.equal(getPhysicianInitials('BAJAJ, AMIT'), 'AB')
    assert.equal(getPhysicianInitials('SCHOENBERG, EVAN DRESKIN'), 'ES')
    assert.equal(getPhysicianInitials('EDWARDS, THOMAS ELLIOT'), 'TE')
    assert.equal(getPhysicianInitials('PARADA, GERARDO'), 'GP')
    assert.equal(getPhysicianInitials('GABIANELLI, EUGENE'), 'EG')
  })

  it('handles a single name and does not throw on unicode', () => {
    assert.equal(getPhysicianInitials('PRINCE'), 'P')
    assert.equal(getPhysicianInitials('BAJAJ,'), 'B')
    assert.equal(getPhysicianInitials(', AMIT'), 'A')
    assert.equal(getPhysicianInitials('ÑUÑEZ, JOSÉ'), 'JÑ')
    assert.equal(typeof getPhysicianInitials('测试, 😀'), 'string')
  })
})

describe('practice initials stay on the shared helper', () => {
  it('still takes the first two words of a practice name', () => {
    assert.equal(getInitials('Arizona Eye'), 'AE')
    assert.equal(getInitials(''), '?')
  })
})
