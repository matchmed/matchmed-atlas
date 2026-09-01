import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  practiceMapLabelName,
  practiceProfileDocumentTitle,
  resolvePracticePublicName,
} from './practice-display-name.ts'

describe('resolvePracticePublicName', () => {
  it('prefers approved employer public_display_name', () => {
    assert.equal(
      resolvePracticePublicName('JOHN-KENYON', 'BENNETT & BLOOM EYE CENTERS'),
      'BENNETT & BLOOM EYE CENTERS',
    )
  })

  it('falls back to CMS practice_name when no approved name exists', () => {
    assert.equal(resolvePracticePublicName('JOHN-KENYON', null), 'JOHN-KENYON')
    assert.equal(resolvePracticePublicName('JOHN-KENYON', '   '), 'JOHN-KENYON')
    assert.equal(resolvePracticePublicName('JOHN-KENYON', undefined), 'JOHN-KENYON')
  })

  it('uses fallback when both are empty', () => {
    assert.equal(resolvePracticePublicName(null, null), 'Practice')
    assert.equal(resolvePracticePublicName('', ''), 'Practice')
  })
})

describe('practiceProfileDocumentTitle (page metadata)', () => {
  it('uses approved name in the browser title', () => {
    assert.equal(
      practiceProfileDocumentTitle('JOHN-KENYON', 'BENNETT & BLOOM EYE CENTERS'),
      'BENNETT & BLOOM EYE CENTERS · MatchMed Atlas',
    )
  })

  it('falls back to CMS name in the browser title', () => {
    assert.equal(
      practiceProfileDocumentTitle('JOHN-KENYON', null),
      'JOHN-KENYON · MatchMed Atlas',
    )
  })

  it('uses generic title when no name is available', () => {
    assert.equal(practiceProfileDocumentTitle(null, null), 'Practice · MatchMed Atlas')
  })
})

describe('practiceMapLabelName (map popup / pin label)', () => {
  it('uses approved name for map labels', () => {
    assert.equal(
      practiceMapLabelName('JOHN-KENYON', 'BENNETT & BLOOM EYE CENTERS'),
      'BENNETT & BLOOM EYE CENTERS',
    )
  })

  it('falls back to CMS name for map labels', () => {
    assert.equal(practiceMapLabelName('JOHN-KENYON', null), 'JOHN-KENYON')
  })
})
