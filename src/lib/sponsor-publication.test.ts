import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { assertPublishableSponsorUrl } from './sponsor-url-dns.ts'
import { loadBriefCandidate, loadLibraryCandidate, runTrustedPublication, type PublishCall } from './sponsor-publication.ts'

const ADMIN_ID = 'e2000000-0000-4000-8000-000000000001'
const CONTENT_ID = '11111111-1111-4111-8111-111111111111'
const BRIEF_ID = '22222222-2222-4222-8222-222222222222'
const PUBLIC_ADDRESS = '93.184.216.34'

const publicationSource = readFileSync(new URL('./sponsor-publication.ts', import.meta.url), 'utf8')
const dnsSource = readFileSync(new URL('./sponsor-url-dns.ts', import.meta.url), 'utf8')
const actionSource = readFileSync(new URL('../app/admin/sponsors/publication-actions.ts', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('../app/admin/sponsors/[slug]/page.tsx', import.meta.url), 'utf8')
const controlsSource = readFileSync(new URL('../app/admin/sponsors/publish-controls.tsx', import.meta.url), 'utf8')

function reader(tables: Record<string, Record<string, unknown> | Record<string, unknown>[]>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              const value = tables[table]
              const rows = Array.isArray(value) ? value : value ? [value] : []
              const result = Promise.resolve({ data: rows, error: null })
              return Object.assign(result, {
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
              })
            },
          }
        },
      }
    },
  }
}

function addresses(map: Record<string, string[] | 'nxdomain' | 'hang'>) {
  const hosts: string[] = []
  const lookup = (host: string) => {
    hosts.push(host)
    const result = map[host]
    if (result === 'nxdomain') return Promise.reject(new Error('ENOTFOUND'))
    if (result === 'hang') return new Promise<Array<{ address: string }>>(() => {})
    if (!result) return Promise.reject(new Error('unmapped host'))
    return Promise.resolve(result.map((address) => ({ address })))
  }
  return { hosts, lookup }
}

async function publishWith(options: {
  kind?: 'library' | 'brief'
  mode?: 'publish' | 'schedule'
  urls?: string[]
  publishedAt?: string | null
  isAdmin?: boolean
  userId?: string | null
  lookup: (host: string) => Promise<Array<{ address: string }>>
  sharing?: boolean
}) {
  const calls: PublishCall[] = []
  const result = await runTrustedPublication({
    mode: options.mode ?? 'publish',
    kind: options.kind ?? 'library',
    id: options.kind === 'brief' ? BRIEF_ID : CONTENT_ID,
    getUser: async () => (options.userId === null ? null : { id: options.userId ?? ADMIN_ID }),
    isAtlasAdmin: async () => options.isAdmin ?? true,
    loadCandidate: async (id) => ({
      id,
      publicationState: 'draft',
      publishedAt: options.publishedAt ?? null,
      publicSharingEnabled: options.sharing ?? false,
      urls: options.urls ?? ['https://evidence.example/library'],
    }),
    publish: async (call) => {
      calls.push(call)
      return null
    },
    lookup: options.lookup,
    timeoutMs: 20,
    now: new Date('2026-10-03T16:00:00Z'),
  })
  return { result, calls }
}

