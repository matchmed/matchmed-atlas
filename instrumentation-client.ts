import posthog from 'posthog-js'
import type { CaptureResult } from 'posthog-js'

const SENSITIVE_URL_PARAMS = new Set([
  'code',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'error_description',
  'token_hash',
])

const URL_PROPERTY_KEYS = new Set([
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$referring_domain',
  '$initial_referring_domain',
])

function isPostHogEnabled(token: string | undefined): boolean {
  if (!token) return false
  // Production only by default. Local and Vercel Preview stay off unless
  // explicitly configured later.
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV
  return vercelEnv === 'production'
}

function redactUrlString(raw: string): string {
  try {
    const absolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)
    const url = absolute ? new URL(raw) : new URL(raw, 'http://local.invalid')

    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_URL_PARAMS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[redacted]')
      }
    }

    if (url.hash.length > 1) {
      const hashBody = url.hash.slice(1)
      // Supabase implicit flow puts tokens in the hash as query-like pairs.
      if (hashBody.includes('=')) {
        const hashParams = new URLSearchParams(hashBody)
        let changed = false
        for (const key of [...hashParams.keys()]) {
          if (SENSITIVE_URL_PARAMS.has(key.toLowerCase())) {
            hashParams.set(key, '[redacted]')
            changed = true
          }
        }
        if (changed) {
          url.hash = hashParams.toString()
        }
      }
    }

    if (!absolute) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    return url.toString()
  } catch {
    return raw
  }
}

function redactUrlProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!properties) return properties

  const next: Record<string, unknown> = { ...properties }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== 'string') continue
    const looksLikeUrl =
      URL_PROPERTY_KEYS.has(key) ||
      key.toLowerCase().includes('url') ||
      key.toLowerCase().includes('referrer') ||
      /^https?:\/\//i.test(value) ||
      value.includes('access_token=') ||
      value.includes('refresh_token=')
    if (looksLikeUrl) {
      next[key] = redactUrlString(value)
    }
  }
  return next
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event
  return {
    ...event,
    properties: redactUrlProperties(event.properties as Record<string, unknown>) ?? {},
    $set: redactUrlProperties(event.$set as Record<string, unknown> | undefined),
    $set_once: redactUrlProperties(event.$set_once as Record<string, unknown> | undefined),
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
    disable_session_recording: false,
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
