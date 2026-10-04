import 'server-only'
import { assertPublishableSponsorUrl, type SponsorDnsLookup } from './sponsor-url-dns'

/**
 * Trusted Atlas publication boundary.
 *
 * Callers pass an id. This module loads the candidate, checks every external
 * URL that publication would expose, and only then calls the existing SQL
 * publish RPC on the authenticated admin's client. DNS resolution here is a
 * safety check for browser destinations. The application does not fetch
 * sponsor pages, so this does not eliminate DNS rebinding and is not a
 * complete SSRF control.
 */

export type PublicationMode = 'publish' | 'schedule'
export type PublicationKind = 'library' | 'brief'

export type PublicationCandidate = {
  id: string
  publicationState: string
  publishedAt: string | null
  publicSharingEnabled: boolean
  urls: string[]
}

export type PublicationResult = { ok: true; message: string } | { ok: false; error: string }

export type PublishCall = {
  rpc: 'admin_publish_content' | 'admin_publish_brief'
  id: string
  sharing?: boolean
}

type QueryError = { message: string } | null
type EqResult = {
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: QueryError }>
} & PromiseLike<{ data: Record<string, unknown>[] | null; error: QueryError }>

type RowQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => EqResult
  }
}

export type PublicationReader = {
  from: (table: string) => RowQuery
}

const PUBLISHABLE_STATES = new Set(['draft', 'unpublished'])

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function presentUrls(values: Array<string | null>): string[] {
  return values.filter((value): value is string => value != null)
}

export function publicationFailureMessage(code: string): string {
  if (code === 'private-address' || code === 'dns-private') {
    return 'Publication blocked. A destination resolves to a private, loopback, link-local, or other non-public address.'
  }
  if (code === 'dns-timeout') return 'Publication blocked. DNS resolution timed out.'
  if (code === 'dns-failed') return 'Publication blocked. The destination hostname could not be resolved.'
  if (
    code === 'scheme' ||
    code === 'protocol-relative' ||
    code === 'malformed' ||
    code === 'credentials' ||
    code === 'local-host' ||
    code === 'context-query' ||
    code === 'empty'
  ) {
    return 'Publication blocked. A destination URL is not an allowed HTTPS address.'
  }
  return 'Publication blocked. The destination could not be validated.'
}

export async function loadLibraryCandidate(db: PublicationReader, id: string): Promise<PublicationCandidate | null> {
  const content = await db
    .from('sponsor_vendor_content')
    .select('id, vendor_id, publication_state, published_at, url, image_url')
    .eq('id', id)
    .maybeSingle()
  if (content.error || !content.data) return null
  const vendorId = text(content.data.vendor_id)
  if (!vendorId) return null
  const profile = await db
    .from('sponsor_vendor_profiles')
    .select('logo_url')
    .eq('vendor_id', vendorId)
    .maybeSingle()
  if (profile.error || !profile.data) return null
  return {
    id,
    publicationState: text(content.data.publication_state) ?? '',
    publishedAt: text(content.data.published_at),
    publicSharingEnabled: false,
    urls: presentUrls([text(content.data.url), text(content.data.image_url), text(profile.data.logo_url)]),
  }
}

export type BriefCandidateClient = {
  rpc: (
    fn: 'admin_get_brief_publication_candidate',
    args: { p_revision_id: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export function externalUrlsFromBriefCandidate(payload: Record<string, unknown>): string[] {
  const urls: Array<string | null> = [text(payload.logo_url), text(payload.pdf_external_url)]
  const items = Array.isArray(payload.items) ? payload.items : []
  const ordered = items
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .sort((left, right) => Number(left.position) - Number(right.position))
  for (const item of ordered) {
    urls.push(text(item.source_url), text(item.cta_url))
  }
  return presentUrls(urls)
}

export async function loadBriefCandidate(client: BriefCandidateClient, id: string): Promise<PublicationCandidate | null> {
  const { data, error } = await client.rpc('admin_get_brief_publication_candidate', { p_revision_id: id })
  if (error || data == null || typeof data !== 'object' || Array.isArray(data)) return null
  const payload = data as Record<string, unknown>
  const revisionId = text(payload.revision_id)
  if (revisionId !== id) return null
  return {
    id,
    publicationState: text(payload.publication_state) ?? '',
    publishedAt: text(payload.published_at),
    publicSharingEnabled: payload.public_sharing_enabled === true,
    urls: externalUrlsFromBriefCandidate(payload),
  }
}

async function validateCandidateUrls(
  urls: string[],
  lookup: SponsorDnsLookup | undefined,
  timeoutMs: number | undefined,
): Promise<string | null> {
  let failure: string | null = null
  for (const url of urls) {
    try {
      await assertPublishableSponsorUrl(url, { lookup, timeoutMs })
    } catch (error) {
      const code = error instanceof Error ? error.message : 'malformed'
      if (!failure) failure = publicationFailureMessage(code)
    }
  }
  return failure
}

export async function runTrustedPublication(input: {
  mode: PublicationMode
  kind: PublicationKind
  id: string
  getUser: () => Promise<{ id: string } | null>
  isAtlasAdmin: () => Promise<boolean>
  loadCandidate: (id: string) => Promise<PublicationCandidate | null>
  publish: (call: PublishCall) => Promise<string | null>
  lookup?: SponsorDnsLookup
  timeoutMs?: number
  now?: Date
}): Promise<PublicationResult> {
  const user = await input.getUser()
  if (!user?.id) return { ok: false, error: 'Sign in as a MatchMed administrator to publish.' }
  const isAdmin = await input.isAtlasAdmin()
  if (!isAdmin) return { ok: false, error: 'Atlas administrator access is required to publish.' }

  const candidate = await input.loadCandidate(input.id)
  if (!candidate) {
    return { ok: false, error: 'Publication blocked. The candidate could not be loaded, so nothing was published.' }
  }
  if (!PUBLISHABLE_STATES.has(candidate.publicationState)) {
    return { ok: false, error: 'Publication blocked. This revision is not a draft that can be published.' }
  }

  const failure = await validateCandidateUrls(candidate.urls, input.lookup, input.timeoutMs)
  if (failure) return { ok: false, error: failure }

  if (input.mode === 'schedule') {
    const publishedAt = candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : Number.NaN
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(publishedAt) || publishedAt <= now) {
      return {
        ok: false,
        error: 'Publication blocked. Scheduling requires a future publication time already stored on the draft.',
      }
    }
  }

  const rpc = input.kind === 'library' ? 'admin_publish_content' : 'admin_publish_brief'
  const sqlError = await input.publish({
    rpc,
    id: candidate.id,
    sharing: input.kind === 'brief' ? candidate.publicSharingEnabled : undefined,
  })
  if (sqlError) return { ok: false, error: 'Publication blocked. The publication record was not changed.' }
  return {
    ok: true,
    message: input.mode === 'schedule' ? 'Scheduled after destination checks.' : 'Published after destination checks.',
  }
}
