import { createClient } from '@/lib/supabase'

export type ConnectStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'canceled'
  | 'disconnected'

export type ConnectInitiatorSide = 'physician' | 'practice'

export type ConnectRelationshipSummary = {
  id: string
  practice_id: string
  status: ConnectStatus
  initiator_side: ConnectInitiatorSide
  opportunity_id: string | null
  created_at: string
  updated_at?: string
  responded_at?: string | null
  canceled_at?: string | null
  disconnected_at?: string | null
  disconnected_by_side?: string | null
  practice_name?: string | null
  display_name?: string | null
  practice_city?: string | null
  practice_state?: string | null
  practice_eligible?: boolean
  physician_profile_id?: string
  physician?: ConnectAnonymousPhysician | ConnectUnlockedPhysician
  last_message_preview?: string | null
  last_message_at?: string | null
  last_message_sender_side?: ConnectInitiatorSide | null
  has_unread?: boolean
  origin_clinical_focus?: string | null
}

export type ConnectAnonymousPhysician = {
  physician_profile_id: string
  training_status: string | null
  clinical_focus: string[] | null
  preferred_state: string[] | null
  start_year: string | number | null
  practice_setting_preference: string[] | string | null
}

export type ConnectUnlockedPhysician = ConnectAnonymousPhysician & {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  npi: string | null
  npi_verified: boolean | null
  current_practice: string | null
  procedures_performed: string[] | null
  procedures_desired: string[] | null
}

export type ConnectMessage = {
  id: string
  relationship_id: string
  sender_side: ConnectInitiatorSide
  body: string
  is_intro: boolean
  created_at: string
  is_mine: boolean
}

export type ConnectMessagesPayload = {
  relationship_id: string
  status: ConnectStatus
  viewer_side: ConnectInitiatorSide
  opportunity_id: string | null
  origin_clinical_focus: string | null
  messages: ConnectMessage[]
}

export type ConnectThreadSeenState = {
  state: 'none' | 'sent' | 'seen'
  latest_message_id?: string
}

export const CONNECT_MESSAGE_MAX_LEN = 2000
export const CONNECT_INTRO_NOTE_MAX_LEN = 1000

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

function rpcError(error: { message: string } | null): Error {
  return new Error(error?.message || 'Connect request failed')
}

/** Shared Connect API for practice detail, inbox, and future Opportunity CTAs. */
export async function connectPracticeIsEligible(
  practiceId: string,
): Promise<{ eligible: boolean; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_practice_is_eligible', {
    p_practice_id: practiceId,
  })
  if (error) return { eligible: false, error: rpcError(error) }
  return { eligible: data === true, error: null }
}

export async function connectActiveForPair(
  practiceId: string,
): Promise<{ data: ConnectRelationshipSummary | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_active_for_pair', {
    p_practice_id: practiceId,
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: (data as ConnectRelationshipSummary | null) ?? null, error: null }
}

export async function connectInitiateByPhysician(
  practiceId: string,
  opportunityId?: string | null,
  introNote?: string | null,
): Promise<{ data: ConnectRelationshipSummary | null; error: Error | null }> {
  const supabase = createClient()
  const trimmed = introNote?.trim() || null
  const { data, error } = await supabase.rpc('connect_initiate_by_physician', {
    p_practice_id: practiceId,
    p_opportunity_id: opportunityId ?? null,
    p_intro_note: trimmed,
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as ConnectRelationshipSummary, error: null }
}

export async function connectAccept(
  relationshipId: string,
): Promise<{ data: ConnectRelationshipSummary | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_accept', {
    p_relationship_id: relationshipId,
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as ConnectRelationshipSummary, error: null }
}

export async function connectDecline(
  relationshipId: string,
): Promise<{ data: ConnectRelationshipSummary | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_decline', {
    p_relationship_id: relationshipId,
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as ConnectRelationshipSummary, error: null }
}

export async function connectCancel(
  relationshipId: string,
): Promise<{ data: ConnectRelationshipSummary | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_cancel', {
    p_relationship_id: relationshipId,
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as ConnectRelationshipSummary, error: null }
}

export async function connectDisconnect(
  relationshipId: string,
): Promise<{ data: ConnectRelationshipSummary | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_disconnect', {
    p_relationship_id: relationshipId,
    p_actor_side: 'physician',
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as ConnectRelationshipSummary, error: null }
}

export async function connectListForPhysician(): Promise<{
  data: ConnectRelationshipSummary[]
  error: Error | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_list_for_physician')
  if (error) return { data: [], error: rpcError(error) }
  return { data: asArray<ConnectRelationshipSummary>(data), error: null }
}

export async function connectListMessages(
  relationshipId: string,
  opts?: { limit?: number; before?: string | null },
): Promise<{ data: ConnectMessagesPayload | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_list_messages', {
    p_relationship_id: relationshipId,
    p_actor_side: 'physician',
    p_limit: opts?.limit ?? 100,
    p_before: opts?.before ?? null,
  })
  if (error) return { data: null, error: rpcError(error) }
  const payload = data as ConnectMessagesPayload | null
  if (!payload) return { data: null, error: null }
  return {
    data: {
      ...payload,
      messages: asArray<ConnectMessage>(payload.messages),
    },
    error: null,
  }
}

export async function connectSendMessage(
  relationshipId: string,
  body: string,
): Promise<{ data: ConnectMessage | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_send_message', {
    p_relationship_id: relationshipId,
    p_body: body,
    p_actor_side: 'physician',
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as ConnectMessage, error: null }
}

export async function connectMarkThreadRead(
  relationshipId: string,
): Promise<{
  data: { relationship_id: string; last_read_message_id: string | null } | null
  error: Error | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_mark_thread_read', {
    p_relationship_id: relationshipId,
    p_actor_side: 'physician',
  })
  if (error) return { data: null, error: rpcError(error) }
  return {
    data: data as { relationship_id: string; last_read_message_id: string | null },
    error: null,
  }
}

export async function connectThreadSeenState(
  relationshipId: string,
): Promise<{ data: ConnectThreadSeenState | null; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('connect_thread_seen_state', {
    p_relationship_id: relationshipId,
    p_actor_side: 'physician',
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: (data as ConnectThreadSeenState | null) ?? null, error: null }
}
