import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service/secret client for cron / privileged server jobs.
 * Never import from client components.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` may hold either:
 * - legacy JWT `service_role` key, or
 * - current Supabase secret key (`sb_secret_...`)
 * Pass the value directly to createClient. Do not assume JWT shape.
 *
 * Note: `supabase projects api-keys` can return a secret value that REST
 * rejects even though length/prefix look plausible. Prefer the Dashboard
 * secret key for Production.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
