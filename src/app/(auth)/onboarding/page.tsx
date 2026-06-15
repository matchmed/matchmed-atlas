'use client'

import { useState, useRef, useEffect } from 'react'
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
  padding: '12px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 14,
  color: '#111',
  background: '#f3f4f6',
  outline: 'none',
  boxSizing: 'border-box' as const,
  appearance: 'none' as const,
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#111',
  marginBottom: 6,
}

const fieldStyle = { marginBottom: 18 }

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

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    npi: '',
    phone: '+1 ',
    preferred_state: [] as string[],
    start_year: '',
    clinical_focus: [] as string[],
    training_status: '',
    current_practice: '',
    procedures_performed: [] as string[],
    procedures_desired: [] as string[],
    terms_accepted: false,
    data_sharing: false,
  })

  async function handleSubmit() {
    if (!form.terms_accepted) {
      setError('Please accept the Terms of Service to continue.')
      return
    }
    setLoading(true)
    setError('')
  
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
  
    if (!user) { router.push('/login'); return }
  
    const { error: upsertError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      email: user.email,
      ...form,
      onboarding_complete: true,
      signup_date: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    
    if (upsertError) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          user_id: user.id,
          ...form,
          onboarding_complete: true,
        })
        .eq('email', user.email)
      }
  
    setShowSuccess(true)
    setTimeout(() => router.push('/'), 2500)
  }

  return (
    <div className="auth-split">

      {/* Form panel */}
      <div className="auth-onboarding-form">
        <div className="auth-onboarding-inner">

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{ width: 32, height: 32, background: '#185FA5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111', letterSpacing: '-0.3px' }}>MatchMed Atlas</span>
          </div>

          {/* Progress */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
            {[1,2].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 99, background: step >= s ? '#185FA5' : '#e5e7eb' }} />
            ))}
          </div>

          {step === 1 && (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 4, letterSpacing: '-0.4px' }}>Welcome!</h1>
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 28, lineHeight: 1.5 }}>Please answer a few questions to complete your profile.</p>

              <div style={fieldStyle}>
                <label style={labelStyle}>First name *</label>
                <input style={inputStyle} type="text" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Last name *</label>
                <input style={inputStyle} type="text" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>NPI *</label>
                <input style={inputStyle} type="text" placeholder="10-digit NPI number" value={form.npi} onChange={e => setForm(f => ({ ...f, npi: e.target.value }))} autoComplete="off" />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Phone *</label>
                <input
                  style={inputStyle}
                  type="tel"
                  placeholder="+1 (555) 000-0000"
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

              <MultiSelect label="Preferred state(s) *" options={US_STATES} value={form.preferred_state} onChange={v => setForm(f => ({ ...f, preferred_state: v }))} />

              <div style={fieldStyle}>
                <label style={labelStyle}>Anticipated start date *</label>
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

              <MultiSelect label="Clinical areas of focus *" options={CLINICAL_FOCUS} value={form.clinical_focus} onChange={v => setForm(f => ({ ...f, clinical_focus: v }))} />

              <div style={fieldStyle}>
                <label style={labelStyle}>Training status *</label>
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
                <label style={labelStyle}>Current training program or practice *</label>
                <input style={inputStyle} type="text" value={form.current_practice} onChange={e => setForm(f => ({ ...f, current_practice: e.target.value }))} />
              </div>

              <MultiSelect label="Procedures performed in the past *" options={PROCEDURES} value={form.procedures_performed} onChange={v => setForm(f => ({ ...f, procedures_performed: v }))} />

              <MultiSelect label="Procedures interested in for the future *" options={PROCEDURES} value={form.procedures_desired} onChange={v => setForm(f => ({ ...f, procedures_desired: v }))} />

              <button
                onClick={() => setStep(2)}
                disabled={!form.first_name || !form.last_name || !form.npi || !form.training_status}
                style={{ width: '100%', padding: '13px 16px', background: (!form.first_name || !form.last_name || !form.npi || !form.training_status) ? '#93c5fd' : '#185FA5', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8, boxSizing: 'border-box' as const }}
              >
                Next
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 4, letterSpacing: '-0.4px' }}>Almost done</h1>
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 28, lineHeight: 1.5 }}>Just a couple of agreements before we get started.</p>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 10 }}>Terms of Service & Privacy Policy *</p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.terms_accepted} onChange={e => setForm(f => ({ ...f, terms_accepted: e.target.checked }))} style={{ marginTop: 2, accentColor: '#185FA5' }} />
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    I agree to MatchMed's{' '}
                    <a href="https://atlas.matchmed.app/terms-and-conditions" target="_blank" rel="noopener noreferrer" style={{ color: '#185FA5' }}>Terms of Service</a>
                    {' '}&{' '}
                    <a href="https://atlas.matchmed.app/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#185FA5' }}>Privacy Policy</a>.
                  </span>
                </label>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 24 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 10 }}>Introductions & Opportunities</p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.data_sharing} onChange={e => setForm(f => ({ ...f, data_sharing: e.target.checked }))} style={{ marginTop: 2, accentColor: '#185FA5' }} />
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    I agree to be contactable by ophthalmology practices and industry partners. This is what keeps Atlas free for physicians. I can opt out at any time.
                  </span>
                </label>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{error}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setStep(1)}
                  style={{ flex: 1, padding: '13px 16px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15, fontWeight: 500, color: '#374151', cursor: 'pointer' }}
                >
                  Previous
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ flex: 1, padding: '13px 16px', background: loading ? '#93c5fd' : '#185FA5', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading ? 'Saving...' : 'Submit'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-split-hero">
        <div
          className="auth-split-hero-bg"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=1200&q=80')`,
            opacity: 0.6,
          }}
        />
        <div className="auth-split-hero-content">
          <blockquote style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.5, marginBottom: 12, letterSpacing: '-0.2px' }}>
            "Built on 8 years of CMS Medicare data covering 6,400+ ophthalmology practices and 22,000+ physician careers."
          </blockquote>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>MatchMed Atlas — Ophthalmology Workforce Intelligence</p>
        </div>
      </div>

      {/* Success popup */}
      {showSuccess && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 40, maxWidth: 360, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 64, height: 64, background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="32" height="32" fill="none" stroke="#16a34a" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 8, letterSpacing: '-0.3px' }}>Profile created!</h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>Welcome to Atlas. Taking you to the dashboard...</p>
          </div>
        </div>
      )}
    </div>
  )
}