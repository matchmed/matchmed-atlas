'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import posthog from 'posthog-js'
import DisconnectConfirmDialog from '@/components/DisconnectConfirmDialog'
import {
  CONNECT_MESSAGE_MAX_LEN,
  connectAccept,
  connectCancel,
  connectDecline,
  connectDisconnect,
  connectListForPhysician,
  connectListMessages,
  connectMarkThreadRead,
  connectSendMessage,
  connectThreadSeenState,
  type ConnectMessage,
  type ConnectRelationshipSummary,
  type ConnectStatus,
  type ConnectThreadSeenState,
} from '@/lib/connect'
import { connectionsAttentionCount } from '@/lib/connect-attention'

type InboxFilter = 'all' | 'unread' | 'pending'

const POLL_MS = 5000

/** Physician inbox: physician-side messages are outgoing. Do not use is_mine; that follows the user, not this app. */
function isPhysicianOutgoing(message: ConnectMessage): boolean {
  return message.sender_side === 'physician'
}

/** Atlas production tokens (tailwind.config + globals.css). */
const TEAL = '#1C4A45'
const TEAL_LIGHT = '#E8F0EF'
const INK = '#141210'
const CHARCOAL = '#1a1a1a'
const MID = '#8A8680'
const MUTED = '#8A8680'
const BORDER = '#DDD8D0'
const HAIRLINE = '#e0ddd8'
const PANEL = '#FFFFFF'
const CANVAS = '#FCFCFC'
const SUCCESS_FG = '#1A6B3A'
const SUCCESS_BG = '#f0faf4'

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

function isTerminal(status: ConnectStatus): boolean {
  return status === 'declined' || status === 'canceled' || status === 'disconnected'
}

function practiceTitle(row: ConnectRelationshipSummary): string {
  return row.display_name || row.practice_name || 'Practice'
}

function practiceLocation(row: ConnectRelationshipSummary): string | null {
  const city = row.practice_city?.trim()
  const state = row.practice_state?.trim()
  if (city && state) return `${city}, ${state}`
  return city || state || null
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function previewText(row: ConnectRelationshipSummary): string {
  const preview = row.last_message_preview?.trim()
  if (preview) return preview
  if (row.status === 'pending') {
    return row.initiator_side === 'physician'
      ? 'Waiting for a response'
      : 'Respond to this request'
  }
  if (row.status === 'accepted') return 'Connected — say hello'
  return statusLabel(row.status)
}

function setThreadParam(threadId: string | null) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (threadId) params.set('thread', threadId)
  else params.delete('thread')
  params.delete('src')
  const next = params.toString()
  window.history.replaceState({}, '', `${window.location.pathname}${next ? `?${next}` : ''}`)
}

