'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export type ReportStatus = 'new' | 'reviewing' | 'fixed' | 'rejected'
export type ReportField = 'practice_name' | 'address' | 'phone' | 'website' | 'other'

interface PracticeValues {
  id: string
  practice_name: string | null
  city_st: string | null
  phone: string | null
  website: string | null
}

interface Reporter {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface Snapshot {
  practice_name?: string | null
  city_st?: string | null
  phone?: string | null
  website?: string | null
}

export interface ReportRow {
  id: string
  practice_id: string
  reported_by: string
  field_flagged: ReportField
  description: string
  snapshot: Snapshot | null
  status: ReportStatus
  admin_notes: string | null
  resolved_at: string | null
  created_at: string
  practice: PracticeValues | null
  reporter: Reporter | null
}

const STATUS_OPTIONS: ReportStatus[] = ['new', 'reviewing', 'fixed', 'rejected']
const FIELD_OPTIONS: { value: ReportField; label: string }[] = [
  { value: 'practice_name', label: 'Practice name' },
  { value: 'address', label: 'Address / location' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]
const COMPARISON_FIELDS: { key: keyof Snapshot; label: string }[] = [
  { key: 'practice_name', label: 'Practice name' },
  { key: 'city_st', label: 'Address / location' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
]

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function displayValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : 'Not available'
}

function reporterLabel(reporter: Reporter | null, profileId: string) {
  if (!reporter) return profileId
  const name = [reporter.first_name, reporter.last_name].filter(Boolean).join(' ').trim()
  return name || reporter.email || reporter.id
}

function fieldLabel(field: ReportField) {
  return FIELD_OPTIONS.find(option => option.value === field)?.label ?? field
}

function statusColors(status: ReportStatus) {
  if (status === 'fixed') return { color: '#1A6B3A', background: '#d4edda' }
  if (status === 'rejected') return { color: '#888', background: '#f0f0f0' }
  if (status === 'reviewing') return { color: '#7B3F00', background: '#fff3e6' }
  return { color: '#1C4A45', background: '#E8F0EF' }
}

export default function ReportsInboxClient({ initialReports }: { initialReports: ReportRow[] }) {
  const router = useRouter()
  const [reports, setReports] = useState(initialReports)
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all')
  const [fieldFilter, setFieldFilter] = useState<'all' | ReportField>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusDrafts, setStatusDrafts] = useState<Record<string, ReportStatus>>(
    Object.fromEntries(initialReports.map(report => [report.id, report.status]))
  )
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>(
    Object.fromEntries(initialReports.map(report => [report.id, report.admin_notes ?? '']))
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})

  const filteredReports = useMemo(() => reports.filter(report => (
    (statusFilter === 'all' || report.status === statusFilter)
    && (fieldFilter === 'all' || report.field_flagged === fieldFilter)
  )), [reports, statusFilter, fieldFilter])

  async function saveReport(report: ReportRow) {
    if (savingId) return

    const nextStatus = statusDrafts[report.id] ?? report.status
    const nextNotes = notesDrafts[report.id]?.trim() || null
    const statusChanged = nextStatus !== report.status
    const resolvedAt = statusChanged
      ? (nextStatus === 'fixed' || nextStatus === 'rejected' ? new Date().toISOString() : null)
      : report.resolved_at

    const update: {
      status: ReportStatus
      admin_notes: string | null
      resolved_at?: string | null
    } = {
      status: nextStatus,
      admin_notes: nextNotes,
    }
    if (statusChanged) update.resolved_at = resolvedAt

    setSavingId(report.id)
    setSaveErrors(previous => ({ ...previous, [report.id]: '' }))

    const supabase = createClient()
    const { error } = await supabase
      .from('practice_error_reports')
      .update(update)
      .eq('id', report.id)

    setSavingId(null)
    if (error) {
      setSaveErrors(previous => ({ ...previous, [report.id]: 'Could not save this report. Try again.' }))
      return
    }

    setReports(previous => previous.map(item => item.id === report.id ? {
      ...item,
      status: nextStatus,
      admin_notes: nextNotes,
      resolved_at: resolvedAt,
    } : item))
    router.refresh()
  }

