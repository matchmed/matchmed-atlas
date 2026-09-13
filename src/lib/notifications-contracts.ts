export type NotificationType =
  | 'opportunity_matched'
  | 'opportunity_changed'
  | 'opportunity_closed'
  | 'region_ready_milestone'
  | 'relationship_practice_ready'
  | 'relationship_opportunity_update'
  | 'connect_requested'
  | 'connect_accepted'

export type NotificationDeliveryChannel = 'digest' | 'transactional'

export type PhysicianNotification = {
  id: string
  notification_type: NotificationType
  delivery_channel: NotificationDeliveryChannel
  title: string
  body: string
  payload: Record<string, unknown>
  destination_type: string
  destination_id: string | null
  deep_link: string
  created_at: string
  read_at: string | null
}

/** Deterministic dedupe key formats (must match SQL enqueue paths). */
export const NOTIFICATION_DEDUPE = {
  opportunityCreated: (opportunityId: string, physicianId: string) =>
    `opportunity_created:${opportunityId}:${physicianId}`,
  opportunityChanged: (opportunityId: string, version: number | string, physicianId: string) =>
    `opportunity_changed:${opportunityId}:${version}:${physicianId}`,
  opportunityClosed: (opportunityId: string, physicianId: string) =>
    `opportunity_closed:${opportunityId}:${physicianId}`,
  regionReady: (state: string, milestone: number | string, physicianId: string) =>
    `region_ready:${state}:${milestone}:${physicianId}`,
  connectRequested: (connectId: string, physicianId: string) =>
    `connect_requested:${connectId}:${physicianId}`,
  connectAccepted: (connectId: string, physicianId: string) =>
    `connect_accepted:${connectId}:${physicianId}`,
  relationshipReady: (practiceId: string, physicianId: string) =>
    `relationship_ready:${practiceId}:${physicianId}`,
  relationshipOpp: (opportunityId: string, version: number | string, physicianId: string) =>
    `relationship_opp:${opportunityId}:${version}:${physicianId}`,
} as const

export const REGION_READY_MILESTONES = [3, 5, 10, 25, 50] as const

/** Silent geography baseline sentinel stored in physician_region_ready_milestones. */
export const REGION_READY_BASELINE_SENTINEL = 0 as const

/**
 * Highest public milestone already crossed by readyCount, or null if below 3.
 * Used to document silent baseline semantics (no historical notifications).
 */
export function highestCrossedRegionMilestone(
  readyCount: number,
): (typeof REGION_READY_MILESTONES)[number] | null {
  let highest: (typeof REGION_READY_MILESTONES)[number] | null = null
  for (const m of REGION_READY_MILESTONES) {
    if (readyCount >= m) highest = m
  }
  return highest
}

/**
 * Milestones that should be silently baselined when a physician first becomes
 * eligible for a geography at the given ready count. Empty when count < 3
 * (SQL stores sentinel 0 instead).
 */
export function silentBaselineMilestones(
  readyCount: number,
): Array<(typeof REGION_READY_MILESTONES)[number]> {
  return REGION_READY_MILESTONES.filter((m) => readyCount >= m)
}

export const MATERIAL_OPPORTUNITY_FIELDS = [
  'hiring_horizon',
  'base_compensation_min_usd',
  'base_compensation_max_usd',
  'base_compensation_max_is_open_ended',
] as const
