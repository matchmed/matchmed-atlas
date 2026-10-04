import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  archivedBriefReadable,
  directoryListsSponsor,
  libraryItemReadable,
  type SponsorSurfaceInput,
} from './sponsor-visibility.ts'

const now = '2026-10-03T16:00:00.000Z'

function base(overrides: Partial<SponsorSurfaceInput> = {}): SponsorSurfaceInput {
  return {
    isActive: true,
    audienceEnabled: true,
    directoryVisible: true,
    publicationState: 'published',
    companyApproved: true,
    matchmedApproved: true,
    verified: true,
    illustrative: false,
    publishedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: null,
    now,
    ...overrides,
  }
}

describe('sponsor visibility precedence', () => {
  it('requires an active sponsor, audience, and approved published content', () => {
    assert.equal(libraryItemReadable(base()), true)
    assert.equal(libraryItemReadable(base({ isActive: false })), false)
    assert.equal(libraryItemReadable(base({ audienceEnabled: false })), false)
    assert.equal(libraryItemReadable(base({ companyApproved: false })), false)
    assert.equal(libraryItemReadable(base({ matchmedApproved: false })), false)
    assert.equal(libraryItemReadable(base({ verified: false })), false)
    assert.equal(libraryItemReadable(base({ publicationState: 'draft' })), false)
    assert.equal(libraryItemReadable(base({ publicationState: 'scheduled', publishedAt: '2026-11-01T00:00:00.000Z' })), false)
    assert.equal(libraryItemReadable(base({ illustrative: true })), false)
    assert.equal(libraryItemReadable(base({ expiresAt: '2026-10-02T00:00:00.000Z' })), false)
  })

  it('uses directory visibility only after the page itself is readable', () => {
    assert.equal(directoryListsSponsor(base()), true)
    assert.equal(directoryListsSponsor(base({ directoryVisible: false })), false)
    assert.equal(directoryListsSponsor(base({ isActive: false, directoryVisible: true })), false)
    assert.equal(directoryListsSponsor(base({ publicationState: 'draft' })), false)
  })

  it('keeps an archived brief readable only while the sponsor is active and it was not withdrawn', () => {
    const archived = {
      isActive: true,
      audienceEnabled: true,
      companyApproved: true,
      matchmedApproved: true,
      verified: true,
      illustrative: false,
      publishedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: null,
      publicSharing: true,
      withdrawn: false,
      recalled: false,
    }
    assert.equal(archivedBriefReadable(archived), true)
    assert.equal(archivedBriefReadable({ ...archived, isActive: false }), false)
    assert.equal(archivedBriefReadable({ ...archived, withdrawn: true }), false)
  })
})
