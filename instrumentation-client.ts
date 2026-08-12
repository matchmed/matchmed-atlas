import posthog from 'posthog-js'
import type { CaptureResult } from 'posthog-js'
import { sanitizeAnalyticsProperties } from '@/lib/posthog-privacy'

function isPostHogEnabled(token: string | undefined): boolean {
  if (!token) return false
  // Production only by default. Local and Vercel Preview stay off unless
  // explicitly configured later.
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV
  return vercelEnv === 'production'
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event
  return {
    ...event,
    properties: sanitizeAnalyticsProperties(event.properties as Record<string, unknown>) ?? {},
    $set: sanitizeAnalyticsProperties(event.$set as Record<string, unknown> | undefined),
    $set_once: sanitizeAnalyticsProperties(event.$set_once as Record<string, unknown> | undefined),
  }
}

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

if (isPostHogEnabled(token)) {
  posthog.init(token!, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    autocapture: false,
    capture_pageview: true,
    person_profiles: 'identified_only',
    // Recording is started only from authenticated product chrome (Nav),
    // never on public discovery routes — including auth'd profile views.
    disable_session_recording: true,
    capture_heatmaps: true,
    capture_exceptions: false,
    disable_surveys: true,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
    },
    before_send: beforeSend,
    debug: false,
  })
}
