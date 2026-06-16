'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const PAGE_SIZE = 50
const CACHE_KEY = 'atlas_doctors_v1'
const CACHE_TTL = 1 * 60 * 60 * 1000 // 1 hour

interface Doctor {
  id: string
  physician_name: string | null
  npi: string
  graduation_year: number | null
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('AtlasDoctorsDB', 1)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('doctors')) db.createObjectStore('doctors')
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = e => reject((e.target as IDBOpenDBRequest).error)
  })
}

async function loadCache(): Promise<Doctor[] | null> {
  try {
    const db = await openDB()
    return new Promise(resolve => {
      const tx = db.transaction('doctors', 'readonly')
      const req = tx.objectStore('doctors').get(CACHE_KEY)
      req.onsuccess = e => {
        const r = (e.target as IDBRequest).result
        if (!r || Date.now() - r.ts > CACHE_TTL) { resolve(null); return }
        resolve(r.records)
      }
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function saveCache(records: Doctor[]): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction('doctors', 'readwrite')
    tx.objectStore('doctors').put({ ts: Date.now(), records }, CACHE_KEY)
  } catch (e) { console.warn('IndexedDB save failed', e) }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PhysiciansPage() {
  const router = useRouter()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    async function load() {
      const cached = await loadCache()
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
          .select('id,physician_name,npi,graduation_year')
          .order('physician_name', { ascending: true })
          .range(from, from + 999)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < 1000) break
        from += 1000
      }
      await saveCache(all)
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

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search physician name or NPI..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          style={{ fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd', borderRadius: 8, outline: 'none', width: '100%' }}
        />
      </div>

      {loading && <div className="loading-bar"><div className="loading-bar-inner" /></div>}

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
              <tr key={d.id} onClick={() => router.push(`/physicians/${d.id}`)} style={{ cursor: 'pointer' }}>
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
                    onClick={e => { e.stopPropagation(); router.push(`/physicians/${d.id}`) }}
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: '#aaa', flexWrap: 'wrap', gap: 8 }}>
        <span>{filtered.length.toLocaleString()} physicians{search ? ' (filtered)' : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.35 : 1 }}>← Prev</button>
          <span style={{ fontSize: 12, color: '#888' }}>Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.35 : 1 }}>Next →</button>
        </div>
        <span>{doctors.length.toLocaleString()} total physicians</span>
      </div>
    </div>
  )
}