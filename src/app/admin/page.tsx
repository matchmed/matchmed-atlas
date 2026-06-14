'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const ADMIN_EMAIL = 'admin@matchmed.app' // 🔒 change to your login email

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  npi: string | null
  npi_verified: boolean | null
  training_status: string | null
  subspecialty: string[] | null
  signup_date: string | null
  onboarding_complete: boolean | null
  deleted_at: string | null
}

interface Lead {
  id: string
  practice_name: string | null
  primary_location: string | null
  received_at: string | null
  practice_id: string | null
  point_of_contact: string | null
}

interface Practice {
  id: string
  practice_name: string | null
  city: string | null
  state: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Tag({ children, color = '#185FA5', bg = '#E8F0FB' }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, color, background: bg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all')
  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({})
  const [deletingMap, setDeletingMap] = useState<Record<string, boolean>>({})
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({})
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => { loadProfiles() }, [])

  async function loadProfiles() {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, user_id, first_name, last_name, email, npi, npi_verified, training_status, subspecialty, signup_date, onboarding_complete, deleted_at')
      .is('deleted_at', null)
      .order('signup_date', { ascending: false })
    if (data) setProfiles(data)
    setLoading(false)
  }

  async function toggleVerified(profile: Profile) {
    setTogglingMap(prev => ({ ...prev, [profile.id]: true }))
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ npi_verified: !profile.npi_verified })
      .eq('id', profile.id)
    setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, npi_verified: !p.npi_verified } : p))
    setTogglingMap(prev => ({ ...prev, [profile.id]: false }))
  }

  async function deleteUser(profile: Profile) {
    setDeletingMap(prev => ({ ...prev, [profile.id]: true }))
    const supabase = createClient()
    // Soft delete the profile
    await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', profile.id)
    setProfiles(prev => prev.filter(p => p.id !== profile.id))
    setDeletingMap(prev => ({ ...prev, [profile.id]: false }))
    setConfirmDelete(null)
  }

  async function sendMagicLink(profile: Profile) {
    if (!profile.email) return
    setSendingMap(prev => ({ ...prev, [profile.id]: true }))
    const supabase = createClient()
    await supabase.auth.signInWithOtp({
      email: profile.email,
      options: { shouldCreateUser: false }
    })
    setSentMap(prev => ({ ...prev, [profile.id]: true }))
    setSendingMap(prev => ({ ...prev, [profile.id]: false }))
    setTimeout(() => setSentMap(prev => ({ ...prev, [profile.id]: false })), 4000)
  }

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.npi || '').includes(q)
    const matchFilter =
      filter === 'all' ||
      (filter === 'verified' && p.npi_verified) ||
      (filter === 'unverified' && !p.npi_verified)
    return matchSearch && matchFilter
  })

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search name, email, or NPI..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd', borderRadius: 8, outline: 'none', flex: 1, minWidth: 200 }}
        />
        {(['all', 'verified', 'unverified'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 12, padding: '6px 14px', height: 36, borderRadius: 8, border: '1px solid',
              borderColor: filter === f ? '#185FA5' : '#ddd',
              background: filter === f ? '#185FA5' : '#fff',
              color: filter === f ? '#fff' : '#555',
              cursor: 'pointer', fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: 12, color: '#aaa', marginLeft: 'auto' }}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading && <div style={{ color: '#aaa', fontSize: 13, padding: 20 }}>Loading...</div>}

      {/* Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(p => (
          <div
            key={p.id}
            style={{
              border: '1px solid #e8e8e8',
              borderRadius: 10,
              padding: '14px 16px',
              background: '#fff',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              alignItems: 'start',
            }}
          >
            {/* Left: info */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
                  {p.first_name || ''} {p.last_name || ''}
                  {(!p.first_name && !p.last_name) && <span style={{ color: '#aaa' }}>(no name)</span>}
                </span>
                {p.npi_verified
                  ? <Tag color="#1A6B3A" bg="#D4EDDA">✓ NPI Verified</Tag>
                  : <Tag color="#888" bg="#f0f0f0">Unverified</Tag>
                }
                {p.onboarding_complete
                  ? <Tag color="#185FA5" bg="#E8F0FB">Onboarded</Tag>
                  : <Tag color="#C8640A" bg="#FFF0E0">Onboarding incomplete</Tag>
                }
                {p.training_status && <Tag color="#7B3FA0" bg="#EEE0F8">{p.training_status}</Tag>}
              </div>
              <div style={{ fontSize: 12, color: '#777', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {p.email && <span>✉️ {p.email}</span>}
                {p.npi && <span>NPI: {p.npi}</span>}
                <span>Joined {formatDate(p.signup_date)}</span>
              </div>
              {(p.subspecialty || []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {(p.subspecialty || []).map(s => <Tag key={s}>{s}</Tag>)}
                </div>
              )}
            </div>

            {/* Right: actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              {/* Verify toggle */}
              <button
                onClick={() => toggleVerified(p)}
                disabled={togglingMap[p.id]}
                style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid',
                  borderColor: p.npi_verified ? '#d44' : '#1A6B3A',
                  color: p.npi_verified ? '#d44' : '#1A6B3A',
                  background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  opacity: togglingMap[p.id] ? 0.5 : 1,
                }}
              >
                {p.npi_verified ? 'Unverify' : 'Verify NPI'}
              </button>

              {/* Magic link */}
              <button
                onClick={() => sendMagicLink(p)}
                disabled={sendingMap[p.id] || sentMap[p.id] || !p.email}
                style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid #185FA5',
                  color: sentMap[p.id] ? '#1A6B3A' : '#185FA5',
                  borderColor: sentMap[p.id] ? '#1A6B3A' : '#185FA5',
                  background: 'none', cursor: p.email ? 'pointer' : 'default', whiteSpace: 'nowrap',
                  opacity: sendingMap[p.id] ? 0.5 : 1,
                }}
              >
                {sentMap[p.id] ? '✓ Sent' : sendingMap[p.id] ? 'Sending...' : 'Send magic link'}
              </button>

              {/* Delete */}
              {confirmDelete === p.id ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => deleteUser(p)}
                    disabled={deletingMap[p.id]}
                    style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid #d44', color: '#fff', background: '#d44', cursor: 'pointer' }}
                  >
                    {deletingMap[p.id] ? '...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', color: '#555', background: '#fff', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(p.id)}
                  style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', color: '#aaa', background: 'none', cursor: 'pointer' }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>No users found.</div>
        )}
      </div>
    </div>
  )
}

