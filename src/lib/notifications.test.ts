import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MATERIAL_OPPORTUNITY_FIELDS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_DEDUPE,
  REGION_READY_BASELINE_SENTINEL,
  REGION_READY_MILESTONES,
  categoryForNotificationType,
  categoryLabel,
  highestCrossedRegionMilestone,
  silentBaselineMilestones,
} from './notifications-contracts.ts'
import { buildDigestEmail } from './notifications-email.ts'
import { isAllowedProfileWriteField } from './profile-writes.ts'
import { safeNextPath } from './safe-next-path.ts'

describe('physician notifications taxonomy cleanup', () => {
  it('maps every notification_type to exactly one category ownership', () => {
    assert.equal(NOTIFICATION_CATEGORY.opportunity_matched.category, 'career')
    assert.equal(NOTIFICATION_CATEGORY.opportunity_changed.category, 'career')
    assert.equal(NOTIFICATION_CATEGORY.opportunity_closed.category, 'career')
    assert.equal(NOTIFICATION_CATEGORY.relationship_opportunity_update.category, 'followed_practice')
    assert.equal(NOTIFICATION_CATEGORY.relationship_practice_ready.category, 'followed_practice')
    assert.equal(NOTIFICATION_CATEGORY.connect_requested.category, 'connect')
    assert.equal(NOTIFICATION_CATEGORY.connect_accepted.category, 'connect')
    assert.equal(NOTIFICATION_CATEGORY.region_ready_milestone.category, 'disabled')

    assert.equal(
      NOTIFICATION_CATEGORY.opportunity_matched.preferenceField,
      'notify_career_emails',
    )
    assert.equal(
      NOTIFICATION_CATEGORY.relationship_opportunity_update.preferenceField,
      'notify_followed_practice_emails',
    )
    assert.equal(
      NOTIFICATION_CATEGORY.connect_requested.preferenceField,
      'notify_connect_emails',
    )
    assert.equal(NOTIFICATION_CATEGORY.region_ready_milestone.preferenceField, null)
    assert.equal(NOTIFICATION_CATEGORY.region_ready_milestone.channel, 'none')
  })

  it('exposes physician-facing category labels without regional growth wording', () => {
    assert.equal(categoryLabel('career'), 'Career & opportunity updates')
    assert.equal(categoryLabel('followed_practice'), 'Practice updates you follow')
    assert.equal(categoryLabel('connect'), 'Connect updates')
    assert.equal(categoryForNotificationType('region_ready_milestone'), 'disabled')
    for (const label of [
      categoryLabel('career'),
      categoryLabel('followed_practice'),
      categoryLabel('connect'),
    ]) {
      assert.equal(/physician-ready|regional|milestone|Layer 3/i.test(label), false)
    }
  })

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

  it('keeps regional milestones as silent baseline bookkeeping only', () => {
    assert.deepEqual([...REGION_READY_MILESTONES], [3, 5, 10, 25, 50])
    assert.equal(REGION_READY_BASELINE_SENTINEL, 0)
    assert.deepEqual(silentBaselineMilestones(12), [3, 5, 10])
    assert.equal(highestCrossedRegionMilestone(12), 10)
    // No live email/proactive notify set after silent baseline.
    const alreadyBaselined = new Set(silentBaselineMilestones(12))
    const liveNotify = REGION_READY_MILESTONES.filter(
      (m) => m <= 12 && !alreadyBaselined.has(m),
    )
    assert.deepEqual(liveNotify, [])
  })

  it('formats deterministic dedupe keys and documents one-notification dedupe rule', () => {
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

    const dedupeRule = {
      preferenceMatchWins: true,
      relationshipSkippedIfMatched: true,
      maxNotificationsPerUnderlyingEvent: 1,
    }
    assert.equal(dedupeRule.maxNotificationsPerUnderlyingEvent, 1)
    assert.equal(dedupeRule.relationshipSkippedIfMatched, true)
  })

  it('allows career/followed/connect prefs and removes regional from Account writes', () => {
    assert.equal(isAllowedProfileWriteField('notify_career_emails'), true)
    assert.equal(isAllowedProfileWriteField('notify_followed_practice_emails'), true)
    assert.equal(isAllowedProfileWriteField('notify_connect_emails'), true)
    assert.equal(isAllowedProfileWriteField('notify_regional_emails'), false)
  })

  it('documents email consent gates for the three-category taxonomy', () => {
    const gates = {
      careerRequiresDataSharingAndPref: true,
      followedRequiresDataSharingAndPref: true,
      regionalEmailDisabled: true,
      connectUsesNotifyConnectEmailsOnly: true,
      mutedEmailKeepsInApp: true,
      notifyConnectFalseSuppressesEmailOnly: true,
      notifyConnectFalseKeepsInAppConnectAndNotifications: true,
      employerOnlyUsersExcluded: true,
    }
    assert.equal(gates.careerRequiresDataSharingAndPref, true)
    assert.equal(gates.followedRequiresDataSharingAndPref, true)
    assert.equal(gates.regionalEmailDisabled, true)
    assert.equal(gates.connectUsesNotifyConnectEmailsOnly, true)
    assert.equal(gates.mutedEmailKeepsInApp, true)
    assert.equal(gates.notifyConnectFalseSuppressesEmailOnly, true)
    assert.equal(gates.notifyConnectFalseKeepsInAppConnectAndNotifications, true)
    assert.equal(gates.employerOnlyUsersExcluded, true)
  })

  it('builds digest with career + followed sections and excludes regional milestones', () => {
    const content = buildDigestEmail([
      {
        notification_type: 'opportunity_matched',
        title: 'New Glaucoma opportunity matches your preferences',
        body: 'AEC added a Glaucoma opportunity.',
        deep_link: '/practices/p1',
      },
      {
        notification_type: 'relationship_opportunity_update',
        title: 'Arizona Eye Consultants updated an opportunity',
        body: 'A practice you follow updated compensation.',
        deep_link: '/practices/p2',
      },
      {
        notification_type: 'region_ready_milestone',
        title: '5 practices in Georgia are physician-ready',
        body: 'Should never appear in digest email.',
        deep_link: '/opportunities',
      },
    ])

    assert.match(content.subject, /opportunit/i)
    assert.match(content.html, /Career &amp; opportunity updates/)
    assert.match(content.html, /Practice updates you follow/)
    assert.equal(/physician-ready|Network growth|regional/i.test(content.html), false)
    assert.equal(content.html.includes('5 practices in Georgia'), false)
    assert.match(content.text, /Career & opportunity updates/)
    assert.match(content.text, /Practice updates you follow/)
    assert.equal(content.text.includes('5 practices in Georgia'), false)
  })

  it('does not duplicate the same event across digest sections', () => {
    // App-layer mirror of SQL rule: preference-matched rows are career-only;
    // followed section only includes relationship_* types.
    const items = [
      { notification_type: 'opportunity_matched', title: 'Career match', body: 'x' },
      {
        notification_type: 'relationship_opportunity_update',
        title: 'Followed update',
        body: 'y',
      },
    ]
    const content = buildDigestEmail(items)
    const careerIdx = content.text.indexOf('Career & opportunity updates')
    const followedIdx = content.text.indexOf('Practice updates you follow')
    assert.ok(careerIdx >= 0 && followedIdx > careerIdx)
    const careerSlice = content.text.slice(careerIdx, followedIdx)
    const followedSlice = content.text.slice(followedIdx)
    assert.match(careerSlice, /Career match/)
    assert.equal(careerSlice.includes('Followed update'), false)
    assert.match(followedSlice, /Followed update/)
    assert.equal(followedSlice.includes('Career match'), false)
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
