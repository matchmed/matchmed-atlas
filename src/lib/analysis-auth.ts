import { createClient as createBrowserClient } from '@/lib/supabase'
import { createClient as createServerClient } from '@/lib/supabase-server'

type AnySupabase =
  | ReturnType<typeof createBrowserClient>
  | Awaited<ReturnType<typeof createServerClient>>

export async function isAnalysisAuthorizedUser(
  supabase: AnySupabase,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false
  const { data: profile } = await supabase
    .from('profiles')
    .select('deleted_at, onboarding_complete, is_admin')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile || profile.deleted_at) return false
  return profile.onboarding_complete === true || profile.is_admin === true
}
