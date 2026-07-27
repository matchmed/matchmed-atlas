import { loadAtlasCache, peekAtlasCache, saveAtlasCache } from '@/lib/atlas-cache'
import { createClient } from '@/lib/supabase'

export const PRACTICE_LOCATIONS_CACHE_DB = 'AtlasPracticeLocationsDB'
export const PRACTICE_LOCATIONS_CACHE_STORE = 'practice_locations'
export const PRACTICE_LOCATIONS_CACHE_KEY = 'atlas_practice_locations_v2'
export const PRACTICE_LOCATIONS_CACHE_TTL = 1 * 60 * 60 * 1000 // 1 hour

export type PracticeLocation = {
  id: string
  practice_id: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  latitude: number | null
  longitude: number | null
  doctor_count: number | null
  rank_by_doctors: number | null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

export function normalizePracticeLocation(row: Record<string, unknown>): PracticeLocation | null {
  const practiceId = cleanText(row.practice_id)
  const id = cleanText(row.id)
  if (!practiceId || !id) return null

  return {
    id,
    practice_id: practiceId,
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state),
    zip: cleanText(row.zip),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    doctor_count: toNumber(row.doctor_count),
    rank_by_doctors: toNumber(row.rank_by_doctors),
  }
}

export function formatCityState(city: string | null, state: string | null): string {
  if (city && state) return `${city}, ${state}`
  return city || state || ''
}

/** Full street line without ZIP: "123 Main St, Atlanta, GA". */
export function formatPracticeLocationAddress(loc: PracticeLocation): string {
  const cityState = formatCityState(loc.city, loc.state)
  if (loc.address && cityState) return `${loc.address}, ${cityState}`
  return loc.address || cityState || ''
}

export function uniqueSortedStates(locations: PracticeLocation[]): string[] {
  return Array.from(
    new Set(
      locations
        .map(loc => loc.state?.trim().toUpperCase())
        .filter((state): state is string => Boolean(state)),
    ),
  ).sort()
}

/** Header/list summary: "Atlanta, GA" or "7 locations · GA · FL". */
export function formatPracticeLocationSummary(locations: PracticeLocation[]): string {
  if (locations.length === 0) return ''
  if (locations.length === 1) {
    return formatCityState(locations[0].city, locations[0].state) || '1 location'
  }

  const states = uniqueSortedStates(locations)
  const countLabel = `${locations.length} locations`
  return states.length ? `${countLabel} · ${states.join(' · ')}` : countLabel
}

/** Expanded list: "Atlanta, GA · Marietta, GA · Jacksonville, FL". */
export function formatPracticeLocationList(locations: PracticeLocation[]): string {
  return locations
    .map(loc => formatCityState(loc.city, loc.state) || loc.address || '')
    .filter(Boolean)
    .join(' · ')
}

export function indexLocationsByPracticeId(
  locations: PracticeLocation[],
): Map<string, PracticeLocation[]> {
  const map = new Map<string, PracticeLocation[]>()
  for (const loc of locations) {
    const existing = map.get(loc.practice_id)
    if (existing) existing.push(loc)
    else map.set(loc.practice_id, [loc])
  }

  for (const [practiceId, rows] of map) {
    rows.sort((a, b) => {
      const aCount = a.doctor_count ?? -1
      const bCount = b.doctor_count ?? -1
      if (bCount !== aCount) return bCount - aCount
      const aRank = a.rank_by_doctors ?? Number.POSITIVE_INFINITY
      const bRank = b.rank_by_doctors ?? Number.POSITIVE_INFINITY
      return aRank - bRank
    })
    map.set(practiceId, rows)
  }

  return map
}

export function practiceMatchesLocationSearch(
  locations: PracticeLocation[],
  query: string,
): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return locations.some(loc => {
    const city = (loc.city || '').toLowerCase()
    const state = (loc.state || '').toLowerCase()
    const zip = (loc.zip || '').toLowerCase()
    const address = (loc.address || '').toLowerCase()
    const cityState = formatCityState(loc.city, loc.state).toLowerCase()
    return (
      city.includes(q) ||
      state.includes(q) ||
      zip.includes(q) ||
      address.includes(q) ||
      cityState.includes(q)
    )
  })
}

export function practiceMatchesSelectedStates(
  locations: PracticeLocation[],
  selectedStates: Set<string>,
): boolean {
  if (selectedStates.size === 0) return true
  return locations.some(loc => {
    const state = loc.state?.trim().toUpperCase()
    return Boolean(state && selectedStates.has(state))
  })
}

/** Geocoded pin coordinates for a practice, with light jitter for shared lat/lng. */
export function practicePinCoordinates(
  locations: PracticeLocation[],
): Array<{ id: string; coordinates: [number, number] }> {
  const seen: Record<string, number> = {}
  const pins: Array<{ id: string; coordinates: [number, number] }> = []

  for (const loc of locations) {
    if (loc.latitude == null || loc.longitude == null) continue
    if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) continue

    const key = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`
    seen[key] = (seen[key] || 0) + 1
    const count = seen[key]
    const jitter = count > 1 ? 0.003 : 0
    const angle = (count - 1) * 2.4

    pins.push({
      id: loc.id,
      coordinates: [
        loc.longitude + jitter * Math.cos(angle),
        loc.latitude + jitter * Math.sin(angle),
      ],
    })
  }

  return pins
}

/** LineStrings from a hub pin to every other geocoded site for one practice. */
export function buildPracticeSpiderGeoJSON(
  locations: PracticeLocation[],
  hub: [number, number],
): GeoJSON.FeatureCollection {
  const pins = practicePinCoordinates(locations)
  if (pins.length < 2) {
    return { type: 'FeatureCollection', features: [] }
  }

  const features: GeoJSON.Feature[] = []
  for (const pin of pins) {
    const [lng, lat] = pin.coordinates
    if (Math.abs(lng - hub[0]) < 1e-9 && Math.abs(lat - hub[1]) < 1e-9) continue
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [hub, pin.coordinates],
      },
      properties: { locationId: pin.id },
    })
  }

  return { type: 'FeatureCollection', features }
}

export async function fetchAllPracticeLocations(): Promise<PracticeLocation[]> {
  const cached = await loadAtlasCache<PracticeLocation>(
    PRACTICE_LOCATIONS_CACHE_DB,
    PRACTICE_LOCATIONS_CACHE_STORE,
    PRACTICE_LOCATIONS_CACHE_KEY,
    PRACTICE_LOCATIONS_CACHE_TTL,
  )
  if (cached) return cached

  const supabase = createClient()
  let all: PracticeLocation[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('practice_locations')
      .select('id,practice_id,address,city,state,zip,latitude,longitude,doctor_count,rank_by_doctors')
      .range(from, from + 999)

    if (error) {
      throw new Error(error.message || 'Failed to load practice locations')
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const normalized = normalizePracticeLocation(row as Record<string, unknown>)
      if (normalized) all.push(normalized)
    }

    if (data.length < 1000) break
    from += 1000
  }

  await saveAtlasCache(
    PRACTICE_LOCATIONS_CACHE_DB,
    PRACTICE_LOCATIONS_CACHE_STORE,
    PRACTICE_LOCATIONS_CACHE_KEY,
    all,
  )

  return all
}

export function peekPracticeLocationsCache(): PracticeLocation[] | null {
  return peekAtlasCache<PracticeLocation>(
    PRACTICE_LOCATIONS_CACHE_DB,
    PRACTICE_LOCATIONS_CACHE_KEY,
    PRACTICE_LOCATIONS_CACHE_TTL,
  )
}