export default function ConnectInboxPage() {
  const [rows, setRows] = useState<ConnectRelationshipSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConnectMessage[]>([])
  const [threadMeta, setThreadMeta] = useState<{
    status: ConnectStatus
    origin_clinical_focus: string | null
  } | null>(null)
  const [seenState, setSeenState] = useState<ConnectThreadSeenState | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const openedThreadRef = useRef<string | null>(null)
  const markedReadRef = useRef<Set<string>>(new Set())

  const loadInbox = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const { data, error: err } = await connectListForPhysician()
    if (err) {
      setError(err.message)
      if (!opts?.silent) setRows([])
    } else {
      setError(null)
      setRows(data)
    }
    if (!opts?.silent) setLoading(false)
  }, [])

  const loadThread = useCallback(
    async (relationshipId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setThreadLoading(true)
        setThreadError(null)
      }
      const [msgs, seen] = await Promise.all([
        connectListMessages(relationshipId),
        connectThreadSeenState(relationshipId),
      ])
      if (msgs.error) {
        setThreadError(msgs.error.message)
        if (!opts?.silent) {
          setMessages([])
          setThreadMeta(null)
        }
      } else if (msgs.data) {
        setMessages(msgs.data.messages)
        setThreadMeta({
          status: msgs.data.status,
          origin_clinical_focus: msgs.data.origin_clinical_focus,
        })
        setThreadError(null)
      }
      if (!seen.error && seen.data) setSeenState(seen.data)
      if (!opts?.silent) setThreadLoading(false)
    },
    [],
  )

  useEffect(() => {
    void loadInbox()
  }, [loadInbox])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:connections-attention', {
        detail: { count: connectionsAttentionCount(rows) },
      }),
    )
  }, [rows])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('src') === 'notification_email') {
      posthog.capture('notification_email_clicked', { surface: 'connect' })
    }
    const thread = params.get('thread')
    if (thread) setSelectedId(thread)
    if (params.get('src')) {
      params.delete('src')
      const next = params.toString()
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${next ? `?${next}` : ''}`,
      )
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setThreadMeta(null)
      setSeenState(null)
      setDraft('')
      return
    }
    void loadThread(selectedId)
  }, [selectedId, loadThread])

  useEffect(() => {
    if (!selectedId) return
    if (openedThreadRef.current === selectedId) return
    openedThreadRef.current = selectedId
    posthog.capture('connect_thread_opened', {
      relationship_id: selectedId,
      source: 'physician_inbox',
    })
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    if (markedReadRef.current.has(selectedId)) return
    const row = rows.find((r) => r.id === selectedId)
    // Wait for inbox load so unread state is known before analytics.
    if (loading && !row) return
    markedReadRef.current.add(selectedId)
    const hadUnread = Boolean(row?.has_unread)
    void (async () => {
      const { error: err } = await connectMarkThreadRead(selectedId)
      if (err) {
        markedReadRef.current.delete(selectedId)
        return
      }
      if (hadUnread) {
        posthog.capture('connect_message_read', {
          relationship_id: selectedId,
          source: 'physician_inbox',
        })
      }
      setRows((prev) =>
        prev.map((r) => (r.id === selectedId ? { ...r, has_unread: false } : r)),
      )
    })()
  }, [selectedId, rows, loading])

  useEffect(() => {
    if (!selectedId) return
    const id = window.setInterval(() => {
      void loadThread(selectedId, { silent: true })
      void loadInbox({ silent: true })
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [selectedId, loadThread, loadInbox])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, selectedId])

  const filteredRows = useMemo(() => {
    if (filter === 'unread') return rows.filter((r) => r.has_unread)
    if (filter === 'pending') return rows.filter((r) => r.status === 'pending')
    return rows
  }, [rows, filter])

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const activeStatus = threadMeta?.status ?? selected?.status
  const originFocus =
    threadMeta?.origin_clinical_focus ?? selected?.origin_clinical_focus ?? null

  function selectThread(id: string) {
    setSelectedId(id)
    setThreadParam(id)
  }

  function clearThread() {
    setSelectedId(null)
    setThreadParam(null)
    openedThreadRef.current = null
  }

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
      markedReadRef.current.delete(id)
      await loadInbox({ silent: true })
      if (selectedId === id) await loadThread(id, { silent: true })
    }
    setActingId(null)
  }

  async function sendMessage() {
    if (!selectedId || sending) return
    const body = draft.trim()
    if (!body) return
    if (body.length > CONNECT_MESSAGE_MAX_LEN) {
      setThreadError(`Messages must be ${CONNECT_MESSAGE_MAX_LEN} characters or fewer.`)
      return
    }
    setSending(true)
    setThreadError(null)
    const { data, error: err } = await connectSendMessage(selectedId, body)
    if (err) {
      setThreadError(err.message)
      setSending(false)
      return
    }
    posthog.capture('connect_message_sent', {
      relationship_id: selectedId,
      source: 'physician_inbox',
    })
    setDraft('')
    if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev
        return [
          ...prev,
          {
            ...data,
            is_mine: data.sender_side === 'physician',
          },
        ]
      })
      setSeenState({ state: 'sent', latest_message_id: data.id })
    }
    await Promise.all([
      loadThread(selectedId, { silent: true }),
      loadInbox({ silent: true }),
    ])
    setSending(false)
  }

  const showInbox = !isMobile || !selectedId
  const showThread = !isMobile || Boolean(selectedId)
  const busy = actingId === selectedId

  return (
    <div
      style={{
        maxWidth: 1200,
        width: '100%',
        margin: '0 auto',
        padding: isMobile ? '12px 10px 32px' : '24px 20px 40px',
        height: isMobile ? 'auto' : 'calc(100vh - 72px)',
        minHeight: isMobile ? '70vh' : undefined,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 0,
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: '100%',
          maxWidth: '100%',
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: isMobile ? 10 : 12,
          overflow: 'hidden',
          boxShadow: 'none',
        }}
      >
        {/* Inbox pane */}
        {showInbox && (
          <aside
            style={{
              width: isMobile ? '100%' : 340,
              flexShrink: 0,
              borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
              display: 'flex',
              flexDirection: 'column',
              minHeight: isMobile ? 480 : 0,
              background: CANVAS,
            }}
          >
            <div style={{ padding: '20px 18px 14px', borderBottom: `1px solid ${HAIRLINE}` }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: CHARCOAL,
                  margin: '0 0 4px',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                Connections
              </h1>
              <p style={{ fontSize: 13, color: MID, margin: 0, lineHeight: 1.4 }}>
                Messages with practices you’re connected to.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 14,
                }}
              >
                {([
                  ['all', 'All'],
                  ['unread', 'Unread'],
                  ['pending', 'Pending'],
                ] as const).map(([key, label]) => {
                  const active = filter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        border: `1px solid ${active ? TEAL : BORDER}`,
                        background: active ? TEAL_LIGHT : PANEL,
                        color: active ? TEAL : MID,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading && (
                <div style={{ textAlign: 'center', padding: 32, color: MID, fontSize: 13 }}>
                  Loading…
                </div>
              )}

              {error && !loading && (
                <div
                  style={{
                    margin: 12,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#dc2626',
                  }}
                >
                  {error}
                </div>
              )}

              {!loading && rows.length === 0 && (
                <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: CHARCOAL, marginBottom: 8 }}>
                    No connections yet
                  </div>
                  <p style={{ fontSize: 13, color: MUTED, margin: '0 0 8px', lineHeight: 1.5 }}>
                    Connect with practices you’re interested in from their Atlas profile.
                  </p>
                  <p style={{ fontSize: 12, color: MID, margin: 0, lineHeight: 1.5 }}>
                    Your identity stays private until both sides accept.
                  </p>
                  <Link
                    href="/practices"
                    style={{
                      display: 'inline-block',
                      marginTop: 16,
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEAL,
                      textDecoration: 'none',
                    }}
                  >
                    Browse practices →
                  </Link>
                </div>
              )}

              {!loading && rows.length > 0 && filteredRows.length === 0 && (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  {filter === 'unread'
                    ? 'No unread conversations.'
                    : filter === 'pending'
                      ? 'No pending requests.'
                      : 'No conversations.'}
                </div>
              )}

              {!loading &&
                filteredRows.map((row) => {
                  const active = row.id === selectedId
                  const location = practiceLocation(row)
                  const terminal = isTerminal(row.status)
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => selectThread(row.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '14px 16px',
                        border: 'none',
                        borderBottom: `1px solid ${BORDER}`,
                        background: active ? TEAL_LIGHT : PANEL,
                        cursor: 'pointer',
                        opacity: terminal ? 0.78 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: 2,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: row.has_unread ? 700 : 600,
                                color: INK,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {practiceTitle(row)}
                            </span>
                            {row.has_unread && (
                              <span
                                aria-label="Unread"
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 99,
                                  background: TEAL,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </div>
                          {location && (
                            <div style={{ fontSize: 12, color: MID, marginBottom: 4 }}>
                              {location}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: 13,
                              color: row.has_unread ? CHARCOAL : MID,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontWeight: row.has_unread ? 500 : 400,
                            }}
                          >
                            {previewText(row)}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ fontSize: 11, color: MID }}>
                            {formatRelativeTime(row.last_message_at || row.updated_at || row.created_at)}
                          </span>
                          <StatusBadge status={row.status} compact />
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>
          </aside>
        )}

        {/* Thread pane */}
        {showThread && (
          <section
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              background: PANEL,
              minHeight: isMobile ? 520 : 0,
            }}
          >
            {!selectedId && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 32,
                  textAlign: 'center',
                }}
              >
                <div>
                  {rows.length === 0 ? (
                    <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.5, maxWidth: 280 }}>
                      Your conversations will appear here.
                    </p>
                  ) : (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 600, color: CHARCOAL, marginBottom: 8 }}>
                        Select a conversation
                      </div>
                      <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5, maxWidth: 320 }}>
                        Choose a connection on the left to view messages and respond.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {selectedId && selected && (
              <>
                <header
                  style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${BORDER}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      {isMobile && (
                        <button
                          type="button"
                          onClick={clearThread}
                          style={{
                            fontSize: 13,
                            color: TEAL,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            marginBottom: 8,
                          }}
                        >
                          ← Connections
                        </button>
                      )}
                      <Link
                        href={`/practices/${selected.practice_id}`}
                        className="font-serif"
                        style={{
                          display: 'block',
                          fontSize: isMobile ? 20 : 22,
                          fontWeight: 700,
                          color: CHARCOAL,
                          textDecoration: 'none',
                          letterSpacing: '-0.02em',
                          lineHeight: 1.2,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {practiceTitle(selected)}
                      </Link>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 6,
                        }}
                      >
                        {practiceLocation(selected) && (
                          <span style={{ fontSize: 13, color: MID }}>
                            {practiceLocation(selected)}
                          </span>
                        )}
                        {activeStatus && <StatusBadge status={activeStatus} />}
                      </div>
                      {originFocus && (
                        <div style={{ fontSize: 12, color: MID, marginTop: 6 }}>
                          Connected via {originFocus}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
                      {activeStatus === 'pending' && selected.initiator_side === 'physician' && (
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void act(
                              selected.id,
                              () => connectCancel(selected.id),
                              'connect_request_canceled',
                            )
                          }
                        >
                          Cancel
                        </ActionButton>
                      )}
                      {activeStatus === 'accepted' && (
                        <MoreMenu
                          disabled={busy}
                          onDisconnect={() => setDisconnectOpen(true)}
                        />
                      )}
                    </div>
                  </div>
                </header>

                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 16px 8px',
                    background: CANVAS,
                  }}
                >
                  {threadLoading && (
                    <div style={{ textAlign: 'center', padding: 24, color: MID, fontSize: 13 }}>
                      Loading messages…
                    </div>
                  )}

                  {threadError && (
                    <div
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        padding: '10px 12px',
                        marginBottom: 12,
                        fontSize: 13,
                        color: '#dc2626',
                      }}
                    >
                      {threadError}
                    </div>
                  )}

                  {!threadLoading &&
                    activeStatus === 'pending' &&
                    selected.initiator_side === 'practice' && (
                      <p
                        style={{
                          fontSize: 13,
                          color: MID,
                          margin: '0 0 12px',
                          lineHeight: 1.4,
                        }}
                      >
                        {practiceTitle(selected)} wants to connect.
                      </p>
                    )}

                  {!threadLoading &&
                    messages.length === 0 &&
                    !(activeStatus === 'pending' && selected.initiator_side === 'practice') && (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '40px 16px',
                        color: MUTED,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {activeStatus === 'pending'
                        ? 'Your request is pending. An intro note will appear here if you sent one.'
                        : activeStatus && isTerminal(activeStatus)
                          ? 'No messages in this closed connection.'
                          : 'No messages yet. Say hello when you’re ready.'}
                    </div>
                  )}

                  {messages.map((msg, idx) => {
                    const outgoing = isPhysicianOutgoing(msg)
                    const isLatestOwn =
                      outgoing &&
                      seenState &&
                      seenState.state !== 'none' &&
                      seenState.latest_message_id === msg.id &&
                      idx === messages.length - 1
                    return (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        receipt={
                          isLatestOwn
                            ? seenState.state === 'seen'
                              ? 'Seen'
                              : 'Sent'
                            : null
                        }
                      />
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <footer style={{ borderTop: `1px solid ${BORDER}`, background: PANEL }}>
                  {activeStatus === 'pending' && selected.initiator_side === 'practice' && (
                    <div
                      style={{
                        padding: '14px 16px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 10,
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <ActionButton
                          disabled={busy}
                          primary
                          onClick={() =>
                            void act(
                              selected.id,
                              () => connectAccept(selected.id),
                              'connect_request_accepted',
                            )
                          }
                        >
                          Accept
                        </ActionButton>
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void act(
                              selected.id,
                              () => connectDecline(selected.id),
                              'connect_request_declined',
                            )
                          }
                        >
                          Decline
                        </ActionButton>
                      </div>
                    </div>
                  )}

                  {activeStatus === 'pending' && selected.initiator_side === 'physician' && (
                    <div style={{ padding: '14px 16px' }}>
                      <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.45 }}>
                        Waiting for the practice to respond. Messaging unlocks once both sides accept.
                      </p>
                    </div>
                  )}

                  {activeStatus && isTerminal(activeStatus) && (
                    <div style={{ padding: '14px 16px' }}>
                      <p
                        style={{
                          fontSize: 13,
                          color: MUTED,
                          margin: 0,
                          lineHeight: 1.45,
                          padding: '10px 12px',
                          background: '#f3f4f6',
                          borderRadius: 8,
                          border: `1px solid ${BORDER}`,
                        }}
                      >
                        This connection is {statusLabel(activeStatus).toLowerCase()}. Messaging is
                        locked. You can start a new connection from the practice profile later.
                      </p>
                    </div>
                  )}

                  {activeStatus === 'accepted' && (
                    <Composer
                      value={draft}
                      onChange={setDraft}
                      onSend={() => void sendMessage()}
                      disabled={sending}
                    />
                  )}
                </footer>
              </>
            )}

            {selectedId && !selected && !loading && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 32,
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: CHARCOAL, marginBottom: 8 }}>
                    Conversation not found
                  </div>
                  <p style={{ fontSize: 13, color: MUTED, margin: '0 0 12px' }}>
                    This thread may have been removed or is unavailable.
                  </p>
                  {isMobile && (
                    <button
                      type="button"
                      onClick={clearThread}
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: TEAL,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      ← Back to Connections
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
      <DisconnectConfirmDialog
        open={disconnectOpen && Boolean(selected)}
        subject={selected ? practiceTitle(selected) : 'this practice'}
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={async () => {
          if (!selected) return
          const { error: err } = await connectDisconnect(selected.id)
          if (err) throw err
          posthog.capture('connect_disconnected', {
            relationship_id: selected.id,
            source: 'physician_inbox',
          })
          markedReadRef.current.delete(selected.id)
          setDisconnectOpen(false)
          await loadInbox({ silent: true })
          if (selectedId === selected.id) await loadThread(selected.id, { silent: true })
        }}
      />
    </div>
  )
}

function StatusBadge({
  status,
  compact,
}: {
  status: ConnectStatus
  compact?: boolean
}) {
  const terminal = isTerminal(status)
  const colors =
    status === 'accepted'
      ? { bg: SUCCESS_BG, fg: SUCCESS_FG, border: '#c5dfd0' }
      : status === 'pending'
        ? { bg: TEAL_LIGHT, fg: TEAL, border: '#c5d6d3' }
        : { bg: CANVAS, fg: MID, border: BORDER }

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: 6,
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
        letterSpacing: terminal ? '0.01em' : undefined,
        textTransform: terminal ? 'none' : undefined,
        whiteSpace: 'nowrap',
      }}
      title={terminal ? 'Closed connection' : undefined}
    >
      {statusLabel(status)}
    </span>
  )
}

function MessageBubble({
  message,
  receipt,
}: {
  message: ConnectMessage
  receipt: 'Sent' | 'Seen' | null
}) {
  const mine = isPhysicianOutgoing(message)
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        marginBottom: 10,
      }}
    >
      <div style={{ maxWidth: 'min(78%, 100%)', minWidth: 0 }}>
        {message.is_intro && (
          <div
            style={{
              fontSize: 11,
              color: MID,
              marginBottom: 4,
              textAlign: mine ? 'right' : 'left',
            }}
          >
            Intro note
          </div>
        )}
        <div
          style={{
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
            background: mine ? TEAL : PANEL,
            color: mine ? '#fff' : CHARCOAL,
            border: mine ? 'none' : `1px solid ${BORDER}`,
            fontSize: 14,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {message.body}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: mine ? 'flex-end' : 'flex-start',
            gap: 8,
            marginTop: 4,
            fontSize: 11,
            color: MID,
          }}
        >
          <span>{formatMessageTime(message.created_at)}</span>
          {receipt && <span style={{ fontWeight: 600, color: MUTED }}>{receipt}</span>}
        </div>
      </div>
    </div>
  )
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
}) {
  const tooLong = value.length > CONNECT_MESSAGE_MAX_LEN
  const canSend = Boolean(value.trim()) && !disabled && !tooLong

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a message…"
        rows={3}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (canSend) onSend()
          }
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          minHeight: 72,
          maxHeight: 180,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${tooLong ? '#fecaca' : BORDER}`,
          fontSize: 14,
          lineHeight: 1.45,
          color: INK,
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
          outline: 'none',
          background: PANEL,
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          gap: 12,
        }}
      >
        <span style={{ fontSize: 11, color: tooLong ? '#dc2626' : MID }}>
          {value.length}/{CONNECT_MESSAGE_MAX_LEN}
          <span style={{ marginLeft: 8 }}>Enter to send · Shift+Enter for newline</span>
        </span>
        <ActionButton primary disabled={!canSend} onClick={onSend}>
          {disabled ? 'Sending…' : 'Send'}
        </ActionButton>
      </div>
    </div>
  )
}

function MoreMenu({
  onDisconnect,
  disabled,
}: {
  onDisconnect: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="More"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          background: PANEL,
          color: MID,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 18,
          lineHeight: 1,
          letterSpacing: 1,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        •••
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 140,
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(20,18,16,0.08)',
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              setOpen(false)
              onDisconnect()
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              border: 'none',
              background: 'transparent',
              color: CHARCOAL,
              fontSize: 13,
              fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Disconnect
          </button>
        </div>
      )}
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
        border: `1.5px solid ${TEAL}`,
        background: primary ? TEAL : PANEL,
        color: primary ? '#fff' : TEAL,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}
