import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { PUBLIC_SPONSOR_BRIEFS_ANONYMOUS } from './sponsor-launch.ts'

describe('public brief exposure', () => {
  it('does not allow anonymous access during this pass', () => {
    const routes = readFileSync(new URL('./public-routes.ts', import.meta.url), 'utf8')
    assert.equal(PUBLIC_SPONSOR_BRIEFS_ANONYMOUS, false)
    assert.match(routes, /PUBLIC_SPONSOR_BRIEFS_ANONYMOUS && PUBLIC_BRIEF/)
    assert.doesNotMatch(routes, /pathname === '\/partners'/)
  })
})
