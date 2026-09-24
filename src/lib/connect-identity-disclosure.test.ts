import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const migration = readFileSync(
  new URL('../../supabase/migrations/20260924210000_connect_identity_remains_after_disconnect.sql', import.meta.url),
  'utf8',
)

describe('durable acceptance disclosure', () => {
  it('reveals identity from an accepted event and does not use responded_at', () => {
    assert.match(migration, /e\.event_type = 'accepted'/)
    assert.match(migration, /connect_list_for_practice/)
    assert.match(migration, /connect_get_physician_profile/)
    assert.doesNotMatch(migration, /WHEN[\s\S]{0,240}responded_at/)
    assert.doesNotMatch(migration, /status IN \('declined', 'canceled', 'disconnected'\)/)
    const security = readFileSync(
      new URL('../../docs/security/connect-identity-remains-v1-security-test.sql', import.meta.url),
      'utf8',
    )
    assert.match(security, /e\.event_type = 'accepted'/)
    assert.match(security, /ROLLBACK;/)
  })
})
