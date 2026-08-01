import { PostHog } from 'posthog-node'

function isServerPostHogEnabled(): boolean {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return false
  // Production only by default. Local and Vercel Preview stay off.
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production'
  return false
}

/**
 * Pattern (a): instantiate a fresh PostHog client per capture, then await shutdown().
 *
 * Why not a module-level singleton + shutdown()? On Vercel, warm lambdas reuse the
 * module scope across requests; shutting down a shared client after the first
 * capture leaves later report_generated events silently dropped.
 *
 * Why not flush()-only on a singleton? capture + shutdown on a per-request client
 * is explicit about lifecycle and guarantees the event is sent before the route
 * returns without poisoning later requests.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!isServerPostHogEnabled()) return

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!token) return

  const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com'
  const posthog = new PostHog(token, {
    host,
    flushAt: 1,
    flushInterval: 0,
  })

  try {
    posthog.capture({
      distinctId,
      event,
      properties,
    })
    await posthog.shutdown()
  } catch {
    // Analytics must never break the calling route.
  }
}
