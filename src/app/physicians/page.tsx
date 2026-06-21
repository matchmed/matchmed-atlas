'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getInitials, nameToColor } from '@/lib/utils'
import { loadAtlasCache, peekAtlasCache, saveAtlasCache } from '@/lib/atlas-cache'
import { replaceListParams, pageFromParams } from '@/lib/list-url'
import { useListSearch } from '@/lib/use-list-search'

const PAGE_SIZE = 50
const CACHE_KEY = 'atlas_doctors_v2'
const CACHE_TTL = 1 * 60 * 60 * 1000 // 1 hour
const CACHE_DB = 'AtlasDoctorsDB'
const CACHE_STORE = 'doctors'

interface Doctor {
  id: string
  physician_name: string | null
  npi: string
  graduation_year: number | null
  last_known_affiliation: string | null
}

function PhysicianCard({ doctor, onOpen }: { doctor: Doctor; onOpen: () => void }) {
  const name = doctor.physician_name || '—'
  const [fg, bg] = nameToColor(name)
  const initials = getInitials(name)

  return (
    <button type="button" className="practice-card" onClick={onOpen}>
      <div className="practice-card-avatar" style={{ color: fg, background: bg }}>
        {initials}
      </div>
      <div className="practice-card-body">
        <div className="practice-card-name physician-card-name">{name}</div>
        {doctor.last_known_affiliation && (
          <div className="practice-card-meta">{doctor.last_known_affiliation}</div>
        )}
      </div>
      <span className="practice-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export default function PhysiciansPage() {
  return (
    <Suspense fallback={<div className="loading-bar"><div className="loading-bar-inner" /></div>}>
      <PhysiciansPageContent />
    </Suspense>
  )
}

function PhysiciansPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [doctors, setDoctors] = useState<Doctor[]>(
    () => peekAtlasCache<Doctor>(CACHE_DB, CACHE_KEY, CACHE_TTL) ?? [],
  )
  const [loading, setLoading] = useState(
    () => !peekAtlasCache<Doctor>(CACHE_DB, CACHE_KEY, CACHE_TTL),
  )
  const { search, setSearch } = useListSearch()
  const page = pageFromParams(searchParams)

  function patchUrl(updates: Record<string, string | null | undefined>) {
    replaceListParams(pathname, router, searchParams, updates)
  }

  function goToPage(p: number) {
    patchUrl({ page: p === 0 ? null : String(p + 1) })
  }

  useEffect(() => {
    async function load() {
      const cached = await loadAtlasCache<Doctor>(CACHE_DB, CACHE_STORE, CACHE_KEY, CACHE_TTL)
      if (cached) {
        setDoctors(cached)
        setLoading(false)
        return
      }
      const supabase = createClient()
      setLoading(true)
      let all: Doctor[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('doctors')
          .select('id,physician_name,npi,graduation_year,last_known_affiliation')
          .order('physician_name', { ascending: true })
          .range(from, from + 999)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < 1000) break
        from += 1000
      }
      await saveAtlasCache(CACHE_DB, CACHE_STORE, CACHE_KEY, all)
      setDoctors(all)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = doctors.filter(d => {
    const q = search.toLowerCase()
    return !q || (d.physician_name || '').toLowerCase().includes(q) || d.npi.includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageDoctors = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function openPhysician(doctorId: string) {
    router.push(`/physicians/${doctorId}`)
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search physician name or NPI..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd', borderRadius: 8, outline: 'none', width: '100%' }}
        />
      </div>

      {loading && <div className="loading-bar"><div className="loading-bar-inner" /></div>}

      <div className="physicians-table-view">
        <div className="data-table-wrapper">
          <div className="data-table-scroll">
            <table className="data-table data-table-physicians">
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e8e8e8', background: '#f7f7f7', whiteSpace: 'nowrap' }}>
                    Name ↑
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e8e8e8', background: '#f7f7f7', whiteSpace: 'nowrap' }}>
                    NPI
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e8e8e8', background: '#f7f7f7', whiteSpace: 'nowrap' }}>
                    <span className="data-table-label-full">Med School Grad Year</span>
                    <span className="data-table-label-short">Grad Year</span>
                  </th>
                  <th style={{ padding: '10px 14px', borderBottom: '1px solid #e8e8e8', background: '#f7f7f7' }} />
                </tr>
              </thead>
              <tbody>
                {pageDoctors.map(d => (
                  <tr key={d.id} onClick={() => openPhysician(d.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0', fontWeight: 500 }}>
                      {d.physician_name || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0', color: '#666' }}>
                      {d.npi}
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0', color: '#666' }}>
                      {d.graduation_year || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0' }}>
                      <button
                        onClick={e => { e.stopPropagation(); openPhysician(d.id) }}
                        style={{ fontSize: 12, color: '#185FA5', cursor: 'pointer', padding: '4px 10px', border: '1px solid #185FA5', borderRadius: 6, background: 'none', whiteSpace: 'nowrap' }}
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && pageDoctors.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>No physicians match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="physicians-card-view">
        {pageDoctors.map(d => (
          <PhysicianCard key={d.id} doctor={d} onOpen={() => openPhysician(d.id)} />
        ))}
        {!loading && pageDoctors.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
            No physicians match your search.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: '#aaa', flexWrap: 'wrap', gap: 8 }}>
        <span>{filtered.length.toLocaleString()} physicians{search ? ' (filtered)' : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => goToPage(Math.max(0, page - 1))} disabled={page === 0} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.35 : 1 }}>← Prev</button>
          <span style={{ fontSize: 12, color: '#888' }}>Page {page + 1} of {totalPages}</span>
          <button onClick={() => goToPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.35 : 1 }}>Next →</button>
        </div>
        <span>{doctors.length.toLocaleString()} total physicians</span>
      </div>
    </div>
  )
}
