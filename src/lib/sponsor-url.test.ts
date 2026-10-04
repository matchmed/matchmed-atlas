import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isBlockedAddress, normalizeSponsorHttpsUrl, sponsorHttpsUrlProblem } from './sponsor-url.ts'

describe('sponsor HTTPS destinations', () => {
  it('rejects unsafe schemes, credentials, localhost, and private addresses', () => {
    assert.equal(sponsorHttpsUrlProblem('javascript:alert(1)'), 'scheme')
    assert.equal(sponsorHttpsUrlProblem('data:text/html,hi'), 'scheme')
    assert.equal(sponsorHttpsUrlProblem('//example.com'), 'protocol-relative')
    assert.equal(sponsorHttpsUrlProblem('https://user:pass@example.com/a'), 'credentials')
    assert.equal(sponsorHttpsUrlProblem('https://localhost/a'), 'local-host')
    assert.equal(sponsorHttpsUrlProblem('https://127.0.0.1/a'), 'private-address')
    assert.equal(sponsorHttpsUrlProblem('https://10.0.0.8/a'), 'private-address')
    assert.equal(sponsorHttpsUrlProblem('https://192.168.1.9/a'), 'private-address')
    assert.equal(sponsorHttpsUrlProblem('https://169.254.0.1/a'), 'private-address')
    assert.equal(sponsorHttpsUrlProblem('https://example.com/?practice_id=abc'), 'context-query')
    assert.equal(sponsorHttpsUrlProblem('http://example.com/a'), 'scheme')
  })

  it('normalizes a public https URL without adding context', () => {
    assert.equal(sponsorHttpsUrlProblem('https://Example.com/path'), null)
    assert.equal(normalizeSponsorHttpsUrl('https://Example.com/path'), 'https://example.com/path')
    assert.equal(isBlockedAddress('::1'), true)
    assert.equal(isBlockedAddress('example.com'), false)
  })
})
