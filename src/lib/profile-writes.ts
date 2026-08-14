import type { SupabaseClient } from '@supabase/supabase-js'

export type ProfileWriteResult =
  | { ok: true; userId: string }
  | { ok: false; reason: string }

/** Columns onboarding and Account may write. Everything else is stripped. */
const ALLOWED_PROFILE_FIELDS = [
  'first_name',
  'last_name',
  'npi',
  'phone',
  'preferred_state',
  'start_year',
  'clinical_focus',
  'training_status',
  'practice_setting_preference',
  'current_practice',
  'procedures_performed',
  'procedures_desired',
  'terms_accepted',
  'industry_partnership_acknowledged',
  'data_sharing',
  'onboarding_complete',
  'signup_date',
] as const

type AllowedProfileField = (typeof ALLOWED_PROFILE_FIELDS)[number]

export type ProfileUpsertFields = Partial<Record<AllowedProfileField, unknown>>

const BLOCKED_PROFILE_FIELDS = new Set([
  'id',
  'is_admin',
  'is_internal',
  'npi_verified',
  'deleted_at',
  'airtable_id',
  'created_at',
  'user_id',
  'email',
])

/** Safe PostHog failure reason: PostgREST/Postgres code only, else normalized token. */
export function normalizeProfileWriteFailure(error: { code?: string } | null | undefined): string {
  const code = error?.code
  if (typeof code === 'string' && /^[A-Z0-9_.-]{1,64}$/i.test(code)) {
    return code
  }
  return 'write_failed'
}

function pickAllowedFields(input: Record<string, unknown>): ProfileUpsertFields {
  const out: ProfileUpsertFields = {}
  for (const key of ALLOWED_PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, key) && !BLOCKED_PROFILE_FIELDS.has(key)) {
      out[key] = input[key]
    }
  }
  return out
}

/**
 * Idempotent profiles write keyed on user_id.
 * user_id and email always come from the authenticated session — never from callers.
 * Success requires a returned row — never treat error:null + zero rows as success.
 */
export async function upsertProfileByUserId(
  supabase: SupabaseClient,
  fields: ProfileUpsertFields = {},
): Promise<ProfileWriteResult> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, reason: 'unauthenticated' }
  }

  const allowed = pickAllowedFields(fields as Record<string, unknown>)
  const payload = {
    ...allowed,
    user_id: user.id,
    email: user.email ?? null,
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id')
    .single()

  if (error) {
    return { ok: false, reason: normalizeProfileWriteFailure(error) }
  }
  if (!data?.user_id) {
    return { ok: false, reason: 'no_row_returned' }
  }
  return { ok: true, userId: data.user_id }
}
