'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createConfirmGate } from '@/lib/disconnect-confirm'

const COPY =
  'You will no longer be able to send messages in this conversation. The conversation history will remain available to both sides. You can reconnect later, which will create a new conversation.'

export default function DisconnectConfirmDialog({
  open,
  subject,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean
  subject: string
  error?: string | null
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const titleId = useId()
  const bodyId = useId()
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const gate = useRef(createConfirmGate())
  const pendingRef = useRef(false)
  const onCancelRef = useRef(onCancel)
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    pendingRef.current = false
    setPending(false)
    setLocalError(null)
    gate.current.finish()
    cancelRef.current?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!pendingRef.current) onCancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const first = closeRef.current
      const last = confirmRef.current
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open])

  if (!open) return null

  const shownError = localError || error

  async function confirm() {
    if (!gate.current.tryBegin()) return
    pendingRef.current = true
    setPending(true)
    setLocalError(null)
    try {
      await onConfirm()
    } catch (err) {
      setLocalError(err instanceof Error && err.message ? err.message : 'Could not disconnect. Please try again.')
      gate.current.finish()
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(20, 18, 16, 0.45)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={{
          width: 'min(100%, 420px)',
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          background: '#fff',
          border: '1px solid #DDD8D0',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 12px 40px rgba(20,18,16,0.16)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2
            id={titleId}
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans), Inter, system-ui, sans-serif',
              fontSize: 18,
              fontWeight: 650,
              lineHeight: 1.3,
              color: '#1a1a1a',
              overflowWrap: 'anywhere',
            }}
          >
            Disconnect from {subject}?
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            disabled={pending}
            onClick={onCancel}
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #DDD8D0',
              background: '#fff',
              color: '#8A8680',
              cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
            ×
          </button>
        </div>
        <p id={bodyId} style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5, color: '#5C5852', overflowWrap: 'anywhere' }}>
          {COPY}
        </p>
        {shownError && (
          <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: '#9B1C1C', overflowWrap: 'anywhere' }}>
            {shownError}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1.5px solid #DDD8D0',
              background: '#fff',
              color: '#1a1a1a',
              fontSize: 14,
              fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={pending}
            onClick={() => void confirm()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1.5px solid #9B1C1C',
              background: '#fff',
              color: '#9B1C1C',
              fontSize: 14,
              fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>
    </div>
  )
}
