import { createClient as createBrowserClient } from '@/lib/supabase'
import { createClient as createServerClient } from '@/lib/supabase-server'

type AnySupabase =
  | ReturnType<typeof createBrowserClient>
  | Awaited<ReturnType<typeof createServerClient>>

export type PublicSearchPractice = {
  id: string
  practice_name: string | null
  city: string | null
  state: string | null
  location_count: number | null
}

export type PublicSearchPhysician = {
  id: string
  physician_name: string | null
  current_practice_name: string | null
  city: string | null
  state: string | null
}

export type PublicSearchResult = {
  practices: PublicSearchPractice[]
  physicians: PublicSearchPhysician[]
}

export type PublicPractice = {
  id: string
  practice_name: string | null
  phone: string | null
  website: string | null
  latest_roster_size: number | null
  latest_cms_observation_year: number | null
}

export type PublicPracticeLocation = {
  id: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export type PublicRosterPhysician = {
  id: string
  physician_name: string | null
}

export type PublicPhysicianAffiliation = {
  practice_id: string | null
  practice_name: string | null
  city: string | null
  state: string | null
  latest_cms_observation_year: number | null
}

export type PublicPhysician = {
  id: string
  physician_name: string | null
  npi: string | null
  current_affiliations: PublicPhysicianAffiliation[]
}

export type PublicPlatformCounts = {
  practice_count: number
  physician_count: number
  as_of: string | null
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function publicSearch(
  supabase: AnySupabase,
  q: string,
): Promise<{ data: PublicSearchResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('public_search', { q })
  if (error) return { data: null, error: error.message }
  const obj = asObject(data)
  if (!obj) return { data: { practices: [], physicians: [] }, error: null }

  const practices = asArray(obj.practices)
    .map(row => {
      const r = asObject(row)
      if (!r || !str(r.id)) return null
      return {
        id: str(r.id)!,
        practice_name: str(r.practice_name),
        city: str(r.city),
        state: str(r.state),
        location_count: num(r.location_count),
      } satisfies PublicSearchPractice
    })
    .filter((row): row is PublicSearchPractice => row !== null)
    .slice(0, 5)

  const physicians = asArray(obj.physicians)
    .map(row => {
      const r = asObject(row)
      if (!r || !str(r.id)) return null
      return {
        id: str(r.id)!,
        physician_name: str(r.physician_name),
        current_practice_name: str(r.current_practice_name),
        city: str(r.city),
        state: str(r.state),
      } satisfies PublicSearchPhysician
    })
    .filter((row): row is PublicSearchPhysician => row !== null)
    .slice(0, 5)

  return { data: { practices, physicians }, error: null }
}

export async function publicPlatformCounts(
  supabase: AnySupabase,
): Promise<{ data: PublicPlatformCounts | null; error: string | null }> {
  const { data, error } = await supabase.rpc('public_platform_counts')
  if (error) return { data: null, error: error.message }
  const obj = asObject(data)
  if (!obj) return { data: null, error: 'empty counts' }
  return {
    data: {
      practice_count: num(obj.practice_count) ?? 0,
      physician_count: num(obj.physician_count) ?? 0,
      as_of: str(obj.as_of),
    },
    error: null,
  }
}

export async function publicGetPractice(
  supabase: AnySupabase,
  id: string,
): Promise<{ data: PublicPractice | null; error: string | null }> {
  const { data, error } = await supabase.rpc('public_get_practice', { p_id: id })
  if (error) return { data: null, error: error.message }
  if (data == null) return { data: null, error: null }
  const obj = asObject(data)
  if (!obj || !str(obj.id)) return { data: null, error: null }
  return {
    data: {
      id: str(obj.id)!,
      practice_name: str(obj.practice_name),
      phone: str(obj.phone),
      website: str(obj.website),
      latest_roster_size: num(obj.latest_roster_size),
      latest_cms_observation_year: num(obj.latest_cms_observation_year),
    },
    error: null,
  }
}

export async function publicGetPracticeLocations(
  supabase: AnySupabase,
  id: string,
): Promise<{ data: PublicPracticeLocation[]; error: string | null }> {
  const { data, error } = await supabase.rpc('public_get_practice_locations', { p_id: id })
  if (error) return { data: [], error: error.message }
  return {
    data: asArray(data)
      .map(row => {
        const r = asObject(row)
        if (!r || !str(r.id)) return null
        return {
          id: str(r.id)!,
          address: str(r.address),
          city: str(r.city),
          state: str(r.state),
          zip: str(r.zip),
        } satisfies PublicPracticeLocation
      })
      .filter((row): row is PublicPracticeLocation => row !== null),
    error: null,
  }
}

export async function publicGetPracticeRoster(
  supabase: AnySupabase,
  id: string,
): Promise<{ data: PublicRosterPhysician[]; error: string | null }> {
  const { data, error } = await supabase.rpc('public_get_practice_roster', { p_id: id })
  if (error) return { data: [], error: error.message }
  return {
    data: asArray(data)
      .map(row => {
        const r = asObject(row)
        if (!r || !str(r.id)) return null
        return {
          id: str(r.id)!,
          physician_name: str(r.physician_name),
        } satisfies PublicRosterPhysician
      })
      .filter((row): row is PublicRosterPhysician => row !== null),
    error: null,
  }
}

export async function publicGetPhysician(
  supabase: AnySupabase,
  id: string,
): Promise<{ data: PublicPhysician | null; error: string | null }> {
  const { data, error } = await supabase.rpc('public_get_physician', { p_id: id })
  if (error) return { data: null, error: error.message }
  if (data == null) return { data: null, error: null }
  const obj = asObject(data)
  if (!obj || !str(obj.id)) return { data: null, error: null }
  const affiliations = asArray(obj.current_affiliations)
    .map(row => {
      const r = asObject(row)
      if (!r) return null
      return {
        practice_id: str(r.practice_id),
        practice_name: str(r.practice_name),
        city: str(r.city),
        state: str(r.state),
        latest_cms_observation_year: num(r.latest_cms_observation_year),
      } satisfies PublicPhysicianAffiliation
    })
    .filter((row): row is PublicPhysicianAffiliation => row !== null)

  return {
    data: {
      id: str(obj.id)!,
      physician_name: str(obj.physician_name),
      npi: str(obj.npi),
      current_affiliations: affiliations,
    },
    error: null,
  }
}

export function formatPublicCityState(city: string | null, state: string | null): string {
  const c = (city || '').trim()
  const s = (state || '').trim()
  if (c && s) return `${c}, ${s}`
  return c || s || ''
}
