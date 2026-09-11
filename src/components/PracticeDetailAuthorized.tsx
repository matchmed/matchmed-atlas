'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { invalidateFavoritesCache } from '@/lib/favorites-cache'
import { syncPracticeListCacheFromDetail } from '@/lib/practices-cache'
import posthog from 'posthog-js'
import {
  formatCityState,
  formatPracticeLocationAddress,
  formatPracticeLocationSummary,
  normalizePracticeLocation,
  type PracticeLocation,
} from '@/lib/practice-locations'
import { nameToColor, getInitials, scoreColor } from '@/lib/utils'
import { resolvePracticePublicName } from '@/lib/practice-display-name'
import PracticeErrorReportModal from '@/components/PracticeErrorReportModal'
import PracticeLocationsDisclaimer from '@/components/PracticeLocationsDisclaimer'
import PublicEmployerContext from '@/components/PublicEmployerContext'
import EmployerPhysicianReadySections from '@/components/EmployerPhysicianReadySections'
import PublicPracticeLocations from '@/components/PublicPracticeLocations'
import PracticeVerifiedBadge from '@/components/PracticeVerifiedBadge'
import EmployerRecruitingContact from '@/components/EmployerRecruitingContact'
import ConnectPracticeCta from '@/components/ConnectPracticeCta'
import RosterProvenanceNotes from '@/components/RosterProvenanceNotes'
import {
  publicGetEmployerPracticeOverlay,
  resolveEmployerLogoUrl,
  type EmployerPracticeOverlay,
} from '@/lib/public-search'
import { assertionsByDoctorId, formatRosterReviewedLabel } from '@/lib/employer-overlay'
import {
  EXPERIENCE_LEVEL_CAPTION,
  SHORTER_OBSERVED_TENURE_LABEL,
  SHORTER_OBSERVED_TENURE_NOTE,
  observedCmsYearsLabel,
  observedYearRangeLabel,
  ownershipLabel,
} from '@/lib/practice-detail-presentation'
import { formatOpportunityCompensation, opportunityHorizonLabel } from '@/lib/opportunity-labels'

/** Session-scoped guard against Strict Mode / remount duplicate practice_viewed events. */
const viewedPracticeIds = new Set<string>()

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


const TENURE_TOP_BUCKET = '8+ observed yrs'
const TENURE_TOP_BUCKET_TOOLTIP =
  'Affiliations are observed beginning in 2019. Physicians already affiliated at the start of the data window may have longer actual tenure.'

