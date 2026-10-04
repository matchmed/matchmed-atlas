import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canonicalBriefUrl, sponsorBriefMailto } from './sponsor-mailto.ts'

describe('Prepare Email', () => {
  it('opens the local client with an empty recipient and only the canonical URL', () => {
    const url = canonicalBriefUrl('bausch-lomb', '2026-10')
    const href = sponsorBriefMailto({
      subject: 'October 2026 Bausch + Lomb Brief',
      canonicalUrl: url,
    })
    assert.equal(href.startsWith('mailto:?'), true)
    assert.equal(href.includes('mailto:?to='), false)
    const parsed = new URL(href)
    assert.equal(parsed.searchParams.get('body'), url)
    assert.equal(parsed.searchParams.get('subject'), 'October 2026 Bausch + Lomb Brief')
    assert.equal(parsed.searchParams.has('bcc'), false)
  })

  it('rejects an internal vendor slug and private query parameters', () => {
    assert.throws(() => sponsorBriefMailto({
      subject: 'Brief',
      canonicalUrl: 'https://atlas.matchmed.app/partners/bausch_plus_lomb/briefs/2026-10',
    }))
    assert.throws(() => sponsorBriefMailto({
      subject: 'Brief',
      canonicalUrl: 'https://atlas.matchmed.app/partners/bausch-lomb/briefs/2026-10?practice_id=1',
    }))
  })
})
