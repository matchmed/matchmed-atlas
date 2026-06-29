'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { nameToColor, getInitials } from '@/lib/utils'
import Link from 'next/link'

interface Doctor {
  id: string
  physician_name: string | null
  npi: string
  graduation_year: number | null
  years_since_graduation: number | null
  last_known_affiliation: string | null
}

interface Affiliation {
  id: string
  status: string | null
  first_seen_year_at_org: number | null
  last_seen_year_at_org: number | null
  tenure_years: number | null
  city_st: string | null
  practice_id: string | null
  practices: { practice_name: string | null; id: string } | null
}

export default function PhysicianDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [loading, setLoading] = useState(true)
  const [showFormer, setShowFormer] = useState(true)

  useEffect(() => {
    async function load() {
    const supabase = createClient()
      setLoading(true)
      const [docRes, affilRes] = await Promise.all([
        supabase.from('doctors').select('*').eq('id', id).single(),
        supabase.from('affiliations').select('id,status,first_seen_year_at_org,last_seen_year_at_org,tenure_years,city_st,practice_id,practices(practice_name,id)').eq('doctor_id', id).order('last_seen_year_at_org', { ascending: false }),
      ])
      if (docRes.data) setDoctor(docRes.data)
      if (affilRes.data) setAffiliations(affilRes.data as any)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="loading-bar"><div className="loading-bar-inner" /></div>
  if (!doctor) return <div style={{ padding: 40, color: '#aaa', textAlign: 'center' }}>Physician not found.</div>

  const name = doctor.physician_name || '—'
  const [fg, bg] = nameToColor(name)
  const initials = getInitials(name)
  const onRoster = affiliations.filter(a => (a.status || '').toLowerCase() === 'on roster')
  const notRoster = affiliations.filter(a => (a.status || '').toLowerCase() !== 'on roster')

  function renderAffilCard(a: Affiliation) {
    const practiceName = a.practices?.practice_name || '—'
    const isOn = (a.status || '').toLowerCase() === 'on roster'
    const tenure = a.tenure_years || 0
    const tenureLabel = tenure >= 8 ? '8+ yrs' : tenure === 1 ? '1 yr' : `${tenure} yrs`
    return (
      <div key={a.id} className="bg-canvas" style={{ border: '1px solid #e8e8e8', borderRadius: 10, padding: '16px 18px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{practiceName}</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{a.city_st || '—'}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: isOn ? '#d4edda' : '#f5f5f5', color: isOn ? '#1A6B3A' : '#888' }}>{a.status}</span>
            <span style={{ fontSize: 12, color: '#888' }}>{a.first_seen_year_at_org} - {a.last_seen_year_at_org}</span>
            <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>{tenureLabel}</span>
          </div>
        </div>
        {a.practice_id && (
          <Link href={`/practices/${a.practice_id}`} style={{ fontSize: 12, color: '#1C4A45', cursor: 'pointer', padding: '4px 10px', border: '1px solid #1C4A45', borderRadius: 6, background: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Open →
          </Link>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => router.back()} style={{ fontSize: 13, color: '#1C4A45', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, padding: 0 }}>← Back to physicians</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, flexShrink: 0, letterSpacing: '-0.5px' }}>
          {initials}
        </div>
        <div>
          <div className="font-serif" style={{ fontSize: 22, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 8 }}>{name}</div>
          {doctor.npi && <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>NPI: <span style={{ color: '#444', fontWeight: 500 }}>{doctor.npi}</span></div>}
          {doctor.graduation_year && <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Med school grad: <span style={{ color: '#444', fontWeight: 500 }}>{doctor.graduation_year}</span></div>}
          {doctor.years_since_graduation && <div style={{ fontSize: 13, color: '#888' }}>{doctor.years_since_graduation} yrs since graduation</div>}
        </div>
      </div>

      {/* Practice history */}
      {onRoster.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1A6B3A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Currently on roster ({onRoster.length})
          </div>
          {onRoster.map(renderAffilCard)}
        </>
      )}

      {notRoster.length > 0 && (
        <div style={{ marginTop: onRoster.length ? 20 : 0 }}>
          <button onClick={() => setShowFormer(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.06em' }}>Previous affiliations ({notRoster.length})</span>
            <span style={{ fontSize: 14, color: '#aaa', transform: showFormer ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>
          {showFormer && notRoster.map(renderAffilCard)}
        </div>
      )}

      {affiliations.length === 0 && !loading && (
        <div style={{ color: '#aaa', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>No practice history found.</div>
      )}
    </div>
  )
}
