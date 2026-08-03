import { createClient } from '@/lib/supabase'

/** Sanitized physician-facing job listing (no employer contact fields). */
export type PhysicianJob = {
  id: string
  practice_name: string | null
  practice_id: string | null
  primary_location: string | null
  practice_setting: string | null
  clinical_surgical_mix: string | null
  ideal_hiring_timeline: string | null
  subspecialties_interest: string[] | null
  additional_details: string | null
  received_at: string | null
}

function asPhysicianJobs(data: unknown): PhysicianJob[] {
  if (!Array.isArray(data)) return []
  return data as PhysicianJob[]
}

/** Requires analysis-authorized session. Returns published + practice-linked listings only. */
export async function fetchPhysicianJobs(options?: {
  limit?: number
  offset?: number
}): Promise<{ data: PhysicianJob[]; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_physician_jobs', {
    p_limit: options?.limit ?? 200,
    p_offset: options?.offset ?? 0,
  })
  if (error) return { data: [], error: new Error(error.message) }
  return { data: asPhysicianJobs(data), error: null }
}

export async function fetchPhysicianJobsForPractice(
  practiceId: string,
): Promise<{ data: PhysicianJob[]; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_physician_jobs_for_practice', {
    p_practice_id: practiceId,
  })
  if (error) return { data: [], error: new Error(error.message) }
  return { data: asPhysicianJobs(data), error: null }
}

export async function countPhysicianJobs(): Promise<{
  count: number
  error: Error | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('count_physician_jobs')
  if (error) return { count: 0, error: new Error(error.message) }
  return { count: typeof data === 'number' ? data : Number(data) || 0, error: null }
}
