import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Execute the actual route with isolated external dependencies; no network or secrets.
const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function setup({ user = { id: 'admin' }, profile = { is_admin: true }, profileError = null,
  provider = () => Response.json({ content: [{ text: 'report' }] }) } = {}) {
  const calls = []
  const logs = []
  const client = {
    auth: { getUser: async () => { calls.push('auth'); return { data: { user } } } },
    from: (table) => {
      assert.equal(table, 'profiles')
      return { select: () => ({ eq: (key, id) => {
        assert.equal(key, 'user_id'); assert.equal(id, user.id)
        return { maybeSingle: async () => {
          calls.push('admin'); return { data: profile, error: profileError }
        } }
      } }) }
    },
  }
  const exports = {}
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase-server': { createClient: async () => client },
    '@/lib/posthog-server': { captureServerEvent: async () => calls.push('analytics') },
  }
  new Function('require', 'exports', 'fetch', 'process', 'console', compiled)(
    name => { assert.ok(dependencies[name]); return dependencies[name] }, exports,
    async (...args) => { calls.push('provider'); return provider(...args) },
    { env: { ANTHROPIC_API_KEY: 'synthetic-test-key' } },
    { error: (...args) => logs.push(args) },
  )
  return { post: exports.POST, calls, logs }
}
function request(body = JSON.stringify({ prompt: ' hello ' }), headers = {}) {
  return new Request('https://example.test/api/generate-report', { method: 'POST', body, headers })
}

for (const [name, options, status] of [
  ['anonymous', { user: null }, 401],
  ['non-admin', { profile: { is_admin: false } }, 403],
  ['missing profile', { profile: null }, 403],
  ['deleted admin', { profile: { is_admin: true, deleted_at: '2026-01-01' } }, 403],
  ['profile lookup failure', { profileError: { message: 'private' } }, 403],
]) {
  test(`${name} blocked before body/provider`, async () => {
    const h = setup(options)
    const response = await h.post(request('malformed'))
    assert.equal(response.status, status)
    assert.ok(!h.calls.includes('provider'))
  })
}

test('admin success preserves provider payload and request settings', async () => {
  const payload = { content: [{ text: 'unchanged report' }] }
  const h = setup({ provider: (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages')
    assert.deepEqual(JSON.parse(options.body), {
      model: 'claude-sonnet-4-6', max_tokens: 1000,
      messages: [{ role: 'user', content: 'hello' }],
    })
    return Response.json(payload)
  } })
  const response = await h.post(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), payload)
  assert.deepEqual(h.calls, ['auth', 'admin', 'provider', 'analytics'])
})

for (const body of ['{', '{}', 'null', '{"prompt":42}', '{"prompt":"  "}']) {
  test(`invalid input rejected: ${body}`, async () => {
    const h = setup()
    assert.equal((await h.post(request(body))).status, 400)
    assert.ok(!h.calls.includes('provider'))
  })
}
for (const headers of [{}, { 'content-length': '1' }, { 'content-length': '999999' }]) {
  test(`oversized body rejected ${JSON.stringify(headers)}`, async () => {
    const h = setup()
    assert.equal((await h.post(request(JSON.stringify({ prompt: 'é'.repeat(140000) }), headers))).status, 413)
    assert.ok(!h.calls.includes('provider'))
  })
}
for (const provider of [
  () => Response.json({ error: 'private provider details synthetic-test-key' }, { status: 429 }),
  () => { throw new Error('private network details synthetic-test-key') },
  () => new Response('private invalid provider JSON'),
]) {
  test('provider failure is sanitized in response and logs', async () => {
    const h = setup({ provider })
    const response = await h.post(request())
    assert.ok(response.status >= 500)
    assert.deepEqual(await response.json(), { error: 'Report generation failed' })
    assert.ok(h.logs.length)
    assert.doesNotMatch(JSON.stringify(h.logs), /private|synthetic-test-key/)
  })
}

test('proxy delegates only report endpoint authorization to handler', async () => {
  const proxySource = readFileSync(new URL('../../../proxy.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(proxySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const next = { delegated: true }
  const redirected = { redirected: true }
  const dependencies = {
    '@supabase/ssr': { createServerClient: () => ({ auth: {
      getUser: async () => ({ data: { user: null } }),
    } }) },
    'next/server': { NextResponse: { next: () => next, redirect: () => redirected } },
    '@/lib/onboarding-gate': {},
    '@/lib/public-routes': { isPostHogIngestPath: () => false, isAnonymousAllowlistedPath: () => false },
  }
  const exports = {}
  new Function('require', 'exports', 'process', output)(
    name => dependencies[name], exports, { env: {} },
  )
  const req = pathname => ({ nextUrl: { pathname, clone: () => ({ pathname }) } })
  assert.equal(await exports.proxy(req('/api/generate-report')), next)
  assert.equal(await exports.proxy(req('/api/other')), redirected)
  assert.equal(await exports.proxy(req('/admin/report-builder')), redirected)
})
