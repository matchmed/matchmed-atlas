import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service/secret client for cron / privileged server jobs.
 * Never import from client components.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` may hold either:
 * - legacy JWT `service_role` key, or
 * - current Supabase secret key (`sb_secret_...`)
 * Both are passed directly to createClient; do not treat the value as JWT-only.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  // Guard against truncated CLI/prefix-only secret values (observed ~41 chars).
  if (key.startsWith('sb_secret_') && key.length < 50) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY looks truncated; use the full Dashboard secret key')
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