  const cellStyle = {
    padding: '11px 12px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'top' as const,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#666' }}>
          Status{' '}
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as 'all' | ReportStatus)}
            style={{ marginLeft: 4, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'white', color: '#444', fontSize: 12 }}
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#666' }}>
          Field{' '}
          <select
            value={fieldFilter}
            onChange={event => setFieldFilter(event.target.value as 'all' | ReportField)}
            style={{ marginLeft: 4, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'white', color: '#444', fontSize: 12 }}
          >
            <option value="all">All fields</option>
            {FIELD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#999' }}>
          {filteredReports.length} report{filteredReports.length === 1 ? '' : 's'}
        </span>
      </div>

      {filteredReports.length === 0 ? (
        <div className="bg-canvas" style={{ padding: '36px 20px', border: '1px solid #e0ddd8', borderRadius: 10, color: '#888', fontSize: 13, textAlign: 'center' }}>
          No reports match these filters.
        </div>
      ) : (
        <div className="data-table-wrapper bg-canvas">
          <div className="data-table-scroll">
            <table className="data-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Practice</th>
                  <th>Reporter</th>
                  <th>Field</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map(report => {
                  const expanded = expandedId === report.id
                  const colors = statusColors(report.status)
                  const reporterName = reporterLabel(report.reporter, report.reported_by)

                  return (
                    <Fragment key={report.id}>
                      <tr>
                        <td style={{ ...cellStyle, width: 130, color: '#777', fontSize: 12 }}>{formatDate(report.created_at)}</td>
                        <td style={{ ...cellStyle, minWidth: 160 }}>
                          <Link href={`/practices/${report.practice_id}`} style={{ color: '#1C4A45', fontWeight: 600 }}>
                            {displayValue(report.practice?.practice_name)}
                          </Link>
                        </td>
                        <td style={{ ...cellStyle, minWidth: 160 }}>
                          <div style={{ color: '#444', fontWeight: 500 }}>{reporterName}</div>
                          {report.reporter?.email && reporterName !== report.reporter.email && (
                            <div style={{ color: '#999', fontSize: 11, marginTop: 2 }}>{report.reporter.email}</div>
                          )}
                        </td>
                        <td style={{ ...cellStyle, color: '#555', whiteSpace: 'nowrap' }}>{fieldLabel(report.field_flagged)}</td>
                        <td style={{ ...cellStyle, width: '32%', minWidth: 220 }}>
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : report.id)}
                            aria-expanded={expanded}
                            style={{ width: '100%', border: 'none', background: 'none', padding: 0, color: '#555', cursor: 'pointer', textAlign: 'left', fontSize: 13, lineHeight: 1.45 }}
                          >
                            {expanded || report.description.length <= 120
                              ? report.description
                              : `${report.description.slice(0, 120)}…`}
                            <span style={{ display: 'block', color: '#1C4A45', fontSize: 11, marginTop: 4 }}>
                              {expanded ? 'Collapse' : 'Expand'}
                            </span>
                          </button>
                        </td>
                        <td style={{ ...cellStyle, minWidth: 145 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <span style={{ alignSelf: 'flex-start', padding: '2px 8px', borderRadius: 99, color: colors.color, background: colors.background, fontSize: 10, fontWeight: 700 }}>
                              {report.status}
                            </span>
                            <select
                              value={statusDrafts[report.id] ?? report.status}
                              onChange={event => setStatusDrafts(previous => ({ ...previous, [report.id]: event.target.value as ReportStatus }))}
                              aria-label={`Status for report on ${displayValue(report.practice?.practice_name)}`}
                              style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 7, background: 'white', color: '#444', fontSize: 11 }}
                            >
                              {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => saveReport(report)}
                              disabled={savingId === report.id}
                              style={{ padding: '6px 9px', border: 'none', borderRadius: 7, background: savingId === report.id ? '#8ab4ae' : '#1C4A45', color: 'white', fontSize: 11, fontWeight: 600, cursor: savingId === report.id ? 'not-allowed' : 'pointer' }}
                            >
                              {savingId === report.id ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                      <tr>
                          <td colSpan={6} style={{ padding: 18, borderBottom: '1px solid #e0ddd8', background: '#fafafa' }}>
                            <div style={{ marginBottom: 18 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                                Snapshot at report time vs current data
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                                {COMPARISON_FIELDS.map(field => {
                                  const snapshotValue = displayValue(report.snapshot?.[field.key])
                                  const currentValue = displayValue(report.practice?.[field.key])
                                  const different = snapshotValue !== currentValue

                                  return (
                                    <div key={field.key} style={{ padding: 12, border: `1px solid ${different ? '#f0d0a0' : '#e8e8e8'}`, borderRadius: 8, background: different ? '#fff8f0' : 'white' }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: different ? '#7B3F00' : '#777', marginBottom: 8 }}>{field.label}{different ? ' · Changed' : ''}</div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div>
                                          <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Reported</div>
                                          <div style={{ fontSize: 12, color: '#555', overflowWrap: 'anywhere' }}>{snapshotValue}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Current</div>
                                          <div style={{ fontSize: 12, color: '#555', overflowWrap: 'anywhere' }}>{currentValue}</div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#777', marginBottom: 6 }}>
                              Admin notes
                            </label>
                            <textarea
                              value={notesDrafts[report.id] ?? ''}
                              onChange={event => setNotesDrafts(previous => ({ ...previous, [report.id]: event.target.value }))}
                              rows={3}
                              style={{ width: '100%', maxWidth: 720, padding: '9px 11px', border: '1px solid #ddd', borderRadius: 8, background: 'white', color: '#444', fontFamily: 'inherit', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
                              <button
                                type="button"
                                onClick={() => saveReport(report)}
                                disabled={savingId === report.id}
                                style={{ padding: '7px 12px', border: 'none', borderRadius: 7, background: savingId === report.id ? '#8ab4ae' : '#1C4A45', color: 'white', fontSize: 11, fontWeight: 600, cursor: savingId === report.id ? 'not-allowed' : 'pointer' }}
                              >
                                {savingId === report.id ? 'Saving...' : 'Save changes'}
                              </button>
                              {report.resolved_at && (
                                <span style={{ fontSize: 11, color: '#999' }}>Resolved {formatDate(report.resolved_at)}</span>
                              )}
                              {saveErrors[report.id] && (
                                <span style={{ fontSize: 11, color: '#b91c1c' }}>{saveErrors[report.id]}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
