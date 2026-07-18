'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { invalidateFavoritesCache } from '@/lib/favorites-cache'
import { syncPracticeListCacheFromDetail } from '@/lib/practices-cache'
import { nameToColor, getInitials, scoreColor, scoreBg, deltaColor, deltaBg, deltaArrow } from '@/lib/utils'
import PracticeErrorReportModal from '@/components/PracticeErrorReportModal'

interface Practice {
  id: string
  practice_name: string | null
  city_st: string | null
  phone: string | null
  website: string | null
  retention_score: number | null
  retention_score_delta: number | null
  experience_level: number | null
  experience_level_delta: number | null
  latest_roster_size: number | null
  total_physicians_all_time: number | null
  short_tenure_departure_count: number | null
  med_yrs_grad: number | null
  veteran_count: number | null
  tenure_0_1: number | null
  tenure_2_3: number | null
  tenure_4_5: number | null
  tenure_6_7: number | null
  tenure_8_plus: number | null
  org_pac_id: string | null
}

interface Affiliation {
  id: string
  npi: string
  status: string | null
  first_seen_year_at_org: number | null
  last_seen_year_at_org: number | null
  tenure_years: number | null
  grad_yr: number | null
  doctors: { id: string; physician_name: string | null; npi: string } | null
}

interface JobLead {
  id: string
  point_of_contact: string | null
  email: string | null
  phone: string | null
  primary_location: string | null
  practice_setting: string | null
  clinical_surgical_mix: string | null
  ideal_hiring_timeline: string | null
  subspecialties_interest: string[] | null
  additional_details: string | null
}

function deltaChip(d: number | null) {
  if (d === null) return <span style={{ color: '#ccc', fontSize: 11 }}>— vs 2019</span>
  const sign = d > 0 ? '+' : ''
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 600,
      color: deltaColor(d), background: deltaBg(d),
      padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>
      {deltaArrow(d)} {sign}{d.toFixed(1)} vs 2019
    </span>
  )
}

function badge(text: string, color = '#1C4A45', bg = '#E8F0EF') {
  return <span key={text} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, color, background: bg, whiteSpace: 'nowrap' }}>{text}</span>
}

