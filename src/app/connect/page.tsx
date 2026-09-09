'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import posthog from 'posthog-js'
import {
  connectAccept,
  connectCancel,
  connectDecline,
  connectDisconnect,
  connectListForPhysician,
  type ConnectRelationshipSummary,
  type ConnectStatus,
} from '@/lib/connect'

function statusLabel(status: ConnectStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'accepted':
      return 'Connected'
    case 'declined':
      return 'Declined'
    case 'canceled':
      return 'Canceled'
    case 'disconnected':
      return 'Disconnected'
    default:
      return status
  }
}

export default function ConnectInboxPage() {
  const router = useRouter()
  const [rows, setRows] = useState<ConnectRelationshipSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await connectListForPhysician()
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(
    id: string,
    fn: () => Promise<{ error: Error | null }>,
    event: string,
  ) {
    setActingId(id)
    const { error: err } = await fn()
    if (err) {
      setError(err.message)
    } else {
      posthog.capture(event, { relationship_id: id, source: 'physician_inbox' })
      await load()
    }
    setActingId(null)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 48px' }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          fontSize: 13,
          color: '#1C4A45',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 16,
        }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
        Connect
      </h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
        Mutual connections with practices. Your profile stays private until both sides accept.
      </p>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 13 }}>
          Loading…
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #DDD8D0',
            borderRadius: 12,
            padding: 28,
            textAlign: 'center',
            color: '#6b7280',
            fontSize: 14,
          }}
        >
          No Connect requests yet. Open a claimed practice to start a connection.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((row) => {
          const title = row.display_name || row.practice_name || 'Practice'
          const busy = actingId === row.id
          return (
            <div
              key={row.id}
              style={{
                background: '#FFFFFF',
                border: '1px solid #DDD8D0',
                borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <Link
                    href={`/practices/${row.practice_id}`}
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#1a1a1a',
                      textDecoration: 'none',
                    }}
                  >
                    {title}
                  </Link>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {statusLabel(row.status)}
                    {row.initiator_side === 'physician'
                      ? ' · You initiated'
                      : ' · Practice initiated'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {row.status === 'pending' && row.initiator_side === 'practice' && (
                    <>
                      <ActionButton
                        disabled={busy}
                        primary
                        onClick={() =>
                          void act(row.id, () => connectAccept(row.id), 'connect_request_accepted')
                        }
                      >
                        Accept
                      </ActionButton>
                      <ActionButton
                        disabled={busy}
                        onClick={() =>
                          void act(row.id, () => connectDecline(row.id), 'connect_request_declined')
                        }
                      >
                        Decline
                      </ActionButton>
                    </>
                  )}
                  {row.status === 'pending' && row.initiator_side === 'physician' && (
                    <ActionButton
                      disabled={busy}
                      onClick={() =>
                        void act(row.id, () => connectCancel(row.id), 'connect_request_canceled')
                      }
                    >
                      Cancel
                    </ActionButton>
                  )}
                  {row.status === 'accepted' && (
                    <ActionButton
                      disabled={busy}
                      onClick={() =>
                        void act(row.id, () => connectDisconnect(row.id), 'connect_disconnected')
                      }
                    >
                      Disconnect
                    </ActionButton>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        border: `1.5px solid #1C4A45`,
        background: primary ? '#1C4A45' : '#fff',
        color: primary ? '#fff' : '#1C4A45',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}