// ─── Link Jobs Tab ─────────────────────────────────────────────────────────────

function LinkJobsTab() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchMap, setSearchMap] = useState<Record<string, string>>({})
  const [resultsMap, setResultsMap] = useState<Record<string, Practice[]>>({})
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({})
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      setLoading(true)
      const { data } = await supabase
        .from('employer_leads')
        .select('id, practice_name, primary_location, received_at, practice_id, point_of_contact')
        .is('practice_id', null)
        .order('received_at', { ascending: false })
      if (data) setLeads(data)
      setLoading(false)
    }
    load()
  }, [])

  async function searchPractices(leadId: string, query: string) {
    setSearchMap(prev => ({ ...prev, [leadId]: query }))
    setOpenMap(prev => ({ ...prev, [leadId]: true }))
    if (debounceRef.current[leadId]) clearTimeout(debounceRef.current[leadId])
    if (!query.trim()) { setResultsMap(prev => ({ ...prev, [leadId]: [] })); return }
    debounceRef.current[leadId] = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('practices')
        .select('id, practice_name, city, state')
        .or(`practice_name.ilike.%${query}%,city.ilike.%${query}%`)
        .limit(8)
      setResultsMap(prev => ({ ...prev, [leadId]: data || [] }))
    }, 250)
  }

  async function linkPractice(leadId: string, practice: Practice) {
    setSavingMap(prev => ({ ...prev, [leadId]: true }))
    const supabase = createClient()
    await supabase.from('employer_leads').update({ practice_id: practice.id }).eq('id', leadId)
    setSavedMap(prev => ({ ...prev, [leadId]: true }))
    setSavingMap(prev => ({ ...prev, [leadId]: false }))
    setOpenMap(prev => ({ ...prev, [leadId]: false }))
    setTimeout(() => setLeads(prev => prev.filter(l => l.id !== leadId)), 800)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        {leads.length} unlinked listing{leads.length !== 1 ? 's' : ''}
      </div>

      {loading && <div style={{ color: '#aaa', fontSize: 13, padding: 20 }}>Loading...</div>}

      {leads.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>All job posts are linked.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {leads.map(lead => (
          <div
            key={lead.id}
            style={{
              border: '1px solid #e8e8e8', borderRadius: 10, padding: '14px 16px',
              background: savedMap[lead.id] ? '#f0faf4' : '#fff', transition: 'background 0.3s',
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>
                {lead.practice_name || '(no name)'}
                {savedMap[lead.id] && <span style={{ marginLeft: 8, fontSize: 12, color: '#1A6B3A', fontWeight: 600 }}>✓ Linked</span>}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {lead.primary_location || '—'}
                {lead.point_of_contact && <span style={{ marginLeft: 10 }}>· {lead.point_of_contact}</span>}
                {lead.received_at && <span style={{ marginLeft: 10 }}>· {formatDate(lead.received_at)}</span>}
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search practice name or city..."
                value={searchMap[lead.id] || ''}
                onChange={e => searchPractices(lead.id, e.target.value)}
                onFocus={() => setOpenMap(prev => ({ ...prev, [lead.id]: true }))}
                style={{ width: '100%', fontSize: 13, padding: '7px 11px', border: '1px solid #ddd', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              {openMap[lead.id] && (resultsMap[lead.id] || []).length > 0 && (
                <div style={{ position: 'absolute', top: 38, left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 999, maxHeight: 220, overflowY: 'auto' }}>
                  {(resultsMap[lead.id] || []).map(p => (
                    <div
                      key={p.id}
                      onClick={() => linkPractice(lead.id, p)}
                      style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f5f8ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      <span style={{ fontWeight: 500 }}>{p.practice_name}</span>
                      <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>{p.city}, {p.state}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {savingMap[lead.id] && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Saving...</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Admin Page ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'users' | 'jobs'>('users')

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setAuthorized(!!user && user.email === ADMIN_EMAIL)
    }
    check()
  }, [])

  if (authorized === null) return <div style={{ padding: 40, color: '#aaa', fontSize: 14 }}>Loading...</div>
  if (!authorized) return <div style={{ padding: 40, color: '#888', fontSize: 14 }}>Not authorized.</div>

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', marginBottom: 16 }}>Admin</div>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e8e8e8', paddingBottom: 0 }}>
          {(['users', 'jobs'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 13, fontWeight: 600, padding: '8px 18px',
                border: 'none', background: 'none', cursor: 'pointer',
                color: tab === t ? '#185FA5' : '#aaa',
                borderBottom: tab === t ? '2px solid #185FA5' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t === 'users' ? 'Users' : 'Link Job Posts'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'users' ? <UsersTab /> : <LinkJobsTab />}
    </div>
  )
}