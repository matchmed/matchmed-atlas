'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Doctor {
  id: string
  physician_name: string | null
  npi: string
  graduation_year: number | null
}

const PAGE_SIZE = 50

export default function PhysiciansPage() {
  const router = useRouter()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    async function load() {
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
          style={{ fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd', borderRadius: 8, outline: 'none', width: '100%', maxWidth: 480 }}
        />
      </div>

      {loading && <div className="loading-bar"><div className="loading-bar-inner" /></div>}

      <div style={{ border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f7f7f7' }}>
            <tr>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e8e8e8' }}>
                Name ↑
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e8e8e8' }}>
                NPI
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e8e8e8' }}>
                Med School Grad Year
              </th>
              <th style={{ padding: '10px 14px', borderBottom: '1px solid #e8e8e8' }} />
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
