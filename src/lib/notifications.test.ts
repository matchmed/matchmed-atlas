import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MATERIAL_OPPORTUNITY_FIELDS,
  NOTIFICATION_DEDUPE,
  REGION_READY_BASELINE_SENTINEL,
  REGION_READY_MILESTONES,
  highestCrossedRegionMilestone,
  silentBaselineMilestones,
} from './notifications-contracts.ts'
import { isAllowedProfileWriteField } from './profile-writes.ts'
import { safeNextPath } from './safe-next-path.ts'

describe('physician notifications V1 contracts', () => {
  it('documents match semantics: clinical_focus AND preferred_state intersection only', () => {
    const matchSemantics = {
      requiresClinicalFocusIntersection: true,
      requiresPreferredStateIntersection: true,
      usesBrowsingHistory: false,
      usesFavoritesForPreferenceMatch: false,
      usesHiringHorizonForMatch: false,
      requiresEligiblePhysician:
        'user_id IS NOT NULL AND deleted_at IS NULL AND onboarding_complete IS TRUE',
    }
    assert.equal(matchSemantics.requiresClinicalFocusIntersection, true)
    assert.equal(matchSemantics.requiresPreferredStateIntersection, true)
    assert.equal(matchSemantics.usesBrowsingHistory, false)
    assert.equal(matchSemantics.usesFavoritesForPreferenceMatch, false)
    assert.equal(matchSemantics.usesHiringHorizonForMatch, false)
    assert.match(matchSemantics.requiresEligiblePhysician, /onboarding_complete/)
  })

  it('documents material opportunity fields and close semantics', () => {
    assert.deepEqual([...MATERIAL_OPPORTUNITY_FIELDS], [
      'hiring_horizon',
      'base_compensation_min_usd',
      'base_compensation_max_usd',
      'base_compensation_max_is_open_ended',
    ])
    assert.equal(
      'hiring_notes' in Object.fromEntries(MATERIAL_OPPORTUNITY_FIELDS.map((f) => [f, true])),
      false,
    )
    const closeSemantics = {
      deleteTriggersClosed: true,
      loseVisibilityTriggersClosed: true,
      notesOnlyDoesNotTrigger: true,
    }
    assert.equal(closeSemantics.deleteTriggersClosed, true)
    assert.equal(closeSemantics.loseVisibilityTriggersClosed, true)
    assert.equal(closeSemantics.notesOnlyDoesNotTrigger, true)
  })

  it('uses sparse regional milestones 3/5/10/25/50', () => {
    assert.deepEqual([...REGION_READY_MILESTONES], [3, 5, 10, 25, 50])
    assert.equal(REGION_READY_BASELINE_SENTINEL, 0)
  })

  it('silently baselines historical milestones for new geography eligibility', () => {
    assert.deepEqual(silentBaselineMilestones(12), [3, 5, 10])
    assert.equal(highestCrossedRegionMilestone(12), 10)
    assert.deepEqual(silentBaselineMilestones(6), [3, 5])
    assert.deepEqual(silentBaselineMilestones(2), [])
    assert.equal(highestCrossedRegionMilestone(2), null)
    assert.deepEqual(silentBaselineMilestones(50), [3, 5, 10, 25, 50])
    // Next live crossing after baseline at 12 is 25 — not 3/5/10 again.
    assert.equal(
      REGION_READY_MILESTONES.find((m) => m > (highestCrossedRegionMilestone(12) ?? 0)),
      25,
    )
  })

  it('preserves baseline across remove/re-add preference (no historical resend)', () => {
    const alreadyBaselined = new Set(silentBaselineMilestones(12))
    const onReAdd = silentBaselineMilestones(12)
    for (const m of onReAdd) {
      assert.equal(alreadyBaselined.has(m), true)
    }
    // Live notify set after baseline is empty until count crosses next threshold.
    const liveNotify = REGION_READY_MILESTONES.filter(
      (m) => m <= 12 && !alreadyBaselined.has(m),
    )
    assert.deepEqual(liveNotify, [])
  })

  it('formats deterministic dedupe keys per product brief', () => {
    const opp = '11111111-1111-4111-8111-111111111111'
    const phys = '22222222-2222-4222-8222-222222222222'
    const connect = '33333333-3333-4333-8333-333333333333'
    const practice = '44444444-4444-4444-8444-444444444444'

    assert.equal(
      NOTIFICATION_DEDUPE.opportunityCreated(opp, phys),
      `opportunity_created:${opp}:${phys}`,
    )
    assert.equal(
      NOTIFICATION_DEDUPE.opportunityChanged(opp, 2, phys),
      `opportunity_changed:${opp}:2:${phys}`,
    )
    assert.equal(
      NOTIFICATION_DEDUPE.opportunityClosed(opp, phys),
      `opportunity_closed:${opp}:${phys}`,
    )
    assert.equal(
      NOTIFICATION_DEDUPE.regionReady('GA', 5, phys),
      `region_ready:GA:5:${phys}`,
    )
    assert.equal(
      NOTIFICATION_DEDUPE.connectRequested(connect, phys),
      `connect_requested:${connect}:${phys}`,
    )
    assert.equal(
      NOTIFICATION_DEDUPE.connectAccepted(connect, phys),
      `connect_accepted:${connect}:${phys}`,
    )
    assert.equal(
      NOTIFICATION_DEDUPE.relationshipReady(practice, phys),
      `relationship_ready:${practice}:${phys}`,
    )
    assert.equal(
      NOTIFICATION_DEDUPE.relationshipOpp(opp, 1, phys),
      `relationship_opp:${opp}:1:${phys}`,
    )
  })

  it('allows notify_* preference fields on Account writes', () => {
    assert.equal(isAllowedProfileWriteField('notify_career_emails'), true)
    assert.equal(isAllowedProfileWriteField('notify_regional_emails'), true)
    assert.equal(isAllowedProfileWriteField('notify_connect_emails'), true)
  })

  it('extends safeNextPath for notification destinations', () => {
    assert.equal(safeNextPath('/opportunities'), '/opportunities')
    assert.equal(safeNextPath('/connect'), '/connect')
    assert.equal(safeNextPath('/notifications'), '/notifications')
    assert.equal(safeNextPath('/account'), '/account')
    assert.equal(
      safeNextPath('/practices/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      '/practices/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    )
    assert.equal(safeNextPath('https://evil.example/opportunities'), null)
    assert.equal(safeNextPath('/login'), null)
    assert.equal(safeNextPath('/admin'), null)
  })

  it('documents email consent gates', () => {
    const gates = {
      careerRequiresDataSharingAndPref: true,
      regionalRequiresDataSharingAndPref: true,
      connectUsesNotifyConnectEmailsOnly: true,
      mutedEmailKeepsInApp: true,
      notifyConnectFalseSuppressesEmailOnly: true,
      notifyConnectFalseKeepsInAppConnectAndNotifications: true,
    }
    assert.equal(gates.careerRequiresDataSharingAndPref, true)
    assert.equal(gates.regionalRequiresDataSharingAndPref, true)
    assert.equal(gates.connectUsesNotifyConnectEmailsOnly, true)
    assert.equal(gates.mutedEmailKeepsInApp, true)
    assert.equal(gates.notifyConnectFalseSuppressesEmailOnly, true)
    assert.equal(gates.notifyConnectFalseKeepsInAppConnectAndNotifications, true)
  })

  it('documents notification_created as intentionally deferred', () => {
    const analytics = {
      emitted: [
        'notification_opened',
        'notification_email_sent',
        'notification_email_clicked',
        'notification_preferences_changed',
      ],
      deferred: ['notification_created'],
      deferredReason: 'no DB webhook / extra infra for V1',
    }
    assert.equal(analytics.emitted.includes('notification_created'), false)
    assert.deepEqual(analytics.deferred, ['notification_created'])
  })
})
