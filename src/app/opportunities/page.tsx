'use client'

import { useEffect, useMemo, useState } from 'react'
import OpportunityCard from '@/components/OpportunityCard'
import {
  OPPORTUNITY_CLINICAL_FOCUS_VALUES,
  OPPORTUNITY_HIRING_HORIZONS,
} from '@/lib/opportunity-labels'
import {
  fetchPhysicianOpportunities,
  type PhysicianOpportunity,
} from '@/lib/physician-opportunities'

const PAGE_SIZE = 20

export default function OpportunitiesPage() {
  const [rows, setRows] = useState<PhysicianOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [clinicalFocus, setClinicalFocus] = useState('')
  const [state, setState] = useState('')
  const [hiringHorizon, setHiringHorizon] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setLoadError(null)
      const { data, error } = await fetchPhysicianOpportunities({
        limit: 500,
        clinicalFocus: clinicalFocus || null,
        state: state || null,
        hiringHorizon: hiringHorizon || null,
      })
      if (error) {
        setLoadError('Opportunities are temporarily unavailable.')
        setRows([])
      } else {
        setRows(data)
      }
      setLoading(false)
      setPage(0)
    }
    void load()
  }, [clinicalFocus, state, hiringHorizon])

  const allStates = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      for (const s of row.practice_states) set.add(s)
    }
    return Array.from(set).sort()
  }, [rows])

  // When a state filter is applied server-side, allStates may be sparse; keep selected state visible.
  const stateOptions = useMemo(() => {
    if (state && !allStates.includes(state)) return [state, ...allStates].sort()
    return allStates
  }, [allStates, state])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1
          className="font-serif"
          style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: '0 0 6px' }}
        >
          Opportunities
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
          Practice-reported recruiting opportunities. Connect when you want to start a conversation.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <select
          value={clinicalFocus}
          onChange={(e) => setClinicalFocus(e.target.value)}
          style={selectStyle}
          aria-label="Filter by clinical focus"
        >
          <option value="">All specialties</option>
          {OPPORTUNITY_CLINICAL_FOCUS_VALUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          style={selectStyle}
          aria-label="Filter by state"
        >
          <option value="">All states</option>
          {stateOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={hiringHorizon}
          onChange={(e) => setHiringHorizon(e.target.value)}
          style={selectStyle}
          aria-label="Filter by hiring horizon"
        >
          <option value="">All hiring horizons</option>
          {OPPORTUNITY_HIRING_HORIZONS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="loading-bar">
          <div className="loading-bar-inner" />
        </div>
      )}

      {loadError && !loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 13 }}>
          {loadError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pageRows.map((opp) => (
          <OpportunityCard key={opp.id} opportunity={opp} source="opportunity_list" />
        ))}

        {!loading && !loadError && pageRows.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>
            {clinicalFocus || state || hiringHorizon
              ? 'No opportunities match your filters.'
              : 'No practice-reported opportunities are available yet.'}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 14,
          fontSize: 12,
          color: '#aaa',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span>
          {rows.length} opportunit{rows.length === 1 ? 'y' : 'ies'}
          {clinicalFocus || state || hiringHorizon ? ' (filtered)' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={pagerBtn(page === 0)}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#888' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={pagerBtn(page >= totalPages - 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '7px 11px',
  height: 36,
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#fff',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 160,
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    padding: '4px 10px',
    border: '1px solid #ddd',
    borderRadius: 6,
    background: '#fff',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
  }
}
