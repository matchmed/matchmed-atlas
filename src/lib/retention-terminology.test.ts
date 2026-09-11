import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { join } from 'node:path'

const root = process.cwd()

const ACTIVE_SURFACES = [
  'src/app/scoring-methodology/page.tsx',
  'src/app/HomePageClient.tsx',
  'src/app/practices/page.tsx',
  'src/app/favorites/page.tsx',
  'src/components/PracticeDetailAuthorized.tsx',
  'src/components/PracticeDetailPublic.tsx',
  'src/app/admin/report-builder/page.tsx',
  'src/app/terms-and-conditions/page.tsx',
] as const

describe('retention terminology — active physician-facing surfaces', () => {
  for (const rel of ACTIVE_SURFACES) {
    it(`${rel} has no user-facing Retention Score or Experience Level`, () => {
      const src = readFileSync(join(root, rel), 'utf8')
      assert.equal(src.includes('Retention Score'), false, `${rel} still contains "Retention Score"`)
      assert.equal(src.includes('Experience Level'), false, `${rel} still contains "Experience Level"`)
      assert.equal(src.includes('Retention score'), false, `${rel} still contains "Retention score"`)
    })
  }

  it('methodology and practice detail use Retention Index + median years label', () => {
    const methodology = readFileSync(join(root, 'src/app/scoring-methodology/page.tsx'), 'utf8')
    const authorized = readFileSync(join(root, 'src/components/PracticeDetailAuthorized.tsx'), 'utf8')
    assert.equal(methodology.includes('Retention Index'), true)
    assert.equal(methodology.includes('Median years since medical school'), true)
    assert.equal(authorized.includes('Retention Index'), true)
    assert.equal(authorized.includes('Median years since medical school'), true)
  })

  it('keeps internal retention_score field references (schema untouched)', () => {
    const authorized = readFileSync(join(root, 'src/components/PracticeDetailAuthorized.tsx'), 'utf8')
    assert.equal(authorized.includes('retention_score'), true)
  })
})
