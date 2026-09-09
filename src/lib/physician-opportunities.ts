import { createClient } from '@/lib/supabase'

/** Sanitized physician-facing Opportunity (Layer 3 recruiting). No employer contact PII. */
export type PhysicianOpportunity = {
  id: string
  practice_id: string
  practice_name: string | null
  clinical_focus: string
  hiring_horizon: string
  horizon_rank?: number
  hiring_now: boolean
  hiring_notes: string | null
  base_compensation_min_usd: number
  base_compensation_max_usd: number | null
  base_compensation_max_is_open_ended: boolean
  productivity_structure_available: boolean
  signing_bonus_available: boolean
  relocation_assistance_available: boolean
  last_confirmed_at: string | null
  physician_ready_at: string | null
  practice_states: string[]
  reasons: Array<{ reason: string; other_text: string | null }>
  attribution_label: string | null
}

function asOpportunities(data: unknown): PhysicianOpportunity[] {
  if (!Array.isArray(data)) return []
  return data.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      practice_id: String(r.practice_id),
      practice_name: (r.practice_name as string | null) ?? null,
      clinical_focus: String(r.clinical_focus ?? ''),
      hiring_horizon: String(r.hiring_horizon ?? ''),
      horizon_rank: typeof r.horizon_rank === 'number' ? r.horizon_rank : undefined,
      hiring_now: r.hiring_now === true,
      hiring_notes: (r.hiring_notes as string | null) ?? null,
      base_compensation_min_usd: Number(r.base_compensation_min_usd) || 0,
      base_compensation_max_usd:
        r.base_compensation_max_usd == null ? null : Number(r.base_compensation_max_usd),
      base_compensation_max_is_open_ended: r.base_compensation_max_is_open_ended === true,
      productivity_structure_available: r.productivity_structure_available === true,
      signing_bonus_available: r.signing_bonus_available === true,
      relocation_assistance_available: r.relocation_assistance_available === true,
      last_confirmed_at: (r.last_confirmed_at as string | null) ?? null,
      physician_ready_at: (r.physician_ready_at as string | null) ?? null,
      practice_states: Array.isArray(r.practice_states)
        ? (r.practice_states as string[]).filter(Boolean)
        : [],
      reasons: Array.isArray(r.reasons)
        ? (r.reasons as Array<{ reason: string; other_text: string | null }>)
        : [],
      attribution_label: (r.attribution_label as string | null) ?? null,
    } satisfies PhysicianOpportunity
  })
}

export type OpportunityListFilters = {
  limit?: number
  offset?: number
  clinicalFocus?: string | null
  state?: string | null
  hiringHorizon?: string | null
}

/** Requires analysis-authorized session. Physician-ready Layer 3 opportunities only. */
export async function fetchPhysicianOpportunities(
  options?: OpportunityListFilters,
): Promise<{ data: PhysicianOpportunity[]; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_physician_opportunities', {
    p_limit: options?.limit ?? 200,
    p_offset: options?.offset ?? 0,
    p_clinical_focus: options?.clinicalFocus || null,
    p_state: options?.state || null,
    p_hiring_horizon: options?.hiringHorizon || null,
  })
  if (error) return { data: [], error: new Error(error.message) }
  return { data: asOpportunities(data), error: null }
}

export async function fetchPhysicianOpportunitiesForPractice(
  practiceId: string,
): Promise<{ data: PhysicianOpportunity[]; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_physician_opportunities_for_practice', {
    p_practice_id: practiceId,
  })
  if (error) return { data: [], error: new Error(error.message) }
  return { data: asOpportunities(data), error: null }
}

export async function countPhysicianOpportunities(options?: {
  clinicalFocus?: string | null
  state?: string | null
  hiringHorizon?: string | null
}): Promise<{ count: number; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('count_physician_opportunities', {
    p_clinical_focus: options?.clinicalFocus || null,
    p_state: options?.state || null,
    p_hiring_horizon: options?.hiringHorizon || null,
  })
  if (error) return { count: 0, error: new Error(error.message) }
  return { count: typeof data === 'number' ? data : Number(data) || 0, error: null }
}
