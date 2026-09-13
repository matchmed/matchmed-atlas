'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import posthog from 'posthog-js'
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type PhysicianNotification,
} from '@/lib/notifications'
import { safeNextPath } from '@/lib/safe-next-path'

function formatWhen(iso: string): string {
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

export default function NotificationsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<PhysicianNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: err } = await listMyNotifications(50)
      if (cancelled) return
      if (err) {
        setError(err.message)
        setRows([])
      } else {
        setRows(data)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('src') !== 'notification_email') return
    posthog.capture('notification_email_clicked', { surface: 'notifications' })
    params.delete('src')
    const next = params.toString()
    const cleaned = `${window.location.pathname}${next ? `?${next}` : ''}`
    window.history.replaceState({}, '', cleaned)
  }, [])

  async function openNotification(row: PhysicianNotification) {
    if (!row.read_at) {
      await markNotificationRead(row.id)
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, read_at: r.read_at ?? new Date().toISOString() } : r,
        ),
      )
    }
    posthog.capture('notification_opened', {
      notification_type: row.notification_type,
      destination_type: row.destination_type,
    })
    const dest = safeNextPath(row.deep_link) || '/notifications'
    router.push(dest)
  }

  async function handleMarkAll() {
    setMarkingAll(true)
    const { error: err } = await markAllNotificationsRead()
    if (!err) {
      setRows((prev) =>
        prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })),
      )
    }
    setMarkingAll(false)
  }

  const unread = rows.filter((r) => !r.read_at).length

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 0 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="font-serif" style={{ fontSize: 24, fontWeight: 700, color: '#141210', margin: 0 }}>
            Notifications
          </h1>
          <p style={{ fontSize: 13, color: '#8A8680', marginTop: 6 }}>
            Preference-matched opportunities, regional growth, and Connect updates.
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkAll()}
            disabled={markingAll}
            style={{
              border: '1px solid #DDD8D0',
              background: '#fff',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              cursor: 'pointer',
              color: '#1C4A45',
              flexShrink: 0,
            }}
          >
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 14, color: '#8A8680', padding: '24px 0' }}>Loading notifications…</div>
      )}
      {!loading && error && (
        <div style={{ fontSize: 14, color: '#9B1C1C', padding: '16px 0' }}>{error}</div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ fontSize: 14, color: '#8A8680', padding: '24px 0' }}>
          No notifications yet.{' '}
          <Link href="/account" style={{ color: '#1C4A45' }}>
            Review email preferences
          </Link>
          .
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => {
          const unreadRow = !row.read_at
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => void openNotification(row)}
              style={{
                textAlign: 'left',
                border: '1px solid #DDD8D0',
                borderRadius: 12,
                padding: '14px 16px',
                background: unreadRow ? '#F4F7F6' : '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: unreadRow ? 700 : 600, color: '#141210' }}>
                  {row.title}
                </div>
                <div style={{ fontSize: 12, color: '#8A8680', flexShrink: 0 }}>{formatWhen(row.created_at)}</div>
              </div>
              <div style={{ fontSize: 13, color: '#5C5852', lineHeight: 1.45 }}>{row.body}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
