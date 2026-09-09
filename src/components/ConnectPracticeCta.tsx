'use client'

import { useCallback, useEffect, useState } from 'react'
import posthog from 'posthog-js'
import {
  connectAccept,
  connectActiveForPair,
  connectCancel,
  connectDecline,
  connectDisconnect,
  connectInitiateByPhysician,
  connectPracticeIsEligible,
  type ConnectRelationshipSummary,
} from '@/lib/connect'

/** Match PracticeDetailAuthorized favorite / primary action buttons. */
const btnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 18px',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s',
  border: '1.5px solid #1C4A45',
} as const

/**
 * Physician-side Connect control for practice detail (and future Opportunity CTAs).
 * Hidden when the practice is not Connect-eligible and there is no active relationship.
 * Never explains claiming / verification / eligibility mechanics to physicians.
 */
export default function ConnectPracticeCta({
  practiceId,
  opportunityId = null,
  source = 'practice_detail',
}: {
  practiceId: string
  opportunityId?: string | null
  source?: string
}) {
  const [eligible, setEligible] = useState(false)
  const [active, setActive] = useState<ConnectRelationshipSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [elig, pair] = await Promise.all([
      connectPracticeIsEligible(practiceId),
      connectActiveForPair(practiceId),
    ])
    if (elig.error || pair.error) {
      setEligible(false)
      setActive(null)
      setError('Connect is temporarily unavailable.')
      setLoading(false)
      return
    }
    setEligible(elig.eligible)
    setActive(pair.data)
    setLoading(false)
  }, [practiceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function run(
    action: () => Promise<{ data: ConnectRelationshipSummary | null; error: Error | null }>,
    event: string,
  ) {
    setActing(true)
    setError(null)
    const { data, error: err } = await action()
    if (err) {
      setError(err.message || 'Something went wrong.')
      setActing(false)
      return
    }
    posthog.capture(event, {
      practice_id: practiceId,
      relationship_id: data?.id,
      opportunity_id: opportunityId ?? undefined,
      source,
    })
    setActive(
      data && (data.status === 'pending' || data.status === 'accepted')
        ? data
        : null,
    )
    await refresh()
    setActing(false)
  }

  if (loading) {
    return (
      <span style={{ fontSize: 13, color: '#888', alignSelf: 'center' }}>
        Checking Connect…
      </span>
    )
  }

  // Ineligible practices: hide entirely (no claiming / eligibility copy).
  // Keep rendering when an active relationship exists even if eligibility later drops.
  if (!eligible && !active) {
    if (error) {
      return (
        <p style={{ fontSize: 12, color: '#dc2626', margin: 0, maxWidth: 220 }}>
          {error}
        </p>
      )
    }
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {!active && eligible && (
          <button
            type="button"
            disabled={acting}
            onClick={() =>
              void run(
                () => connectInitiateByPhysician(practiceId, opportunityId),
                'connect_request_sent',
              )
            }
            style={{
              ...btnBase,
              background: '#1C4A45',
              color: 'white',
              opacity: acting ? 0.6 : 1,
              cursor: acting ? 'not-allowed' : 'pointer',
            }}
          >
            Connect
          </button>
        )}

        {active?.status === 'pending' && active.initiator_side === 'physician' && (
          <>
            <span
              style={{
                ...btnBase,
                background: '#f0faf4',
                color: '#1A6B3A',
                borderColor: '#1A6B3A',
                cursor: 'default',
              }}
            >
              Request sent
            </span>
            <button
              type="button"
              disabled={acting}
              onClick={() => void run(() => connectCancel(active.id), 'connect_request_canceled')}
              style={{
                ...btnBase,
                background: '#fff',
                color: '#1C4A45',
                opacity: acting ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
          </>
        )}

        {active?.status === 'pending' && active.initiator_side === 'practice' && (
          <>
            <span
              style={{
                ...btnBase,
                background: '#fff8eb',
                color: '#92400e',
                borderColor: '#f0d9a8',
                cursor: 'default',
              }}
            >
              Respond to request
            </span>
            <button
              type="button"
              disabled={acting}
              onClick={() => void run(() => connectAccept(active.id), 'connect_request_accepted')}
              style={{
                ...btnBase,
                background: '#1C4A45',
                color: 'white',
                opacity: acting ? 0.6 : 1,
              }}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => void run(() => connectDecline(active.id), 'connect_request_declined')}
              style={{
                ...btnBase,
                background: '#fff',
                color: '#1C4A45',
                opacity: acting ? 0.6 : 1,
              }}
            >
              Decline
            </button>
          </>
        )}

        {active?.status === 'accepted' && (
          <>
            <span
              style={{
                ...btnBase,
                background: '#f0faf4',
                color: '#1A6B3A',
                borderColor: '#1A6B3A',
                cursor: 'default',
              }}
            >
              Connected
            </span>
            <button
              type="button"
              disabled={acting}
              onClick={() => void run(() => connectDisconnect(active.id), 'connect_disconnected')}
              style={{
                ...btnBase,
                background: '#fff',
                color: '#1C4A45',
                opacity: acting ? 0.6 : 1,
              }}
            >
              Disconnect
            </button>
          </>
        )}
      </div>
      {error && (
        <p style={{ fontSize: 12, color: '#dc2626', margin: 0, textAlign: 'right', maxWidth: 280 }}>
          {error}
        </p>
      )}
    </div>
  )
}
