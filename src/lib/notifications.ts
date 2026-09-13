import { createClient } from '@/lib/supabase'
import type { PhysicianNotification } from '@/lib/notifications-contracts'

export type {
  NotificationType,
  NotificationDeliveryChannel,
  PhysicianNotification,
} from '@/lib/notifications-contracts'

export {
  NOTIFICATION_DEDUPE,
  REGION_READY_MILESTONES,
  MATERIAL_OPPORTUNITY_FIELDS,
} from '@/lib/notifications-contracts'

function rpcError(error: { message: string } | null): Error {
  return new Error(error?.message || 'Notification request failed')
}

export async function listMyNotifications(
  limit = 50,
  before?: string | null,
): Promise<{ data: PhysicianNotification[]; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('notifications_list_mine', {
    p_limit: limit,
    p_before: before ?? null,
  })
  if (error) return { data: [], error: rpcError(error) }
  return { data: (data as PhysicianNotification[]) ?? [], error: null }
}

export async function getUnreadNotificationCount(): Promise<{
  count: number
  error: Error | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('notifications_unread_count')
  if (error) return { count: 0, error: rpcError(error) }
  return { count: typeof data === 'number' ? data : 0, error: null }
}

export async function markNotificationRead(
  notificationId: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('notifications_mark_read', {
    p_notification_id: notificationId,
  })
  if (error) return { ok: false, error: rpcError(error) }
  return { ok: data === true, error: null }
}

export async function markAllNotificationsRead(): Promise<{
  count: number
  error: Error | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('notifications_mark_all_read')
  if (error) return { count: 0, error: rpcError(error) }
  return { count: typeof data === 'number' ? data : 0, error: null }
}
