/**
 * Product-surface precedence. There is no detail_available flag.
 *
 * 1. is_active false hides every product surface.
 * 2. The audience flag chooses Atlas and/or Employers.
 * 3. Readable content is approved, verified, published, and not expired,
 *    withdrawn, recalled, or illustrative.
 * 4. directory_visible only affects the directory, after 1–3.
 */

export type PublicationState =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'unpublished'
  | 'archived'
  | 'expired'
  | 'withdrawn'
  | 'recalled'

export type SponsorSurfaceInput = {
  isActive: boolean
  audienceEnabled: boolean
  directoryVisible: boolean
  publicationState: PublicationState
  companyApproved: boolean
  matchmedApproved: boolean
  verified: boolean
  illustrative: boolean
  publishedAt: string | null
  expiresAt: string | null
  now?: string
}

function at(value: string | null | undefined, now: number): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export function libraryItemReadable(input: SponsorSurfaceInput): boolean {
  if (!input.isActive || !input.audienceEnabled) return false
  if (input.publicationState !== 'published') return false
  if (!input.companyApproved || !input.matchmedApproved || !input.verified) return false
  if (input.illustrative) return false
  const now = Date.parse(input.now ?? new Date().toISOString())
  const publishedAt = at(input.publishedAt, now)
  if (publishedAt == null || publishedAt > now) return false
  const expiresAt = at(input.expiresAt, now)
  if (expiresAt != null && expiresAt <= now) return false
  return true
}

export function directoryListsSponsor(input: SponsorSurfaceInput): boolean {
  return input.directoryVisible && libraryItemReadable(input)
}

export function archivedBriefReadable(input: Omit<SponsorSurfaceInput, 'directoryVisible' | 'publicationState'> & {
  publicSharing: boolean
  withdrawn: boolean
  recalled: boolean
}): boolean {
  if (!input.isActive || !input.publicSharing) return false
  if (input.withdrawn || input.recalled) return false
  if (!input.companyApproved || !input.matchmedApproved) return false
  return true
}
