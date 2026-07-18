'use client'

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase'

type FieldFlagged = 'practice_name' | 'address' | 'phone' | 'website' | 'other'

interface PracticeSnapshot {
  practice_name: string | null
  city_st: string | null
  phone: string | null
  website: string | null
}

interface PracticeErrorReportModalProps {
  practiceId: string
  snapshot: PracticeSnapshot
}

const FIELD_OPTIONS: { value: FieldFlagged; label: string }[] = [
  { value: 'practice_name', label: 'Practice name' },
  { value: 'address', label: 'Address / location' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

export default function PracticeErrorReportModal({
  practiceId,
  snapshot,
}: PracticeErrorReportModalProps) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [fieldFlagged, setFieldFlagged] = useState<FieldFlagged | ''>('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      if (submitted) {
        setFieldFlagged('')
        setDescription('')
        setError('')
        setSubmitted(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, submitted])

  function resetAfterSuccess() {
    setFieldFlagged('')
    setDescription('')
    setError('')
    setSubmitted(false)
  }

  function handleClose() {
    setOpen(false)
    if (submitted) resetAfterSuccess()
  }

  async function handleSubmit() {
    if (submitting) return

    const trimmedDescription = description.trim()
    if (!fieldFlagged) {
      setError('Select the data field that needs review.')
      return
    }
    if (!trimmedDescription) {
      setError('Describe the issue before submitting.')
      return
    }
    setSubmitting(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSubmitting(false)
      setError('Your Atlas profile could not be found. Refresh the page and try again.')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile) {
      setSubmitting(false)
      setError('Your Atlas profile could not be found. Refresh the page and try again.')
      return
    }

    const { error: insertError } = await supabase
      .from('practice_error_reports')
      .insert({
        practice_id: practiceId,
        reported_by: profile.id,
        field_flagged: fieldFlagged,
        description: trimmedDescription,
        snapshot,
      })

    setSubmitting(false)
    if (insertError) {
      setError('We could not submit your report. Please try again.')
      return
    }

    setSubmitted(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          border: 'none',
          background: 'none',
          color: '#888',
          cursor: 'pointer',
          fontSize: 12,
          padding: 0,
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        Report an issue with this data
      </button>

      {open && (
        <div
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) handleClose()
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(20, 18, 16, 0.45)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="bg-canvas"
            style={{
              width: '100%',
              maxWidth: 480,
              border: '1px solid #e0ddd8',
              borderRadius: 14,
              padding: 24,
              boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: submitted ? 12 : 20 }}>
              <div>
                <h2 id={titleId} className="font-serif" style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.2, margin: 0 }}>
                  {submitted ? 'Thanks — we review every report' : 'Report a data issue'}
                </h2>
                {!submitted && (
                  <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, margin: '6px 0 0' }}>
                    Tell us about an issue with the practice information shown on Atlas.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close report dialog"
                style={{ border: 'none', background: 'none', color: '#888', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>

            {submitted ? (
              <>
                <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, margin: '0 0 20px' }}>
                  Your report has been sent to the Atlas team for review.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{ padding: '10px 18px', border: 'none', borderRadius: 8, background: '#1C4A45', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor={`${titleId}-field`} style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                    Data field
                  </label>
                  <select
                    id={`${titleId}-field`}
                    value={fieldFlagged}
                    onChange={event => setFieldFlagged(event.target.value as FieldFlagged | '')}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d8d5d0', borderRadius: 8, background: 'white', color: '#333', fontSize: 14 }}
                  >
                    <option value="">Select a field...</option>
                    {FIELD_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <label htmlFor={`${titleId}-description`} style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                      What needs correcting?
                    </label>
                    <span style={{ fontSize: 11, color: '#999' }}>{description.length}/1000</span>
                  </div>
                  <textarea
                    id={`${titleId}-description`}
                    required
                    maxLength={1000}
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    rows={6}
                    placeholder="Describe the current information and what you believe should be corrected."
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d8d5d0', borderRadius: 8, background: 'white', color: '#333', fontSize: 14, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                {error && (
                  <div style={{ marginBottom: 16, padding: '10px 12px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12, lineHeight: 1.5 }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{ padding: '10px 16px', border: '1px solid #d8d5d0', borderRadius: 8, background: 'white', color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{ padding: '10px 18px', border: 'none', borderRadius: 8, background: submitting ? '#8ab4ae' : '#1C4A45', color: 'white', fontSize: 13, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}
                  >
                    {submitting ? 'Submitting...' : 'Submit report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