export default function PracticeDetailAuthorized() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [practice, setPractice] = useState<Practice | null>(null)
  const [locations, setLocations] = useState<PracticeLocation[]>([])
  const [locationsExpanded, setLocationsExpanded] = useState(false)
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [loading, setLoading] = useState(true)
  const [showFormer, setShowFormer] = useState(true)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [favId, setFavId] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [employerOverlay, setEmployerOverlay] = useState<EmployerPracticeOverlay | null>(null)
  const [employerLogoUrl, setEmployerLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      setLoading(true)
      setLocationsExpanded(false)
      const [practiceRes, locationsRes, affilRes, overlayRes] = await Promise.all([
        supabase.from('practices').select('*').eq('id', id).single(),
        supabase
          .from('practice_locations')
          .select('id,practice_id,address,city,state,zip,latitude,longitude,doctor_count,rank_by_doctors')
          .eq('practice_id', id),
        supabase.from('affiliations').select('id,npi,status,first_seen_year_at_org,last_seen_year_at_org,tenure_years,grad_yr,doctors(id,physician_name,npi)').eq('practice_id', id).order('last_seen_year_at_org', { ascending: false }),
        publicGetEmployerPracticeOverlay(supabase, id),
      ])
      if (practiceRes.data) {
        setPractice(practiceRes.data)
        void syncPracticeListCacheFromDetail(practiceRes.data)
        if (!viewedPracticeIds.has(practiceRes.data.id)) {
          viewedPracticeIds.add(practiceRes.data.id)
          posthog.capture('practice_viewed', {
            practice_id: practiceRes.data.id,
            practice_name: practiceRes.data.practice_name,
            retention_score: practiceRes.data.retention_score,
          })
        }
      }
      if (locationsRes.data) {
        const normalized = (locationsRes.data as Record<string, unknown>[])
          .map(normalizePracticeLocation)
          .filter((row): row is PracticeLocation => row !== null)
          .sort((a, b) => {
            const aCount = a.doctor_count ?? -1
            const bCount = b.doctor_count ?? -1
            if (bCount !== aCount) return bCount - aCount
            const aRank = a.rank_by_doctors ?? Number.POSITIVE_INFINITY
            const bRank = b.rank_by_doctors ?? Number.POSITIVE_INFINITY
            return aRank - bRank
          })
        setLocations(normalized)
      } else {
        setLocations([])
      }
      if (affilRes.data) setAffiliations(affilRes.data as any)
      else setAffiliations([])

      if (overlayRes.data?.visible) {
        setEmployerOverlay(overlayRes.data)
        const logoPath = overlayRes.data.profile?.logo_storage_path
        if (logoPath) {
          const url = await resolveEmployerLogoUrl(supabase, logoPath)
          setEmployerLogoUrl(url)
        } else {
          setEmployerLogoUrl(null)
        }
      } else {
        setEmployerOverlay(null)
        setEmployerLogoUrl(null)
      }

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
      const { error } = await supabase.from('shortlists').delete().eq('id', favId)
      if (!error) {
        setIsFavorited(false)
        setFavId(null)
        posthog.capture('practice_unfavorited', { practice_id: id, source: 'detail' })
        invalidateFavoritesCache()
      }
    } else {
      const { data, error } = await supabase.from('shortlists').insert({
        physician_id: profileId,
        practice_id: id,
      }).select('id').single()
      if (!error && data) {
        setIsFavorited(true)
        setFavId(data.id)
        posthog.capture('practice_favorited', { practice_id: id, source: 'detail' })
        invalidateFavoritesCache()
      }
    }
    setFavLoading(false)
  }

  if (loading) return <div className="loading-bar"><div className="loading-bar-inner" /></div>
  if (!practice) return <div style={{ padding: 40, color: '#aaa', textAlign: 'center' }}>Practice not found.</div>

  const name = resolvePracticePublicName(
    practice.practice_name,
    employerOverlay?.profile?.public_display_name,
    'Unknown Practice',
  )
  const [fg, bg] = nameToColor(name)
  const initials = getInitials(name)

  // ── FACTS (raw data from DB) ──────────────────────────────────────────────
  const facts = {
    hasScore: practice.retention_score !== null,
    score: practice.retention_score,
    alltime: practice.total_physicians_all_time || affiliations.length,
    churn: practice.short_tenure_departure_count || 0,
    churnRate: 0,
    rosterSize: practice.latest_roster_size || 0,
  }
  facts.churnRate = facts.alltime > 0 ? facts.churn / facts.alltime : 0

  const { hasScore, score, alltime, churn, churnRate, rosterSize } = facts

  const onRoster = affiliations.filter(a => (a.status || '').toLowerCase() === 'on roster')
  const notRoster = affiliations.filter(a => (a.status || '').toLowerCase() !== 'on roster')
  const employerAssertionMap = assertionsByDoctorId(employerOverlay?.roster_assertions)

  const displayPhone = employerOverlay?.profile?.primary_phone || practice.phone
  const displayWebsite = employerOverlay?.profile?.website || practice.website
  const hasEmployerOverlay = Boolean(employerOverlay?.visible)
  const rosterReviewedLabel = formatRosterReviewedLabel(
    employerOverlay?.profile?.roster_last_reviewed_at,
  )
  const publicLocations = locations.map(loc => ({
    id: loc.id,
    address: loc.address,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
  }))

  const BUCKET_ORDER = [TENURE_TOP_BUCKET, '6–7 observed yrs', '4–5 observed yrs', '2–3 observed yrs', '0–1 observed yrs'] as const
  const buckets = {
    [TENURE_TOP_BUCKET]: practice.tenure_8_plus || 0,
    '6–7 observed yrs': practice.tenure_6_7 || 0,
    '4–5 observed yrs': practice.tenure_4_5 || 0,
    '2–3 observed yrs': practice.tenure_2_3 || 0,
    '0–1 observed yrs': practice.tenure_0_1 || 0,
  }
  const maxVal = Math.max(...Object.values(buckets), 1)
  const barColors = {
    [TENURE_TOP_BUCKET]: '#1A6B3A',
    '6–7 observed yrs': '#4CAF50',
    '4–5 observed yrs': '#1C4A45',
    '2–3 observed yrs': '#6a9e98',
    '0–1 observed yrs': '#d0d0d0',
  }

  // ── OBSERVATIONS (boolean pattern flags) ──────────────────────────────────
  const observations = {
    topHeavy: (buckets[TENURE_TOP_BUCKET] + buckets['6–7 observed yrs']) > (buckets['0–1 observed yrs'] + buckets['2–3 observed yrs']),
    significantReduction: rosterSize === 1 && alltime > 3,
    highChurnRate: churnRate > 0.4,
  }
  const agingRoster = (practice.med_yrs_grad || 0) > 30 && churnRate < 0.2

  // ── NARRATIVE (factual insight text + assumptions + confidence) ───────────
  type InsightNarrative = {
    text: string
    assumptions: string[]
    confidence: 'high'
  }

  let insight: InsightNarrative
  if (!hasScore || alltime < 2) {
    insight = {
      text: 'Fewer than 2 all-time physicians observed. Insufficient historical data for pattern analysis.',
      assumptions: [],
      confidence: 'high',
    }
  } else if (observations.significantReduction) {
    insight = {
      text: `Currently ${rosterSize} physician${rosterSize === 1 ? '' : 's'}; ${alltime} all-time. Significant roster reduction observed.`,
      assumptions: [
        'Reduction is factual and measurable from CMS roster counts.',
        'Could reflect natural transition, acquisition, consolidation, or retirement.',
      ],
      confidence: 'high',
    }
  } else if ((score || 0) >= 85 && observations.topHeavy) {
    insight = {
      text: `${buckets[TENURE_TOP_BUCKET]} of ${alltime} all-time physicians reached 8+ years. Concentrated long-tenure workforce.`,
      assumptions: [
        'Long tenure may correlate with historical stability.',
        'Could also reflect limited growth, geographic constraints, or market conditions.',
      ],
      confidence: 'high',
    }
  } else if ((score || 0) >= 70) {
    insight = {
      text: `Retention score ${score!.toFixed(1)}. ${churn} shorter observed tenure${churn !== 1 ? 's' : ''} out of ${alltime} all-time physicians.`,
      assumptions: [
        'Retention score summarizes observed stay patterns, not practice quality.',
        'Shorter-observed-tenure counts depend on CMS affiliation completeness and lag.',
      ],
      confidence: 'high',
    }
  } else if (observations.highChurnRate) {
    insight = {
      text: `${churn} of ${alltime} physicians left within 4 observed years — ${Math.round(churnRate * 100)}% shorter observed tenure rate. This describes the observed window, not why anyone left.`,
      assumptions: [
        'High exit rate may reflect a challenging environment.',
        'Could also reflect early-career rotation, competitive market, or voluntary transitions.',
      ],
      confidence: 'high',
    }
  } else if (agingRoster) {
    insight = {
      text: `Median graduation ${practice.med_yrs_grad} years ago. Aging roster pattern.`,
      assumptions: [
        'Median years since graduation describes roster age, not future outcomes.',
        'Senior physicians may remain active without an imminent transition.',
      ],
      confidence: 'high',
    }
  } else {
    insight = {
      text: `Mixed tenure distribution across ${alltime} all-time physicians.`,
      assumptions: [
        'Mixed tenure does not imply a single dominant pattern.',
        'Sample size and CMS reporting lag can affect interpretation.',
      ],
      confidence: 'high',
    }
  }

  const claimedReady = Boolean(employerOverlay?.visible && employerOverlay.physician_ready)
  const primaryOpportunity = employerOverlay?.recruiting_outlook?.opportunities?.[0]
  const ownership = claimedReady ? employerOverlay?.ownership : null
  const hiringLine = primaryOpportunity
    ? `${opportunityHorizonLabel(primaryOpportunity.hiring_horizon)}: ${primaryOpportunity.clinical_focus}`
    : null
  const hiringComp = primaryOpportunity
    ? formatOpportunityCompensation(
        primaryOpportunity.base_compensation_min_usd,
        primaryOpportunity.base_compensation_max_usd,
        primaryOpportunity.base_compensation_max_is_open_ended,
      )
    : null

  function renderPhysicianCard(a: Affiliation) {
    const n = a.doctors?.physician_name || '—'
    const isOn = (a.status || '').toLowerCase() === 'on roster'
    const rangeLabel = observedYearRangeLabel(a.first_seen_year_at_org, a.last_seen_year_at_org)
    const tenureLabel = observedCmsYearsLabel(a.tenure_years)
    const [fg2, bg2] = nameToColor(n)
    const doctorId = a.doctors?.id
    const employerAssertion = doctorId ? employerAssertionMap.get(doctorId) : undefined
    return (
      <div key={a.id} onClick={() => doctorId && router.push(`/physicians/${doctorId}`)} style={{ background: '#ffffff', border: '1px solid #DDD8D0', borderRadius: 10, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, cursor: doctorId ? 'pointer' : 'default' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: bg2, color: fg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          {getInitials(n)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</div>
          {hasEmployerOverlay ? (
            <RosterProvenanceNotes
              cmsStatus={a.status}
              employerAssertion={employerAssertion?.assertion}
            />
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: isOn ? '#d4edda' : '#f5f5f5', color: isOn ? '#1A6B3A' : '#888' }}>{a.status}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            {rangeLabel && <span style={{ fontSize: 12, color: '#888' }}>{rangeLabel}</span>}
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
              city_st:
                formatPracticeLocationSummary(locations) ||
                formatCityState(locations[0]?.city ?? null, locations[0]?.state ?? null) ||
                practice.city_st,
              phone: practice.phone,
              website: practice.website,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <ConnectPracticeCta practiceId={practice.id} source="practice_detail" />
          <button
            onClick={toggleFavorite}
            disabled={favLoading || !profileId}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
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
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 32 }}>
        {employerLogoUrl ? (
          <div style={{ width: 88, height: 88, borderRadius: 14, overflow: 'hidden', flexShrink: 0, border: '1px solid #DDD8D0', background: '#fff' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={employerLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ width: 88, height: 88, borderRadius: 14, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 600, flexShrink: 0, letterSpacing: '-0.5px' }}>
            {initials}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div className="font-serif" style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{name}</div>
            {hasEmployerOverlay && <PracticeVerifiedBadge />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!hasEmployerOverlay && locations.length > 0 && (
              locations.length === 1 ? (
                <div style={{ fontSize: 13, color: '#888', display: 'inline' }}>
                  {formatPracticeLocationAddress(locations[0]) || formatPracticeLocationSummary(locations)}
                  {' '}
                  <PracticeLocationsDisclaimer />
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#888' }}>
                    <button
                      type="button"
                      onClick={() => setLocationsExpanded(open => !open)}
                      aria-expanded={locationsExpanded}
                      style={{
                        fontSize: 13,
                        color: '#888',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {formatPracticeLocationSummary(locations)}
                      <span style={{ marginLeft: 6, color: '#1C4A45' }}>
                        {locationsExpanded ? 'Hide' : 'Show all'}
                      </span>
                    </button>
                    {' '}
                    <PracticeLocationsDisclaimer />
                  </div>
                  {locationsExpanded && (
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: '12px 0 2px',
                        padding: 0,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      {locations.map(loc => (
                        <li
                          key={loc.id}
                          style={{ fontSize: 13, color: '#666', lineHeight: 1.4 }}
                        >
                          {formatPracticeLocationAddress(loc) || 'Location'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            )}
            {claimedReady && practice.city_st && (
              <div style={{ fontSize: 13, color: '#666' }}>{practice.city_st}</div>
            )}
            {!claimedReady && displayPhone && <a href={`tel:${displayPhone}`} style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}>{displayPhone}</a>}
            {!claimedReady && displayWebsite && <a href={displayWebsite.startsWith('http') ? displayWebsite : `https://${displayWebsite}`} target="_blank" rel="noopener" style={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{displayWebsite}</a>}
          </div>
        </div>
      </div>

      {claimedReady && (ownership || hiringLine) && (
        <section className="practice-current-summary" aria-label="Current practice and recruiting summary">
          {ownership && (
            <p className="practice-current-summary-primary">
              {ownershipLabel(ownership.structure, ownership.other_text)}
            </p>
          )}
          {hiringLine && <p className="practice-current-summary-primary">{hiringLine}</p>}
          {hiringComp && <p className="practice-current-summary-meta">{hiringComp}</p>}
          <p className="public-profile-muted">
            {employerOverlay?.attribution_label ?? 'Practice-reported'}
          </p>
        </section>
      )}

      {claimedReady && (
        <EmployerPhysicianReadySections
          overlay={employerOverlay}
          practiceId={practice.id}
          showConnect
          part="opportunities"
        />
      )}

      <section className="practice-history-section" aria-labelledby="physician-history-heading">
        <h2 id="physician-history-heading" className="practice-history-heading">Physician retention history</h2>
        <ul className="practice-history-facts">
          <li>{alltime} physicians observed since 2019</li>
          <li>{rosterSize} on the current roster</li>
          <li>{practice.veteran_count || 0} with 8+ CMS years observed</li>
          <li>
            {churn} {SHORTER_OBSERVED_TENURE_LABEL.toLowerCase()}
            <span className="practice-history-note"> · {SHORTER_OBSERVED_TENURE_NOTE}</span>
          </li>
        </ul>

      <div className="practice-tenure-chart" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Observed CMS years among all physicians since 2019</div>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.45, margin: '0 0 12px' }}>
          Counts inclusive calendar years on the CMS roster, not continuous elapsed employment. Includes {alltime} physicians observed since 2019, both current and former.
        </p>
        {BUCKET_ORDER.map(b => {
          const pct = Math.round((buckets[b] / maxVal) * 100)
          const isTopBucket = b === TENURE_TOP_BUCKET
          return (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span
                title={isTopBucket ? TENURE_TOP_BUCKET_TOOLTIP : undefined}
                className="practice-tenure-bucket"
                style={{ cursor: isTopBucket ? 'help' : undefined }}
              >
                {b}
              </span>
              <div style={{ flex: 1, background: '#ebebeb', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: barColors[b], height: '100%', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#555', width: 22 }}>{buckets[b]}</span>
            </div>
          )
        })}
      </div>

        <p className="practice-score-line">
          Retention Score:{' '}
          <span style={{ color: scoreColor(score), fontWeight: 700 }}>
            {hasScore ? `${score!.toFixed(1)} / 100` : '—'}
          </span>
          {' · '}
          <Link href="/scoring-methodology">How this is calculated</Link>
        </p>
        <p className="practice-score-note">Higher scores reflect greater observed physician retention. Claiming a profile does not change this score.</p>
        {practice.experience_level !== null && (
          <p className="practice-score-line">
            Experience Level: <strong>{practice.experience_level.toFixed(1)}</strong>
            <span className="practice-score-note"> {EXPERIENCE_LEVEL_CAPTION}</span>
          </p>
        )}

      <div style={{ borderLeft: `3px solid ${hasScore ? '#1C4A45' : '#ccc'}`, padding: '12px 16px', background: hasScore ? '#E8F0EF' : '#f9f9f9', borderRadius: '0 8px 8px 0', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: hasScore ? '#333' : '#888', lineHeight: 1.6, margin: 0, marginBottom: insight.assumptions.length ? 8 : 0 }}>
          {insight.text}
        </p>
        {insight.assumptions.length > 0 && (
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 12, color: '#1C4A45', cursor: 'pointer', userSelect: 'none', listStyle: 'none' }}>
              Assumptions ({insight.assumptions.length})
            </summary>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#555', lineHeight: 1.55 }}>
              {insight.assumptions.map(a => (
                <li key={a} style={{ marginBottom: 4 }}>{a}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      </section>

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
            {rosterReviewedLabel && (
              <p className="roster-reviewed-label" style={{ marginTop: -4, marginBottom: 10 }}>
                {rosterReviewedLabel}
              </p>
            )}
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

      {employerOverlay && (
        <div style={{ marginTop: 32 }}>
          <PublicEmployerContext
            profile={employerOverlay.profile}
            logoUrl={null}
          />
          <EmployerPhysicianReadySections
            overlay={employerOverlay}
            practiceId={practice.id}
            part="supporting"
          />
          {(employerOverlay.profile?.recruiting_contact_name
            || employerOverlay.profile?.recruiting_email
            || employerOverlay.profile?.recruiting_phone
            || employerOverlay.profile?.careers_url
            || displayPhone
            || displayWebsite) && (
            <section className="public-profile-section">
              <h2 className="public-profile-section-label">Recruiting contact</h2>
              <div className="public-profile-card">
                <EmployerRecruitingContact
                  contactName={employerOverlay.profile?.recruiting_contact_name}
                  email={employerOverlay.profile?.recruiting_email}
                  phone={employerOverlay.profile?.recruiting_phone}
                  careersUrl={employerOverlay.profile?.careers_url}
                  linkStyle={{ fontSize: 13, color: '#1C4A45', textDecoration: 'none' }}
                />
                {(displayPhone || displayWebsite) && (
                  <p className="public-profile-muted" style={{ marginTop: 10 }}>
                    {displayPhone && <a href={`tel:${displayPhone}`} style={{ color: '#1C4A45' }}>{displayPhone}</a>}
                    {displayPhone && displayWebsite ? ' · ' : null}
                    {displayWebsite && (
                      <a href={displayWebsite.startsWith('http') ? displayWebsite : `https://${displayWebsite}`} target="_blank" rel="noopener" style={{ color: '#1C4A45' }}>
                        Website
                      </a>
                    )}
                  </p>
                )}
                <p className="public-profile-muted" style={{ marginTop: 8 }}>
                  Contact details are shown as published by the practice. Connect remains a separate request.
                </p>
              </div>
            </section>
          )}
          <PublicPracticeLocations
            locations={publicLocations}
            employerLocations={employerOverlay.locations}
          />
          <EmployerPhysicianReadySections
            overlay={employerOverlay}
            practiceId={practice.id}
            part="technology"
          />
        </div>
      )}
    </div>
  )
}