export default function PracticeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [practice, setPractice] = useState<Practice | null>(null)
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [jobs, setJobs] = useState<JobLead[]>([])
  const [loading, setLoading] = useState(true)
  const [showFormer, setShowFormer] = useState(true)
  const [jobsOpen, setJobsOpen] = useState(true)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [favId, setFavId] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      setLoading(true)
      const [practiceRes, affilRes, jobRes] = await Promise.all([
        supabase.from('practices').select('*').eq('id', id).single(),
        supabase.from('affiliations').select('id,npi,status,first_seen_year_at_org,last_seen_year_at_org,tenure_years,grad_yr,doctors(id,physician_name,npi)').eq('practice_id', id).order('last_seen_year_at_org', { ascending: false }),
        supabase.from('employer_leads').select('*').eq('practice_id', id),
      ])
      if (practiceRes.data) {
        setPractice(practiceRes.data)
        void syncPracticeListCacheFromDetail(practiceRes.data)
      }
      if (affilRes.data) setAffiliations(affilRes.data as any)
      if (jobRes.data) setJobs(jobRes.data)

      // Get profile id and check if favorited
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (profile) {
          setProfileId(profile.id)
          const { data: fav } = await supabase
            .from('shortlists')
            .select('id')
            .eq('physician_id', profile.id)
            .eq('practice_id', id)
            .maybeSingle()
          if (fav) {
            setIsFavorited(true)
            setFavId(fav.id)
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [id])

  async function toggleFavorite() {
    if (!profileId) return
    setFavLoading(true)
    const supabase = createClient()

    if (isFavorited && favId) {
      await supabase.from('shortlists').delete().eq('id', favId)
      setIsFavorited(false)
      setFavId(null)
    } else {
      const { data } = await supabase.from('shortlists').insert({
        physician_id: profileId,
        practice_id: id,
      }).select('id').single()
      if (data) {
        setIsFavorited(true)
        setFavId(data.id)
      }
    }
    invalidateFavoritesCache()
    setFavLoading(false)
  }

  if (loading) return <div className="loading-bar"><div className="loading-bar-inner" /></div>
  if (!practice) return <div style={{ padding: 40, color: '#aaa', textAlign: 'center' }}>Practice not found.</div>

  const name = practice.practice_name || 'Unknown Practice'
  const [fg, bg] = nameToColor(name)
  const initials = getInitials(name)
  const hasScore = practice.retention_score !== null
  const score = practice.retention_score
  const alltime = practice.total_physicians_all_time || affiliations.length
  const churn = practice.short_tenure_departure_count || 0
  const churnRate = alltime > 0 ? churn / alltime : 0

  const onRoster = affiliations.filter(a => (a.status || '').toLowerCase() === 'on roster')
  const notRoster = affiliations.filter(a => (a.status || '').toLowerCase() !== 'on roster')

  const BUCKET_ORDER = ['8+ yrs', '6-7 yrs', '4-5 yrs', '2-3 yrs', '0-1 yrs'] as const
  const buckets = {
    '8+ yrs': practice.tenure_8_plus || 0,
    '6-7 yrs': practice.tenure_6_7 || 0,
    '4-5 yrs': practice.tenure_4_5 || 0,
    '2-3 yrs': practice.tenure_2_3 || 0,
    '0-1 yrs': practice.tenure_0_1 || 0,
  }
  const maxVal = Math.max(...Object.values(buckets), 1)
  const barColors = { '8+ yrs': '#1A6B3A', '6-7 yrs': '#4CAF50', '4-5 yrs': '#1C4A45', '2-3 yrs': '#6a9e98', '0-1 yrs': '#d0d0d0' }

  const topHeavy = (buckets['8+ yrs'] + buckets['6-7 yrs']) > (buckets['0-1 yrs'] + buckets['2-3 yrs'])
  const agingRoster = (practice.med_yrs_grad || 0) > 30 && churnRate < 0.2
  const keyPersonRisk = (practice.latest_roster_size || 0) === 1 && alltime > 3

  let insight = ''
  if (!hasScore) insight = 'Not enough historical data to generate a Retention Score. A minimum of two all-time physicians is required to measure retention dynamics.'
  else if (keyPersonRisk) insight = 'Single-physician practice with significant historical turnover. Key-person concentration risk.'
  else if ((score || 0) >= 85 && topHeavy) insight = `Exceptionally stable. ${buckets['8+ yrs']} of ${alltime} all-time physicians reached 8+ years. Near-zero attrition.`
  else if ((score || 0) >= 70) insight = `Strong retention profile. ${churn} short-tenure exit${churn !== 1 ? 's' : ''} out of ${alltime} all-time physicians.`
  else if (churnRate > 0.4) insight = `High churn signal. ${churn} of ${alltime} physicians left within 4 years — ${Math.round(churnRate * 100)}% short-tenure exit rate.`
  else if (agingRoster) insight = 'Experienced, stable roster. Senior-heavy workforce may face succession pressure over the next decade.'
  else insight = `Moderate retention profile with mixed tenure distribution across ${alltime} all-time physicians.`

  const metricCards = [
    { label: 'Retention score', value: hasScore ? score!.toFixed(1) : '—', color: scoreColor(score), bg: scoreBg(score), sub: deltaChip(practice.retention_score_delta) },
    { label: 'Current roster', value: String(practice.latest_roster_size || 0), color: '#1a1a1a', bg: '#ffffff', sub: null },
    { label: 'All-time physicians', value: String(alltime), color: '#1a1a1a', bg: '#ffffff', sub: null },
    { label: 'Short exits', value: String(churn), color: churnRate > 0.4 ? '#C0392B' : '#1a1a1a', bg: churnRate > 0.4 ? '#fdf2f2' : '#ffffff', sub: null },
    { label: 'Veterans (8+ yrs)', value: String(practice.veteran_count || 0), color: (practice.veteran_count || 0) > 0 ? '#1A6B3A' : '#888', bg: (practice.veteran_count || 0) > 0 ? '#f0faf4' : '#ffffff', sub: null },
    { label: 'Median yrs since MD', value: `${practice.med_yrs_grad || 0} yrs`, color: '#1a1a1a', bg: '#ffffff', sub: null },
  ]

  function renderPhysicianCard(a: Affiliation) {
    const n = a.doctors?.physician_name || '—'
    const isOn = (a.status || '').toLowerCase() === 'on roster'
    const tenure = a.tenure_years || 0
    const tenureLabel = tenure >= 8 ? '8+ yrs' : tenure === 1 ? '1 yr' : `${tenure} yrs`
    const [fg2, bg2] = nameToColor(n)
    return (
      <div key={a.id} onClick={() => a.doctors?.id && router.push(`/physicians/${a.doctors.id}`)} style={{ background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 10, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, cursor: a.doctors?.id ? 'pointer' : 'default' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: bg2, color: fg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          {getInitials(n)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: isOn ? '#d4edda' : '#f5f5f5', color: isOn ? '#1A6B3A' : '#888' }}>{a.status}</span>
            <span style={{ fontSize: 12, color: '#888' }}>{a.first_seen_year_at_org} - {a.last_seen_year_at_org}</span>
            <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>{tenureLabel}</span>
            {a.grad_yr && <span style={{ fontSize: 12, color: '#aaa' }}>Med school grad: {a.grad_yr}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* Back + Favorite */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button onClick={() => router.back()} style={{ fontSize: 13, color: '#1C4A45', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Back to practices</button>
          <PracticeErrorReportModal
            practiceId={practice.id}
            snapshot={{
              practice_name: practice.practice_name,
              city_st: practice.city_st,
              phone: practice.phone,
              website: practice.website,
            }}
          />
        </div>
        <button
          onClick={toggleFavorite}
          disabled={favLoading || !profileId}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px',
            background: isFavorited ? '#f0faf4' : '#1C4A45',
            border: `1.5px solid ${isFavorited ? '#1A6B3A' : '#1C4A45'}`,
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            color: isFavorited ? '#1A6B3A' : 'white',
            cursor: (favLoading || !profileId) ? 'not-allowed' : 'pointer',
            opacity: (favLoading || !profileId) ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
        >
          {isFavorited ? '★ Saved' : '☆ Add to Favorites'}
        </button>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 32 }}>
        <div style={{ width: 88, height: 88, borderRadius: 14, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 600, flexShrink: 0, letterSpacing: '-0.5px' }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-serif" style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 8, lineHeight: 1.2 }}>{name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {practice.city_st && <div style={{ fontSize: 13, color: '#888' }}>{practice.city_st}</div>}
            {practice.phone && <a href={`tel:${practice.phone}`} style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}>{practice.phone}</a>}
            {practice.website && <a href={practice.website} target="_blank" rel="noopener" style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{practice.website}</a>}
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 24 }}>
        {metricCards.map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: '14px 12px', border: '0.5px solid rgba(0,0,0,0.07)' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 5, fontWeight: 500, letterSpacing: '.02em' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1.1, marginBottom: c.sub ? 6 : 0 }}>{c.value}</div>
            {c.sub && <div>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tenure bars */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Physician tenure distribution</div>
        {BUCKET_ORDER.map(b => {
          const pct = Math.round((buckets[b] / maxVal) * 100)
          return (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: '#888', width: 54, textAlign: 'right', flexShrink: 0 }}>{b}</span>
              <div style={{ flex: 1, background: '#ebebeb', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: barColors[b], height: '100%', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#555', width: 22 }}>{buckets[b]}</span>
            </div>
          )
        })}
      </div>

      {/* Insight */}
      <div style={{ borderLeft: `3px solid ${hasScore ? '#1C4A45' : '#ccc'}`, padding: '12px 16px', background: hasScore ? '#E8F0EF' : '#f9f9f9', borderRadius: '0 8px 8px 0', fontSize: 13, color: hasScore ? '#333' : '#888', lineHeight: 1.6, marginBottom: 24 }}>
        {insight}
      </div>

      {/* Score rows */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Scores vs 2019 baseline</div>
        {[
          { label: 'Experience Level', value: practice.experience_level, delta: practice.experience_level_delta, composite: false },
          { label: 'Retention Score', value: practice.retention_score, delta: practice.retention_score_delta, composite: true },
        ].map(r => (
          <div
            key={r.label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: 8, marginBottom: 4,
              background: r.composite ? (hasScore ? scoreBg(r.value) : '#f9f9f9') : '#ffffff',
              border: '0.5px solid rgba(0,0,0,0.06)',
            }}
          >
            <span style={{ fontSize: 13, color: '#444', fontWeight: r.composite ? 600 : 400 }}>{r.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: r.composite ? 18 : 15, fontWeight: r.composite ? 700 : 600, color: r.value !== null ? scoreColor(r.value) : '#aaa' }}>
                {r.value !== null ? r.value.toFixed(1) : '—'}
              </span>
              {deltaChip(r.delta)}
            </div>
          </div>
        ))}
      </div>

      {/* Job postings */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <button onClick={() => setJobsOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B3A', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Active Job Opportunities <span style={{ fontWeight: 400, color: '#888' }}>({jobs.length})</span>
            </span>
            <span style={{ fontSize: 14, color: '#aaa', transform: jobsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>
          {jobsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {jobs.map(j => (
                <div key={j.id} style={{ border: '1px solid #e8e8e8', borderRadius: 12, padding: '16px 20px', background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  {j.primary_location && <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>📍 {j.primary_location}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {(j.subspecialties_interest || []).map(s => badge(s, '#1A6B3A', '#D4EDDA'))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {j.practice_setting && badge(j.practice_setting)}
                    {j.clinical_surgical_mix && badge(j.clinical_surgical_mix, '#7B3FA0', '#EEE0F8')}
                    {j.ideal_hiring_timeline && badge(`Timeline: ${j.ideal_hiring_timeline}`, '#C8640A', '#FFF0E0')}
                  </div>
                  {j.additional_details && <div style={{ marginTop: 10, fontSize: 13, color: '#555', lineHeight: 1.5, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>{j.additional_details}</div>}
                  {(j.point_of_contact || j.email || j.phone) && (
                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                      {j.point_of_contact && <span style={{ fontSize: 13, fontWeight: 500 }}>👤 {j.point_of_contact}</span>}
                      {j.email && <a href={`mailto:${j.email}`} style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}>✉️ {j.email}</a>}
                      {j.phone && <a href={`tel:${j.phone}`} style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}>📞 {j.phone}</a>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Physicians */}
      <div>
        <p style={{ fontSize: 11, color: '#999', lineHeight: 1.5, margin: '0 0 12px' }}>
          Physician rosters reflect the latest CMS data and may lag recent departures or additions.
        </p>
        {onRoster.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1A6B3A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Current Physicians ({onRoster.length})
            </div>
            {onRoster.map(renderPhysicianCard)}
          </>
        )}

        {notRoster.length > 0 && (
          <div style={{ marginTop: onRoster.length ? 20 : 0 }}>
            <button onClick={() => setShowFormer(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.06em' }}>Former Physicians ({notRoster.length})</span>
              <span style={{ fontSize: 14, color: '#aaa', transform: showFormer ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {showFormer && notRoster.map(renderPhysicianCard)}
          </div>
        )}
      </div>
    </div>
  )
}