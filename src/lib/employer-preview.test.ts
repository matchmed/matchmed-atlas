import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('employer practice preview (source)', () => {
  it('allowlists employer-preview and uses token RPC', () => {
    const routes = readFileSync(join(root, 'src/lib/public-routes.ts'), 'utf8')
    const page = readFileSync(
      join(root, 'src/app/practices/[id]/employer-preview/page.tsx'),
      'utf8',
    )
    const authorized = readFileSync(join(root, 'src/components/PracticeDetailAuthorized.tsx'), 'utf8')
    assert.match(routes, /isEmployerPreviewPath/)
    assert.match(page, /employer_fetch_practice_preview/)
    assert.match(page, /Retention Index|employerPreview/)
    assert.match(authorized, /Physician view/)
    assert.match(authorized, /Back to Physician-Ready profile/)
    assert.doesNotMatch(authorized, /Back to search/)
    assert.match(authorized, /employer_preview_opened/)
    assert.match(authorized, /Retention Index/)
    assert.match(
      readFileSync(join(root, 'src/app/practices/[id]/employer-preview/page.tsx'), 'utf8'),
      /backHref: `\$\{EMPLOYERS_PUBLIC_URL\}\/practices\/\$\{id\}`/,
    )
  })

  it('migration gates connect_practice_is_eligible on physician_ready_at', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/20260911190000_connect_physician_ready_and_preview.sql'),
      'utf8',
    )
    assert.match(sql, /epp\.physician_ready_at IS NOT NULL/)
    assert.match(sql, /employer_create_practice_preview_token/)
    assert.match(sql, /employer_fetch_practice_preview/)
    assert.match(sql, /Practice profile must be physician-ready before connecting with physicians/)
  })
})
