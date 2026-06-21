import { patchAtlasCacheRecord } from '@/lib/atlas-cache'
import { patchFavoritesPractice } from '@/lib/favorites-cache'

export const PRACTICES_CACHE_DB = 'AtlasPracticesDB'
export const PRACTICES_CACHE_STORE = 'practices'
export const PRACTICES_CACHE_KEY = 'atlas_practices_v2'
export const PRACTICES_CACHE_TTL = 1 * 60 * 60 * 1000 // 1 hour

export type PracticeListRow = {
  id: string
  practice_name: string | null
  city_st: string | null
  state: string | null
  retention_score: number | null
  retention_score_delta: number | null
  latest_roster_size: number | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  org_pac_id: string | null
}

/** Fields shared between detail fetch (select *) and the practices list cache. */
export function practiceToListRow(detail: Record<string, unknown>): PracticeListRow {
  return {
    id: detail.id as string,
    practice_name: (detail.practice_name as string | null) ?? null,
    city_st: (detail.city_st as string | null) ?? null,
    state: (detail.state as string | null) ?? null,
    retention_score: (detail.retention_score as number | null) ?? null,
    retention_score_delta: (detail.retention_score_delta as number | null) ?? null,
    latest_roster_size: (detail.latest_roster_size as number | null) ?? null,
    latitude: (detail.latitude as number | null) ?? null,
    longitude: (detail.longitude as number | null) ?? null,
    phone: (detail.phone as string | null) ?? null,
    org_pac_id: (detail.org_pac_id as string | null) ?? null,
  }
}

/** Merge a fresh detail row into the practices list cache and favorites (if loaded). */
export async function syncPracticeListCacheFromDetail(detail: Record<string, unknown>): Promise<void> {
  const row = practiceToListRow(detail)

  await patchAtlasCacheRecord(
    PRACTICES_CACHE_DB,
    PRACTICES_CACHE_STORE,
    PRACTICES_CACHE_KEY,
    row.id,
    row,
  )

  patchFavoritesPractice(row.id, {
    practice_name: row.practice_name,
    city_st: row.city_st,
    retention_score: row.retention_score,
    latest_roster_size: row.latest_roster_size,
  })
}
