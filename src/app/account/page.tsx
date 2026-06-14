'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const US_STATES = ['AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY']

const CLINICAL_FOCUS = [
  'Cataract Surgery / Refractive Surgery',
  'Glaucoma (medical and/or surgical)',
  'Retinal Diseases +/- Uveitis',
  'Corneal Disease',
  'Dry Eye / Ocular Surface Disease',
  'Oculoplastics',
  'Neuro-ophthalmology / Strabismus',
  'Pediatric Ophthalmology',
  'General Ophthalmology (multiple areas)',
]

const PROCEDURES = [
  'Standard Cataract Surgery',
  'Premium Cataract Surgery / Refractive Lens Exchange',
  'LASIK/PRK',
  'ICL/Phakic Lenses',
  'Corneal Surgery (Keratoplasty, Crosslinking)',
  'MIGS',
  'Glaucoma Surgery (beyond MIGS)',
  'Oculoplastic Surgery',
  'Retinal Surgery',
  'Strabismus Surgery',
  'Other',
]

const START_YEARS = ['2026','2027','2028','2029','2030','2031 or later']
const TRAINING_STATUS = ['Resident','Fellow','Attending']

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 14,
  color: '#111',
  background: '#f9fafb',
  outline: 'none',
  boxSizing: 'border-box' as const,
  appearance: 'none' as const,
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 6,
}

const fieldStyle = { marginBottom: 16 }

