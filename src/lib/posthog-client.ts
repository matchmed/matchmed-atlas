import posthog from 'posthog-js'

/** No-ops when PostHog is not initialized (local / preview). */
export function captureAnalyticsEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
  options?: { sendInstantly?: boolean },
): void {
  if (typeof window === 'undefined') return
  if (typeof posthog?.capture !== 'function') return
  posthog.capture(
    event,
    properties,
    options?.sendInstantly ? { send_instantly: true, transport: 'sendBeacon' } : undefined,
  )
}
