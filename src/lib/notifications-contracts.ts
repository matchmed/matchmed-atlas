export type NotificationType =
  | 'opportunity_matched'
  | 'opportunity_changed'
  | 'opportunity_closed'
  | 'region_ready_milestone'
  | 'relationship_practice_ready'
  | 'relationship_opportunity_update'
  | 'connect_requested'
  | 'connect_accepted'
  | 'connect_message'

export type NotificationDeliveryChannel = 'digest' | 'transactional'

/** Physician-facing email taxonomy (MAT-10 cleanup). */
export type NotificationEmailCategory =
  | 'career'
  | 'followed_practice'
  | 'connect'

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

export const NOTIFICATION_CATEGORY: Record<
  NotificationType,
  {
    category: NotificationEmailCategory | 'disabled'
    preferenceField:
      | 'notify_career_emails'
      | 'notify_followed_practice_emails'
      | 'notify_connect_emails'
      | null
    channel: NotificationDeliveryChannel | 'none'
    eligibility: string
  }
> = {
  opportunity_matched: {
    category: 'career',
    preferenceField: 'notify_career_emails',
    channel: 'digest',
    eligibility: 'clinical_focus ∩ preferred_state; favorite not required',
  },
  opportunity_changed: {
    category: 'career',
    preferenceField: 'notify_career_emails',
    channel: 'digest',
    eligibility: 'same preference match as opportunity_matched',
  },
  opportunity_closed: {
    category: 'career',
    preferenceField: 'notify_career_emails',
    channel: 'digest',
    eligibility: 'same preference match as opportunity_matched',
  },
  relationship_opportunity_update: {
    category: 'followed_practice',
    preferenceField: 'notify_followed_practice_emails',
    channel: 'digest',
    eligibility: 'favorite or accepted Connect; skipped if preference-matched',
  },
  relationship_practice_ready: {
    category: 'followed_practice',
    preferenceField: 'notify_followed_practice_emails',
    channel: 'digest',
    eligibility: 'favorite or accepted Connect; not geography-only',
  },
  connect_requested: {
    category: 'connect',
    preferenceField: 'notify_connect_emails',
    channel: 'transactional',
    eligibility: 'Connect recipient physician',
  },
  connect_accepted: {
    category: 'connect',
    preferenceField: 'notify_connect_emails',
    channel: 'transactional',
    eligibility: 'Connect physician party',
  },
  connect_message: {
    category: 'connect',
    preferenceField: 'notify_connect_emails',
    channel: 'transactional',
    eligibility: 'Accepted Connect; physician recipient of practice message',
  },
  region_ready_milestone: {
    category: 'disabled',
    preferenceField: null,
    channel: 'none',
    eligibility: 'no longer generated for email or proactive in-app',
  },
}

export function categoryForNotificationType(
  type: string | null | undefined,
): NotificationEmailCategory | 'disabled' | null {
  if (!type) return null
  const row = NOTIFICATION_CATEGORY[type as NotificationType]
  return row?.category ?? null
}

export function categoryLabel(
  category: NotificationEmailCategory | 'disabled' | null,
): string {
  switch (category) {
    case 'career':
      return 'Career & opportunity updates'
    case 'followed_practice':
      return 'Practice updates you follow'
    case 'connect':
      return 'Connect updates'
    default:
      return 'Updates'
  }
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
 * Used only for silent baseline bookkeeping (no physician email).
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