function MultiSelect({ label, options, value, onChange }: {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  return (
    <div style={fieldStyle} ref={ref}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => setOpen(!open)}
          style={{ ...inputStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span style={{ color: value.length ? '#111' : '#9ca3af' }}>
            {value.length ? `${value.length} selected` : 'Select all that apply'}
          </span>
          <svg width="16" height="16" fill="none" stroke="#6b7280" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {open && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 240, overflowY: 'auto' }}>
            {options.map(opt => (
              <div
                key={opt}
                onClick={() => toggle(opt)}
                style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#111', background: value.includes(opt) ? '#eff6ff' : 'white' }}
              >
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${value.includes(opt) ? '#185FA5' : '#d1d5db'}`, background: value.includes(opt) ? '#185FA5' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {value.includes(opt) && (
                    <svg width="10" height="10" fill="none" stroke="white" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {value.map(v => (
            <span key={v} style={{ background: '#eff6ff', color: '#185FA5', fontSize: 12, padding: '3px 8px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
              {v}
              <span onClick={() => toggle(v)} style={{ cursor: 'pointer', fontWeight: 700 }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AccountPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [initials, setInitials] = useState('?')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    npi: '',
    phone: '',
    preferred_state: [] as string[],
    start_year: '',
    clinical_focus: [] as string[],
    training_status: '',
    current_practice: '',
    procedures_performed: [] as string[],
    procedures_desired: [] as string[],
    data_sharing: false,
  })

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      setUserEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (profile) {
        setForm({
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          npi: profile.npi || '',
          phone: profile.phone || '',
          preferred_state: profile.preferred_state || [],
          start_year: profile.start_year || '',
          clinical_focus: profile.clinical_focus || [],
          training_status: profile.training_status || '',
          current_practice: profile.current_practice || '',
          procedures_performed: profile.procedures_performed || [],
          procedures_desired: profile.procedures_desired || [],
          data_sharing: profile.data_sharing || false,
        })
        if (profile.first_name) {
          setInitials(`${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase())
        } else {
          setInitials(user.email?.[0].toUpperCase() || '?')
        }
      }
      setLoading(false)
    }
    loadProfile()
  }, [])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('profiles')
      .update({ ...form })
      .eq('user_id', user.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
  
    await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
  
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <div style={{ fontSize: 14, color: '#6b7280' }}>Loading your profile...</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700 }}>
            {initials}
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 2, letterSpacing: '-0.3px' }}>Account settings</h1>
            <p style={{ fontSize: 13, color: '#6b7280' }}>{userEmail}</p>
          </div>
        </div>
      </div>

      {/* Profile section */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 20 }}>Profile information</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>First name</label>
            <input style={inputStyle} type="text" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Last name</label>
            <input style={inputStyle} type="text" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>NPI</label>
          <input style={inputStyle} type="text" value={form.npi} onChange={e => setForm(f => ({ ...f, npi: e.target.value }))} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Phone</label>
          <input
            style={inputStyle}
            type="tel"
            value={form.phone}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
              let formatted = ''
              if (digits.length <= 1) formatted = digits
              else if (digits.length <= 4) formatted = `+${digits[0]} (${digits.slice(1)}`
              else if (digits.length <= 7) formatted = `+${digits[0]} (${digits.slice(1,4)}) ${digits.slice(4)}`
              else formatted = `+${digits[0]} (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
              setForm(f => ({ ...f, phone: formatted }))
            }}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Training status</label>
          <div style={{ position: 'relative' }}>
            <select style={inputStyle} value={form.training_status} onChange={e => setForm(f => ({ ...f, training_status: e.target.value }))}>
              <option value="">Select...</option>
              {TRAINING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <svg width="16" height="16" fill="none" stroke="#6b7280" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Current training program or practice</label>
          <input style={inputStyle} type="text" value={form.current_practice} onChange={e => setForm(f => ({ ...f, current_practice: e.target.value }))} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Anticipated start date</label>
          <div style={{ position: 'relative' }}>
            <select style={inputStyle} value={form.start_year} onChange={e => setForm(f => ({ ...f, start_year: e.target.value }))}>
              <option value="">Select year...</option>
              {START_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <svg width="16" height="16" fill="none" stroke="#6b7280" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>

        <MultiSelect label="Preferred state(s)" options={US_STATES} value={form.preferred_state} onChange={v => setForm(f => ({ ...f, preferred_state: v }))} />
        <MultiSelect label="Clinical areas of focus" options={CLINICAL_FOCUS} value={form.clinical_focus} onChange={v => setForm(f => ({ ...f, clinical_focus: v }))} />
        <MultiSelect label="Procedures performed in the past" options={PROCEDURES} value={form.procedures_performed} onChange={v => setForm(f => ({ ...f, procedures_performed: v }))} />
        <MultiSelect label="Procedures interested in for the future" options={PROCEDURES} value={form.procedures_desired} onChange={v => setForm(f => ({ ...f, procedures_desired: v }))} />
      </div>

      {/* Preferences section */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Introductions & Opportunities</h2>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.data_sharing}
            onChange={e => setForm(f => ({ ...f, data_sharing: e.target.checked }))}
            style={{ marginTop: 2, accentColor: '#185FA5' }}
          />
          <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
            I agree to be contactable by ophthalmology practices and industry partners. This is what keeps Atlas free for physicians. I can opt out at any time.
          </span>
        </label>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '11px 28px',
          background: saved ? '#16a34a' : saving ? '#93c5fd' : '#185FA5',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save changes'}
      </button>

      {/* Delete account */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Close account</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Deleting your account removes your profile from Atlas. Your data can be restored if you contact us within 30 days.
        </p>
        <button
            onClick={() => setShowDeleteModal(true)}
            style={{ padding: '9px 20px', background: 'white', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#dc2626', cursor: 'pointer' }}
        >
            Delete account
        </button>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8 }}>Delete your account?</h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5, marginBottom: 24 }}>
                Your profile will be removed from Atlas. If you change your mind, contact us within 30 days to restore it.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
                <button
                onClick={() => setShowDeleteModal(false)}
                style={{ flex: 1, padding: '10px 16px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}
                >
                Cancel
                </button>
                <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{ flex: 1, padding: '10px 16px', background: '#dc2626', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'white', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
                >
                {deleting ? 'Deleting...' : 'Yes, delete'}
                </button>
            </div>
            </div>
        </div>
        )}
    </div>
  )
}