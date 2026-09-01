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

export type EmployerRosterAssertionType =
  | 'confirm_current'
  | 'report_departed'
  | 'billing_only'
  | 'incorrect_association'
  | 'affiliated_elsewhere_in_org'
  | 'report_still_affiliated'
  | 'confirm_former'
  | 'other'

export type EmployerOverlayProfile = {
  public_display_name: string | null
  website: string | null
  primary_phone: string | null
  recruiting_email: string | null
  recruiting_phone: string | null
  careers_url: string | null
  overview: string | null
  logo_storage_path: string | null
  roster_last_reviewed_at: string | null
}

export type EmployerOverlayLocation = {
  id: string
  status: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  is_primary: boolean
}

export type EmployerOverlayRosterAssertion = {
  doctor_id: string
  physician_name: string | null
  assertion: EmployerRosterAssertionType
}

export type EmployerPracticeOverlay = {
  visible: boolean
  attribution_label?: string
  profile?: EmployerOverlayProfile | null
  locations?: EmployerOverlayLocation[]
  roster_assertions?: EmployerOverlayRosterAssertion[]
}

const ASSERTION_LABELS: Record<EmployerRosterAssertionType, string> = {
  confirm_current: 'Confirmed current',
  report_departed: 'Reported departed',
  billing_only: 'Billing only',
  incorrect_association: 'Incorrect association',
  affiliated_elsewhere_in_org: 'Elsewhere in organization',
  report_still_affiliated: 'Still affiliated',
  confirm_former: 'Confirmed former',
  other: 'Practice note',
}

export function employerAssertionLabel(assertion: string): string {
  return (ASSERTION_LABELS as Record<string, string>)[assertion] ?? 'Practice note'
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

function parseEmployerOverlayProfile(value: unknown): EmployerOverlayProfile | null {
  const obj = asObject(value)
  if (!obj) return null
  return {
    public_display_name: str(obj.public_display_name),
    website: str(obj.website),
    primary_phone: str(obj.primary_phone),
    recruiting_email: str(obj.recruiting_email),
    recruiting_phone: str(obj.recruiting_phone),
    careers_url: str(obj.careers_url),
    overview: str(obj.overview),
    logo_storage_path: str(obj.logo_storage_path),
    roster_last_reviewed_at: str(obj.roster_last_reviewed_at),
  }
}

/** Fetch approved public_display_name values for a small set of practice IDs. */
export async function fetchApprovedPracticeDisplayNames(
  supabase: AnySupabase,
  practiceIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(practiceIds.filter(Boolean))]
  const found = new Map<string, string>()
  if (uniqueIds.length === 0) return found

  await Promise.all(
    uniqueIds.map(async practiceId => {
      const { data } = await publicGetEmployerPracticeOverlay(supabase, practiceId)
      const approved = data?.visible ? data.profile?.public_display_name?.trim() : null
      if (approved) found.set(practiceId, approved)
    }),
  )
  return found
}

export async function publicGetEmployerPracticeOverlay(
  supabase: AnySupabase,
  practiceId: string,
): Promise<{ data: EmployerPracticeOverlay | null; error: string | null }> {
  const { data, error } = await supabase.rpc('public_get_employer_practice_overlay', {
    p_practice_id: practiceId,
  })
  if (error) return { data: null, error: error.message }
  if (data == null) return { data: null, error: null }
  const obj = asObject(data)
  if (!obj) return { data: { visible: false }, error: null }
  if (obj.visible === false) return { data: { visible: false }, error: null }

  const locations = asArray(obj.locations)
    .map(row => {
      const r = asObject(row)
      if (!r || !str(r.id)) return null
      return {
        id: str(r.id)!,
        status: str(r.status) ?? 'active',
        address: str(r.address),
        city: str(r.city),
        state: str(r.state),
        zip: str(r.zip),
        phone: str(r.phone),
        is_primary: r.is_primary === true,
      } satisfies EmployerOverlayLocation
    })
    .filter((row): row is EmployerOverlayLocation => row !== null)

  const roster_assertions = asArray(obj.roster_assertions)
    .map(row => {
      const r = asObject(row)
      if (!r || !str(r.doctor_id) || !str(r.assertion)) return null
      return {
        doctor_id: str(r.doctor_id)!,
        physician_name: str(r.physician_name),
        assertion: str(r.assertion)! as EmployerRosterAssertionType,
      } satisfies EmployerOverlayRosterAssertion
    })
    .filter((row): row is EmployerOverlayRosterAssertion => row !== null)

  return {
    data: {
      visible: true,
      attribution_label: str(obj.attribution_label) ?? undefined,
      profile: parseEmployerOverlayProfile(obj.profile),
      locations,
      roster_assertions,
    },
    error: null,
  }
}

export async function resolveEmployerLogoUrl(
  supabase: AnySupabase,
  storagePath: string | null | undefined,
): Promise<string | null> {
  if (!storagePath) return null
  const { data, error } = await supabase.storage
    .from('employer-practice-logos')
    .createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
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

/** Display-only ZIP formatting. Does not alter stored values. */
export function formatPublicZip(zip: string | null | undefined): string {
  if (zip == null) return ''
  const digits = String(zip).replace(/\D/g, '')
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  if (digits.length === 5) return digits
  return String(zip).trim()
}
