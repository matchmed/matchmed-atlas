import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260930120000_connect_anonymous_physician_initials.sql',
  'utf8',
)
const unlocked = readFileSync(
  'supabase/migrations/20260910170000_drop_open_to_practice_connections.sql',
  'utf8',
)
const preview = readFileSync(
  'supabase/migrations/20260924190000_employer_connect_request_preview.sql',
  'utf8',
)
const security = readFileSync(
  'docs/security/employer-physician-preview-v1-security-test.sql',
  'utf8',
)

function sliceFn(source: string, name: string, next: string) {
  const start = source.indexOf(`FUNCTION public.${name}`)
  const end = next ? source.indexOf(`FUNCTION public.${next}`, start) : source.length
  assert.ok(start >= 0, name)
  return source.slice(start, end > start ? end : source.length)
}

describe('anonymous physician initials migration', () => {
  const initials = sliceFn(migration, '_connect_physician_initials', '_connect_anonymous_physician_json')
  const anonymous = sliceFn(migration, '_connect_anonymous_physician_json', 'connect_list_anonymous_physicians')
  const list = sliceFn(migration, 'connect_list_anonymous_physicians', '')

  it('derives uppercase first-then-last initials and ignores extra words', () => {
    assert.match(initials, /upper\(substring\(btrim\(coalesce\(p_first/)
    assert.match(initials, /upper\(substring\(btrim\(coalesce\(p_last/)
    assert.match(initials, /FROM 1 FOR 1/)
    assert.match(initials, /WHEN first_ch IS NULL AND last_ch IS NULL THEN '\?'/)
    assert.match(initials, /coalesce\(first_ch, ''\) \|\| coalesce\(last_ch, ''\)/)
  })

  it('returns initials without names or training stage on the anonymous payload', () => {
    assert.match(anonymous, /'initials', public\._connect_physician_initials\(p_profile\.first_name, p_profile\.last_name\)/)
    assert.equal(anonymous.includes("'first_name'"), false)
    assert.equal(anonymous.includes("'last_name'"), false)
    assert.equal(anonymous.includes("'email'"), false)
    assert.equal(anonymous.includes("'phone'"), false)
    assert.equal(anonymous.includes("'npi'"), false)
    assert.equal(anonymous.includes('training_status'), false)
    assert.equal(anonymous.includes('current_practice'), false)
  })

  it('keeps the discovery signature and training-status filter without returning the stage', () => {
    assert.match(list, /p_training_status text DEFAULT NULL/)
    assert.match(list, /p\.training_status = p_training_status/)
    assert.match(list, /public\._connect_anonymous_physician_json\(p\)/)
    assert.match(list, /SECURITY DEFINER/)
    assert.match(list, /SET search_path = ''/)
    assert.equal(list.includes("'training_status'"), false)
  })

  it('does not replace unlocked identity or notification email copy', () => {
    assert.equal(migration.includes('_connect_unlocked_physician_json'), false)
    assert.match(unlocked, /'first_name', p_profile\.first_name/)
    assert.match(unlocked, /'training_status', p_profile\.training_status/)
    assert.equal(preview.includes('_connect_physician_initials'), false)
    assert.equal(preview.includes("'initials'"), false)
    assert.match(preview, /v_payload - 'message_body' - 'body' - 'intro_note'/)
  })

  it('does not change introduction limits or initiate RPCs', () => {
    assert.equal(migration.includes('connect_initiate_by_practice'), false)
    assert.equal(migration.includes('connect_initiate_by_physician'), false)
    assert.equal(migration.includes('intro note exceeds'), false)
    assert.equal(migration.includes('_connect_enqueue_employer_emails'), false)
    assert.equal(migration.includes('_notification_'), false)
  })

  it('covers the initials and privacy cases in the rolled-back security test', () => {
    assert.match(security, /_connect_physician_initials\('Finny', 'John'\) = 'FJ'/)
    assert.match(security, /Finny Michael/)
    assert.match(security, /Mary-Jane/)
    assert.match(security, /signed-out discovery denied/)
    assert.match(security, /unauthorized discovery denied/)
    assert.match(security, /disconnected historically accepted identity stays unlocked/)
    assert.match(security, /do not gain initials or message text/)
    assert.match(security, /anon->>'initials' = 'SP'/)
    assert.match(security, /NOT \(anon \? 'training_status'\)/)
    assert.match(security, /anon->>'first_name' = 'Secret'/)
  })
})
