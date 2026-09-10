import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultSponsorDisclosure,
  groupSponsorSections,
  isSponsorSectionType,
  sanitizeReportedInCategory,
  SPONSOR_SECTION_LABELS,
  SPONSOR_SECTION_TYPES,
  sponsorPageHref,
  type SponsorContentItem,
} from './sponsor-labels.ts'

describe('sponsor-labels', () => {
  it('exposes five primary section types with labels', () => {
    assert.equal(SPONSOR_SECTION_TYPES.length, 5)
    for (const t of SPONSOR_SECTION_TYPES) {
      assert.ok(SPONSOR_SECTION_LABELS[t])
      assert.equal(isSponsorSectionType(t), true)
    }
    assert.equal(isSponsorSectionType('ads'), false)
  })

  it('builds canonical partner href from vendor slug', () => {
    assert.equal(sponsorPageHref('bausch_plus_lomb'), '/partners/bausch_plus_lomb')
    assert.equal(
      sponsorPageHref('bausch_plus_lomb', { reportedIn: 'IOL / Lens Platforms' }),
      '/partners/bausch_plus_lomb?reported_in=IOL%20%2F%20Lens%20Platforms',
    )
  })

  it('sanitizes reported_in as display-only context', () => {
    assert.equal(sanitizeReportedInCategory('  IOL / Lens Platforms  '), 'IOL / Lens Platforms')
    assert.equal(sanitizeReportedInCategory('a'.repeat(120))?.length, 80)
    assert.equal(sanitizeReportedInCategory(' \n\t '), null)
  })

  it('builds default independence disclosure', () => {
    const text = defaultSponsorDisclosure('Bausch + Lomb')
    assert.match(text, /Atlas industry partner/)
    assert.match(text, /does not affect practice scores/)
  })
})

describe('groupSponsorSections', () => {
  it('groups items and keeps empty sections available', () => {
    const items: SponsorContentItem[] = [
      {
        section_type: 'whats_new',
        title: 'A',
        description: null,
        url: null,
        event_date: null,
        status_label: null,
        cta_label: null,
        sort_order: 1,
        image_url: null,
        image_alt: null,
      },
      {
        section_type: 'connect',
        title: 'Talk to a peer surgeon',
        description: null,
        url: 'https://example.com',
        event_date: null,
        status_label: null,
        cta_label: 'Talk to a peer surgeon',
        sort_order: 1,
        image_url: null,
        image_alt: null,
      },
    ]
    const grouped = groupSponsorSections(items)
    assert.equal(grouped.whats_new.length, 1)
    assert.equal(grouped.connect.length, 1)
    assert.equal(grouped.education.length, 0)
    assert.equal(grouped.clinical_evidence.length, 0)
    assert.equal(grouped.training_product_info.length, 0)
  })
})
