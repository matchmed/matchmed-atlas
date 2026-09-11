import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { join } from 'node:path'

const root = process.cwd()

describe('practice detail Layer 3 hierarchy', () => {
  it('does not promote the first opportunity into a practice-level summary', () => {
    const authorized = readFileSync(join(root, 'src/components/PracticeDetailAuthorized.tsx'), 'utf8')
    assert.equal(authorized.includes('primaryOpportunity'), false)
    assert.equal(authorized.includes('practice-current-summary'), false)
    assert.equal(authorized.includes('hiringLine'), false)
    assert.match(authorized, /part="current"/)
  })

  it('renders Ownership Structure before Opportunities as peer sections', () => {
    const sections = readFileSync(
      join(root, 'src/components/EmployerPhysicianReadySections.tsx'),
      'utf8',
    )
    const ownershipIdx = sections.indexOf('>Ownership Structure</')
    const opportunitiesIdx = sections.indexOf('>Opportunities</')
    assert.ok(ownershipIdx > 0, 'Ownership Structure heading missing')
    assert.ok(opportunitiesIdx > ownershipIdx, 'Opportunities should follow Ownership Structure')
    assert.match(sections, /outlook\.opportunities\.map/)
    assert.match(sections, /outlook\.opportunities\.length > 0/)
  })
})
