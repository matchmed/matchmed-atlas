import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONSENT_ACCOUNT_CHECKBOX_COPY,
  CONSENT_ACCOUNT_HEADING,
  CONSENT_INDEPENDENCE_NOTE,
  CONSENT_ONBOARDING_CHECKBOX_COPY,
  CONSENT_ONBOARDING_HEADING,
  onboardingConsentCompletionFields,
} from './consent-model.ts'
import { isAllowedProfileWriteField } from './profile-writes.ts'

describe('consent-model', () => {
  it('ships combined onboarding consent copy covering industry and practice discovery', () => {
    assert.equal(CONSENT_ONBOARDING_HEADING, 'Professional opportunities & connections')
    assert.match(CONSENT_ONBOARDING_CHECKBOX_COPY, /industry partners/i)
    assert.match(CONSENT_ONBOARDING_CHECKBOX_COPY, /anonymized career profile/i)
    assert.match(CONSENT_ONBOARDING_CHECKBOX_COPY, /request a connection/i)
    assert.match(CONSENT_ONBOARDING_CHECKBOX_COPY, /identity is only shared/i)
    assert.match(CONSENT_ONBOARDING_CHECKBOX_COPY, /opt out/i)
    assert.match(CONSENT_INDEPENDENCE_NOTE, /do not influence Atlas practice scores/i)
  })

  it('ships one Account consent control for data_sharing', () => {
    assert.equal(CONSENT_ACCOUNT_HEADING, 'Professional Opportunities & Connections')
    assert.match(CONSENT_ACCOUNT_CHECKBOX_COPY, /industry partners/i)
    assert.match(CONSENT_ACCOUNT_CHECKBOX_COPY, /anonymized career profile/i)
    assert.doesNotMatch(CONSENT_ACCOUNT_HEADING, /Practice Connect/i)
    assert.doesNotMatch(CONSENT_ACCOUNT_HEADING, /Introductions/i)
  })

  it('onboarding completion writes data_sharing and industry ack, not open_to_practice_connections', () => {
    const fields = onboardingConsentCompletionFields()
    assert.deepEqual(fields, {
      industry_partnership_acknowledged: true,
      data_sharing: true,
    })
    assert.equal(
      Object.prototype.hasOwnProperty.call(fields, 'open_to_practice_connections'),
      false,
    )
    assert.equal(isAllowedProfileWriteField('data_sharing'), true)
    assert.equal(isAllowedProfileWriteField('industry_partnership_acknowledged'), true)
    assert.equal(isAllowedProfileWriteField('open_to_practice_connections'), false)
  })
})
