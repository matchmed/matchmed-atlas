/**
 * Canonical physician consent model.
 *
 * - industry_partnership_acknowledged: required onboarding acknowledgement (separate)
 * - data_sharing: single user-controlled flag for industry opportunities + anonymous
 *   practice discovery + practice-initiated Connect
 *
 * Physician-initiated Connect remains allowed when data_sharing is false.
 */

export const CONSENT_ONBOARDING_HEADING = 'Professional opportunities & connections'

export const CONSENT_ONBOARDING_CHECKBOX_COPY =
  'I agree to receive relevant educational, training, research, event, career, and professional opportunities from Atlas and its industry partners. I also agree to let verified ophthalmology practices view my anonymized career profile and request a connection. My identity is only shared if I choose to connect. I can opt out at any time.'

export const CONSENT_INDEPENDENCE_NOTE =
  'Industry partners do not influence Atlas practice scores, rankings, search results, or how practice information is presented.'

export const CONSENT_ACCOUNT_HEADING = 'Professional Opportunities & Connections'

export const CONSENT_ACCOUNT_CHECKBOX_COPY =
  'Receive relevant opportunities from Atlas and industry partners, and allow verified ophthalmology practices to view your anonymized career profile and request a connection. Your identity is only shared if you choose to connect.'

/** Fields forced true when onboarding completes with the combined consent checkbox. */
export function onboardingConsentCompletionFields(): {
  industry_partnership_acknowledged: true
  data_sharing: true
} {
  return {
    industry_partnership_acknowledged: true,
    data_sharing: true,
  }
}
