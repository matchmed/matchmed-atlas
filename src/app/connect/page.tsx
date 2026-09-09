'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

function practiceTitle(row: ConnectRelationshipSummary): string {
  return row.display_name || row.practice_name || 'Practice'
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

  const requests = useMemo(
    () =>
      rows.filter((r) => r.status === 'pending' && r.initiator_side === 'practice'),
    [rows],
  )
  const sent = useMemo(
    () =>
      rows.filter((r) => r.status === 'pending' && r.initiator_side === 'physician'),
    [rows],
  )
  const connected = useMemo(
    () => rows.filter((r) => r.status === 'accepted'),
    [rows],
  )
  const past = useMemo(
    () =>
      rows.filter((r) =>
        r.status === 'declined' ||
        r.status === 'canceled' ||
        r.status === 'disconnected',
      ),
    [rows],
  )

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

  const hasAny = rows.length > 0

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
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 8px', lineHeight: 1.5 }}>
        Your connection requests and mutual connections with practices.
      </p>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 24px', lineHeight: 1.5 }}>
        Your identity stays private from a practice until both sides accept.
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

      {!loading && !hasAny && (
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #DDD8D0',
            borderRadius: 12,
            padding: '32px 28px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 }}>
            No connections yet
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>
            Connect with practices you’re interested in from their Atlas profile.
          </p>
          <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.5 }}>
            Your identity stays private from a practice until both sides accept.
          </p>
          <Link
            href="/practices"
            style={{
              display: 'inline-block',
              marginTop: 18,
              fontSize: 13,
              fontWeight: 600,
              color: '#1C4A45',
              textDecoration: 'none',
            }}
          >
            Browse practices →
          </Link>
        </div>
      )}

      {!loading && hasAny && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <InboxSection
            title="Requests"
            emptyHint="No incoming requests."
            rows={requests}
            actingId={actingId}
            onAct={act}
          />
          <InboxSection
            title="Sent"
            emptyHint="No outgoing requests."
            rows={sent}
            actingId={actingId}
            onAct={act}
          />
          <InboxSection
            title="Connected"
            emptyHint="No connections yet."
            rows={connected}
            actingId={actingId}
            onAct={act}
          />
          {past.length > 0 && (
            <InboxSection
              title="Past"
              emptyHint=""
              rows={past}
              actingId={actingId}
              onAct={act}
              muted
            />
          )}
        </div>
      )}
    </div>
  )
}

function InboxSection({
  title,
  emptyHint,
  rows,
  actingId,
  onAct,
  muted,
}: {
  title: string
  emptyHint: string
  rows: ConnectRelationshipSummary[]
  actingId: string | null
  onAct: (
    id: string,
    fn: () => Promise<{ error: Error | null }>,
    event: string,
  ) => void
  muted?: boolean
}) {
  return (
    <section>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: muted ? '#888' : '#374151',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          margin: '0 0 10px',
        }}
      >
        {title}
        <span style={{ fontWeight: 500, color: '#aaa', marginLeft: 8 }}>
          {rows.length}
        </span>
      </h2>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>{emptyHint}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((row) => {
            const titleText = practiceTitle(row)
            const busy = actingId === row.id
            return (
              <div
                key={row.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #DDD8D0',
                  borderRadius: 12,
                  padding: '16px 18px',
                  boxShadow: muted ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
                  opacity: muted ? 0.85 : 1,
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
                      {titleText}
                    </Link>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      {statusLabel(row.status)}
                      {row.status === 'pending' &&
                        (row.initiator_side === 'physician'
                          ? ' · You sent this request'
                          : ' · Practice sent this request')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {row.status === 'pending' && row.initiator_side === 'practice' && (
                      <>
                        <ActionButton
                          disabled={busy}
                          primary
                          onClick={() =>
                            void onAct(
                              row.id,
                              () => connectAccept(row.id),
                              'connect_request_accepted',
                            )
                          }
                        >
                          Accept
                        </ActionButton>
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void onAct(
                              row.id,
                              () => connectDecline(row.id),
                              'connect_request_declined',
                            )
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
                          void onAct(
                            row.id,
                            () => connectCancel(row.id),
                            'connect_request_canceled',
                          )
                        }
                      >
                        Cancel
                      </ActionButton>
                    )}
                    {row.status === 'accepted' && (
                      <ActionButton
                        disabled={busy}
                        onClick={() =>
                          void onAct(
                            row.id,
                            () => connectDisconnect(row.id),
                            'connect_disconnected',
                          )
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
      )}
    </section>
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