describe('trusted sponsor publication', { concurrency: false }, () => {
  it('imports and calls the DNS helper on the real publication path', async () => {
    assert.match(publicationSource, /from '\.\/sponsor-url-dns'/)
    assert.match(publicationSource, /assertPublishableSponsorUrl/)
    assert.match(dnsSource, /import 'server-only'/)
    assert.match(publicationSource, /import 'server-only'/)
    assert.match(actionSource, /runTrustedPublication/)
    const seen: string[] = []
    const { result, calls } = await publishWith({
      urls: ['https://evidence.example/library'],
      lookup: async (host) => {
        seen.push(host)
        return [{ address: PUBLIC_ADDRESS }]
      },
    })
    assert.equal(result.ok, true)
    assert.deepEqual(seen, ['evidence.example'])
    assert.equal(calls.length, 1)
    const direct = await assertPublishableSponsorUrl('https://evidence.example/library', {
      lookup: async () => [{ address: PUBLIC_ADDRESS }],
      timeoutMs: 20,
    })
    assert.equal(direct, 'https://evidence.example/library')
  })

  it('publishes a hostname that resolves only to a public address', async () => {
    const dns = addresses({ 'evidence.example': [PUBLIC_ADDRESS] })
    const { result, calls } = await publishWith({
      urls: ['https://evidence.example/library'],
      lookup: dns.lookup,
    })
    assert.equal(result.ok, true)
    assert.deepEqual(calls, [{ rpc: 'admin_publish_content', id: CONTENT_ID, sharing: undefined }])
    assert.equal(Object.hasOwn(calls[0], 'actor'), false)
  })

  it('rejects a hostname that resolves to loopback or a private address', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', 'fd00::1']) {
      const dns = addresses({ 'evidence.example': [address] })
      const { result, calls } = await publishWith({
        urls: ['https://evidence.example/library'],
        lookup: dns.lookup,
      })
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, /non-public address/)
      assert.equal(calls.length, 0)
    }
  })

  it('rejects a hostname that returns both public and private addresses', async () => {
    const dns = addresses({ 'evidence.example': [PUBLIC_ADDRESS, '10.1.1.1'] })
    const { result, calls } = await publishWith({
      urls: ['https://evidence.example/library'],
      lookup: dns.lookup,
    })
    assert.equal(result.ok, false)
    assert.equal(calls.length, 0)
  })

  it('rejects NXDOMAIN and DNS timeout without calling SQL', async () => {
    const missing = addresses({ 'missing.example': 'nxdomain' })
    const missingResult = await publishWith({
      urls: ['https://missing.example/library'],
      lookup: missing.lookup,
    })
    assert.equal(missingResult.result.ok, false)
    if (!missingResult.result.ok) assert.match(missingResult.result.error, /could not be resolved/)
    assert.equal(missingResult.calls.length, 0)

    const slow = addresses({ 'slow.example': 'hang' })
    const slowResult = await publishWith({
      urls: ['https://slow.example/library'],
      lookup: slow.lookup,
    })
    assert.equal(slowResult.result.ok, false)
    if (!slowResult.result.ok) assert.match(slowResult.result.error, /timed out/)
    assert.equal(slowResult.calls.length, 0)
  })

  it('rejects malformed and prohibited URLs before DNS', async () => {
    const dns = addresses({})
    const { result, calls } = await publishWith({
      urls: [
        'http://evidence.example/a',
        '//evidence.example/a',
        'https://user:pass@evidence.example/a',
        'https://127.0.0.1/a',
        'https://10.0.0.1/a',
        'https://evidence.example/?utm_source=newsletter',
        'not a url',
      ],
      lookup: dns.lookup,
    })
    assert.equal(result.ok, false)
    assert.equal(dns.hosts.length, 0)
    assert.equal(calls.length, 0)
  })

  it('checks every URL on the candidate and skips SQL when any one fails', async () => {
    const dns = addresses({
      'one.example': [PUBLIC_ADDRESS],
      'two.example': ['10.0.0.1'],
      'three.example': [PUBLIC_ADDRESS],
    })
    const { result, calls } = await publishWith({
      urls: ['https://one.example/a', 'https://two.example/b', 'https://three.example/c'],
      lookup: dns.lookup,
    })
    assert.equal(result.ok, false)
    assert.deepEqual(dns.hosts, ['one.example', 'two.example', 'three.example'])
    assert.equal(calls.length, 0)
  })

  it('uses the same guard for library content, briefs, and scheduling', async () => {
    const library = addresses({ 'library.example': [PUBLIC_ADDRESS] })
    const libraryResult = await publishWith({
      urls: ['https://library.example/resource'],
      lookup: library.lookup,
    })
    assert.equal(libraryResult.calls[0]?.rpc, 'admin_publish_content')

    const brief = addresses({ 'brief.example': [PUBLIC_ADDRESS], 'cta.example': ['8.8.8.8'] })
    const briefResult = await publishWith({
      kind: 'brief',
      sharing: true,
      urls: ['https://brief.example/source', 'https://cta.example/go'],
      lookup: brief.lookup,
    })
    assert.deepEqual(brief.hosts, ['brief.example', 'cta.example'])
    assert.deepEqual(briefResult.calls, [{ rpc: 'admin_publish_brief', id: BRIEF_ID, sharing: true }])

    const scheduled = addresses({ 'later.example': [PUBLIC_ADDRESS] })
    const scheduledResult = await publishWith({
      mode: 'schedule',
      publishedAt: '2026-11-01T00:00:00Z',
      urls: ['https://later.example/resource'],
      lookup: scheduled.lookup,
    })
    assert.equal(scheduledResult.result.ok, true)
    assert.equal(scheduledResult.calls.length, 1)

    const blockedSchedule = addresses({ 'later.example': ['127.0.0.1'] })
    const blocked = await publishWith({
      mode: 'schedule',
      publishedAt: '2026-11-01T00:00:00Z',
      urls: ['https://later.example/resource'],
      lookup: blockedSchedule.lookup,
    })
    assert.equal(blocked.result.ok, false)
    assert.equal(blocked.calls.length, 0)
  })

  it('does not publish from the admin preview', () => {
    assert.match(previewSource, /admin_get_sponsor_preview/)
    assert.match(previewSource, /preview/)
    assert.doesNotMatch(previewSource, /admin_publish_/)
    assert.doesNotMatch(previewSource, /assertPublishableSponsorUrl/)
    assert.doesNotMatch(controlsSource, /sponsor-url-dns/)
    assert.doesNotMatch(controlsSource, /\.rpc\(/)
    assert.match(actionSource, /saveDraftLibraryUrl/)
    assert.doesNotMatch(actionSource.slice(actionSource.indexOf('saveDraftLibraryUrl'), actionSource.indexOf('publishLibraryAction')), /admin_publish_|assertPublishableSponsorUrl/)
    assert.match(actionSource, /admin_publish_content/)
    assert.match(actionSource, /admin_publish_brief/)
  })

  it('refuses a non-admin before DNS or SQL', async () => {
    let lookedUp = false
    let loaded = false
    const result = await runTrustedPublication({
      mode: 'publish',
      kind: 'library',
      id: CONTENT_ID,
      getUser: async () => ({ id: 'physician-user' }),
      isAtlasAdmin: async () => false,
      loadCandidate: async () => {
        loaded = true
        return null
      },
      publish: async () => {
        throw new Error('rpc should not be called')
      },
      lookup: async () => {
        lookedUp = true
        return [{ address: PUBLIC_ADDRESS }]
      },
      timeoutMs: 20,
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /administrator/)
    assert.equal(loaded, false)
    assert.equal(lookedUp, false)
  })

  it('keeps the authenticated administrator as the audit actor', () => {
    assert.match(actionSource, /supabase\.auth\.getUser/)
    assert.match(actionSource, /is_atlas_admin/)
    assert.match(actionSource, /supabase\.rpc\('admin_publish_content'/)
    assert.match(publicationSource, /admin_get_brief_publication_candidate/)
    assert.match(actionSource, /loadBriefCandidate\(supabase/)
    assert.match(actionSource, /supabase\.rpc\('admin_publish_brief'/)
    assert.doesNotMatch(actionSource, /from\('sponsor_brief_/)
    assert.doesNotMatch(actionSource, /service_role|SERVICE_ROLE|actor_id|p_actor/)
    assert.doesNotMatch(publicationSource, /actor_id|p_actor/)
  })

  it('does not make an external HTTP request while validating', async () => {
    assert.doesNotMatch(dnsSource, /fetch\(|https?\.request/)
    assert.doesNotMatch(publicationSource, /fetch\(|https?\.request/)
    const original = globalThis.fetch
    let fetched = 0
    globalThis.fetch = () => {
      fetched += 1
      throw new Error('unexpected fetch')
    }
    try {
      const dns = addresses({ 'evidence.example': [PUBLIC_ADDRESS] })
      const { result } = await publishWith({
        urls: ['https://evidence.example/library?ok=1'],
        lookup: dns.lookup,
      })
      assert.equal(result.ok, true)
      assert.equal(fetched, 0)
    } finally {
      globalThis.fetch = original
    }
  })

  it('loads every external URL from the candidate rows', async () => {
    const library = await loadLibraryCandidate(
      reader({
        sponsor_vendor_content: {
          id: CONTENT_ID,
          vendor_id: 'vendor-1',
          publication_state: 'draft',
          published_at: null,
          url: 'https://announcement.example/news',
          image_url: 'https://images.example/logo.png',
        },
        sponsor_vendor_profiles: { logo_url: 'https://brand.example/mark.png' },
      }),
      CONTENT_ID,
    )
    assert.deepEqual(library?.urls, [
      'https://announcement.example/news',
      'https://images.example/logo.png',
      'https://brand.example/mark.png',
    ])

    const brief = await loadBriefCandidate(
      {
        rpc: async (fn, args) => {
          assert.equal(fn, 'admin_get_brief_publication_candidate')
          assert.deepEqual(args, { p_revision_id: BRIEF_ID })
          return {
            data: {
              revision_id: BRIEF_ID,
              publication_state: 'draft',
              published_at: '2026-11-01T00:00:00.000Z',
              public_sharing_enabled: false,
              logo_url: 'https://brand.example/mark.png',
              pdf_asset_path: '22222222-2222-4222-8222-222222222222/2026-10.pdf',
              pdf_external_url: null,
              items: [
                { position: 2, source_url: 'https://events.example/rsvp', cta_url: null },
                { position: 1, source_url: 'https://source.example/a', cta_url: 'https://cta.example/go' },
              ],
            },
            error: null,
          }
        },
      },
      BRIEF_ID,
    )
    assert.deepEqual(brief?.urls, [
      'https://brand.example/mark.png',
      'https://source.example/a',
      'https://cta.example/go',
      'https://events.example/rsvp',
    ])
    assert.equal(brief?.urls.some((url) => url.includes('/2026-10.pdf')), false)
  })

  it('publishes and schedules a brief from the admin candidate RPC', async () => {
    const candidate = {
      revision_id: BRIEF_ID,
      publication_state: 'draft',
      published_at: null as string | null,
      public_sharing_enabled: false,
      logo_url: null,
      pdf_asset_path: '22222222-2222-4222-8222-222222222222/2026-11.pdf',
      pdf_external_url: null as string | null,
      items: [
        { position: 1, source_url: 'https://source.example/a', cta_url: 'https://cta.example/go' },
        { position: 2, source_url: 'https://second.example/b', cta_url: null },
      ],
    }
    const rpcCalls: string[] = []
    const client = {
      rpc: async (fn: string, args: { p_revision_id: string }) => {
        rpcCalls.push(fn)
        assert.deepEqual(args, { p_revision_id: BRIEF_ID })
        return { data: candidate, error: null }
      },
    }

    async function publishLoaded(mode: 'publish' | 'schedule', lookup: (host: string) => Promise<Array<{ address: string }>>) {
      const loaded = await loadBriefCandidate(client, BRIEF_ID)
      const calls: PublishCall[] = []
      const result = await runTrustedPublication({
        mode,
        kind: 'brief',
        id: BRIEF_ID,
        getUser: async () => ({ id: ADMIN_ID }),
        isAtlasAdmin: async () => true,
        loadCandidate: async () => loaded,
        publish: async (call) => {
          calls.push(call)
          return null
        },
        lookup,
        timeoutMs: 20,
        now: new Date('2026-10-04T12:00:00Z'),
      })
      return { result, calls }
    }

    const published = await publishLoaded('publish', addresses({
      'source.example': [PUBLIC_ADDRESS],
      'cta.example': ['8.8.8.8'],
      'second.example': [PUBLIC_ADDRESS],
    }).lookup)
    assert.equal(published.result.ok, true)
    assert.deepEqual(published.calls, [{ rpc: 'admin_publish_brief', id: BRIEF_ID, sharing: false }])
    assert.equal(published.calls[0] && 'actor' in published.calls[0], false)

    candidate.published_at = '2026-12-01T00:00:00.000Z'
    const scheduled = await publishLoaded('schedule', addresses({
      'source.example': [PUBLIC_ADDRESS],
      'cta.example': ['8.8.8.8'],
      'second.example': [PUBLIC_ADDRESS],
    }).lookup)
    assert.equal(scheduled.result.ok, true)
    if (scheduled.result.ok) assert.match(scheduled.result.message, /Scheduled/)
    assert.equal(scheduled.calls[0]?.rpc, 'admin_publish_brief')

    candidate.pdf_external_url = 'https://files.example/brief.pdf'
    const withPdf = addresses({
      'source.example': [PUBLIC_ADDRESS],
      'cta.example': [PUBLIC_ADDRESS],
      'second.example': [PUBLIC_ADDRESS],
      'files.example': [PUBLIC_ADDRESS],
    })
    const pdfResult = await publishLoaded('publish', withPdf.lookup)
    assert.equal(pdfResult.result.ok, true)
    assert.deepEqual(withPdf.hosts, ['files.example', 'source.example', 'cta.example', 'second.example'])
    assert.equal(withPdf.hosts.some((host) => host.endsWith('.pdf')), false)

    for (const [host, address] of [
      ['source.example', '127.0.0.1'],
      ['source.example', '10.0.0.1'],
      ['source.example', 'nxdomain'],
      ['source.example', 'hang'],
    ] as const) {
      const dns = addresses({
        [host]: address === 'nxdomain' || address === 'hang' ? address : [address],
        'cta.example': [PUBLIC_ADDRESS],
        'second.example': [PUBLIC_ADDRESS],
        'files.example': [PUBLIC_ADDRESS],
      })
      const blocked = await publishLoaded('publish', dns.lookup)
      assert.equal(blocked.result.ok, false)
      assert.equal(blocked.calls.length, 0)
    }

    const mixed = addresses({
      'source.example': [PUBLIC_ADDRESS, '10.0.0.1'],
      'cta.example': [PUBLIC_ADDRESS],
      'second.example': [PUBLIC_ADDRESS],
      'files.example': [PUBLIC_ADDRESS],
    })
    const mixedResult = await publishLoaded('publish', mixed.lookup)
    assert.equal(mixedResult.result.ok, false)
    assert.equal(mixedResult.calls.length, 0)
    assert.ok(rpcCalls.every((fn) => fn === 'admin_get_brief_publication_candidate'))
  })
})
