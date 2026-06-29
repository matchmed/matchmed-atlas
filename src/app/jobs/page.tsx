'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Job {
  id: string
  practice_name: string | null
  practice_id: string | null
  point_of_contact: string | null
  email: string | null
  phone: string | null
  primary_location: string | null
  practice_setting: string | null
  clinical_surgical_mix: string | null
  ideal_hiring_timeline: string | null
  subspecialties_interest: string[] | null
  additional_details: string | null
  source: string | null
  received_at: string | null
}

const PAGE_SIZE = 20

function badge(text: string, color = '#1C4A45', bg = '#E8F0EF') {
  return (
    <span
      key={text}
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 500,
        color,
        background: bg,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

function daysAgo(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  if (days < 60) return '1 month ago'
  return `${Math.floor(days / 30)} months ago`
}

export default function JobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set())
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set())
  const [stateOpen, setStateOpen] = useState(false)
  const [subOpen, setSubOpen] = useState(false)
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(0)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      setLoading(true)
      const { data } = await supabase
        .from('employer_leads')
        .select('*')
        .order('received_at', { ascending: false })
      if (data) setJobs(data)
      setLoading(false)
    }
    load()
  }, [])

  const allStates = Array.from(
    new Set(
      jobs
        .map(j => {
          const parts = (j.primary_location || '').split(', ')
          return parts.length >= 2 ? parts[parts.length - 1].trim() : ''
        })
        .filter(Boolean)
    )
  ).sort()

  const allSubs = Array.from(
    new Set(jobs.flatMap(j => j.subspecialties_interest || []).filter(Boolean))
  ).sort()

  function getState(j: Job) {
    const parts = (j.primary_location || '').split(', ')
    return parts.length >= 2 ? parts[parts.length - 1].trim() : ''
  }

  const filtered = jobs
    .filter(j => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        (j.practice_name || '').toLowerCase().includes(q) ||
        (j.primary_location || '').toLowerCase().includes(q)
      const matchState = selectedStates.size === 0 || selectedStates.has(getState(j))
      const matchSub =
        selectedSubs.size === 0 ||
        (j.subspecialties_interest || []).some(s => selectedSubs.has(s))
      return matchSearch && matchState && matchSub
    })
    .sort((a, b) => {
      const da = new Date(a.received_at || 0).getTime()
      const db = new Date(b.received_at || 0).getTime()
      return sort === 'newest' ? db - da : da - db
    })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageJobs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleState(s: string) {
    setSelectedStates(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
    setPage(0)
  }

  function toggleSub(s: string) {
    setSelectedSubs(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
    setPage(0)
  }

  function handleCardClick(j: Job) {
    if (j.practice_id) {
      router.push(`/practices/${j.practice_id}`)
    }
  }

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search practice name or city..."
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            setPage(0)
          }}
          style={{
            fontSize: 13,
            padding: '7px 11px',
            height: 36,
            border: '1px solid #ddd',
            borderRadius: 8,
            outline: 'none',
            flex: 1,
            minWidth: 180,
          }}
        />

        {/* State dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setStateOpen(o => !o)}
            style={{
              fontSize: 13,
              padding: '7px 11px',
              height: 36,
              border: '1px solid #ddd',
              borderRadius: 8,
              background: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              minWidth: 130,
            }}
          >
            {selectedStates.size === 0
              ? 'All states ▾'
              : selectedStates.size === 1
              ? `${[...selectedStates][0]} ▾`
              : `${selectedStates.size} states ▾`}
          </button>
          {stateOpen && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                left: 0,
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 9999,
                width: 180,
              }}
            >
              <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
                {allStates.map(s => (
                  <div
                    key={s}
                    onClick={() => toggleState(s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStates.has(s)}
                      readOnly
                      style={{ width: 13, height: 13 }}
                    />
                    {s}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setSelectedStates(new Set())
                  setPage(0)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: 11,
                  color: '#1C4A45',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid #eee',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Subspecialty dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSubOpen(o => !o)}
            style={{
              fontSize: 13,
              padding: '7px 11px',
              height: 36,
              border: '1px solid #ddd',
              borderRadius: 8,
              background: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              minWidth: 160,
            }}
          >
            {selectedSubs.size === 0
              ? 'All subspecialties ▾'
              : selectedSubs.size === 1
              ? `${[...selectedSubs][0]} ▾`
              : `${selectedSubs.size} subspecialties ▾`}
          </button>
          {subOpen && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                left: 0,
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 9999,
                width: 220,
              }}
            >
              <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
                {allSubs.map(s => (
                  <div
                    key={s}
                    onClick={() => toggleSub(s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubs.has(s)}
                      readOnly
                      style={{ width: 13, height: 13 }}
                    />
                    {s}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setSelectedSubs(new Set())
                  setPage(0)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: 11,
                  color: '#1C4A45',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid #eee',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <select
          value={sort}
          onChange={e => {
            setSort(e.target.value as any)
            setPage(0)
          }}
          style={{
            fontSize: 13,
            padding: '7px 11px',
            height: 36,
            border: '1px solid #ddd',
            borderRadius: 8,
            background: '#fff',
            outline: 'none',
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {loading && (
        <div className="loading-bar">
          <div className="loading-bar-inner" />
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pageJobs.map(j => (
          <div
            key={j.id}
            onClick={() => handleCardClick(j)}
            style={{
              border: '1px solid #e8e8e8',
              borderRadius: 12,
              padding: '18px 20px',
              background: '#ffffff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              cursor: j.practice_id ? 'pointer' : 'default',
              transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={e => {
              if (!j.practice_id) return
              const el = e.currentTarget as HTMLDivElement
              el.style.boxShadow = '0 4px 16px rgba(28,74,69,0.12)'
              el.style.borderColor = '#1C4A45'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLDivElement
              el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'
              el.style.borderColor = '#e8e8e8'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: j.practice_id ? '#1C4A45' : '#1a1a1a',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.3,
                }}
              >
                {j.practice_name || 'Practice'}
              </div>
              {j.practice_id && (
                <span
                  style={{
                    fontSize: 12,
                    color: '#1C4A45',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    opacity: 0.7,
                  }}
                >
                  View Practice →
                </span>
              )}
            </div>

            {j.primary_location && (
              <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
                📍 {j.primary_location}
                {j.received_at && (
                  <span style={{ marginLeft: 12, color: '#bbb' }}>· {daysAgo(j.received_at)}</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(j.subspecialties_interest || []).map(s => badge(s, '#1A6B3A', '#D4EDDA'))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {j.practice_setting && badge(j.practice_setting)}
              {j.clinical_surgical_mix && badge(j.clinical_surgical_mix, '#7B3FA0', '#EEE0F8')}
              {j.ideal_hiring_timeline &&
                badge(`Timeline: ${j.ideal_hiring_timeline}`, '#C8640A', '#FFF0E0')}
            </div>

            {j.additional_details && (
              <div
                style={{
                  fontSize: 13,
                  color: '#555',
                  lineHeight: 1.5,
                  borderTop: '1px solid #f0f0f0',
                  paddingTop: 10,
                  marginTop: 10,
                }}
              >
                {j.additional_details}
              </div>
            )}

            {(j.point_of_contact || j.email || j.phone) && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  alignItems: 'center',
                  borderTop: '1px solid #f0f0f0',
                  paddingTop: 10,
                  marginTop: 10,
                }}
              >
                {j.point_of_contact && (
                  <span style={{ fontSize: 13, fontWeight: 500 }}>👤 {j.point_of_contact}</span>
                )}
                {j.email && (
                  <a
                    href={`mailto:${j.email}`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}
                  >
                    ✉️ {j.email}
                  </a>
                )}
                {j.phone && (
                  <a
                    href={`tel:${j.phone}`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}
                  >
                    📞 {j.phone}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}

        {!loading && pageJobs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>
            No job listings match your filters.
          </div>
        )}
      </div>

      {/* Footer */}
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
          {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
          {search || selectedStates.size || selectedSubs.size ? ' (filtered)' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              background: '#fff',
              cursor: page === 0 ? 'default' : 'pointer',
              opacity: page === 0 ? 0.35 : 1,
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#888' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              background: '#fff',
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              opacity: page >= totalPages - 1 ? 0.35 : 1,
            }}
          >
            Next →
          </button>
        </div>
        <span>{jobs.length} total listings</span>
      </div>
    </div>
  )
}