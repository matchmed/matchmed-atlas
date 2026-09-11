import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import PracticeDetailAuthorized from '@/components/PracticeDetailAuthorized'
import {
  normalizeEmployerPracticeOverlay,
  resolveEmployerLogoUrl,
} from '@/lib/public-search'
import { normalizePracticeLocation, type PracticeLocation } from '@/lib/practice-locations'

export const metadata: Metadata = {
  title: 'Practice preview · Atlas',
  robots: { index: false, follow: false },
}

const EMPLOYERS_PUBLIC_URL =
  process.env.NEXT_PUBLIC_EMPLOYERS_URL?.replace(/\/$/, '') || 'https://employers.matchmed.app'

type PreviewPayload = {
  practice?: Record<string, unknown> | null
  affiliations?: unknown
  locations?: unknown
  overlay?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseAffiliations(raw: unknown) {
  return asArray(raw)
    .map((row) => {
      const r = asRecord(row)
      if (!r || typeof r.id !== 'string') return null
      const doctorsRaw = asRecord(r.doctors)
      return {
        id: r.id,
        npi: typeof r.npi === 'string' ? r.npi : '',
        status: typeof r.status === 'string' ? r.status : null,
        first_seen_year_at_org:
          typeof r.first_seen_year_at_org === 'number' ? r.first_seen_year_at_org : null,
        last_seen_year_at_org:
          typeof r.last_seen_year_at_org === 'number' ? r.last_seen_year_at_org : null,
        tenure_years: typeof r.tenure_years === 'number' ? r.tenure_years : null,
        grad_yr: typeof r.grad_yr === 'number' ? r.grad_yr : null,
        doctors: doctorsRaw
          ? {
              id: typeof doctorsRaw.id === 'string' ? doctorsRaw.id : '',
              physician_name:
                typeof doctorsRaw.physician_name === 'string' ? doctorsRaw.physician_name : null,
              npi: typeof doctorsRaw.npi === 'string' ? doctorsRaw.npi : '',
            }
          : null,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
}

function parseLocations(raw: unknown): PracticeLocation[] {
  return asArray(raw)
    .map((row) => normalizePracticeLocation(row as Record<string, unknown>))
    .filter((row): row is PracticeLocation => row !== null)
    .sort((a, b) => {
      const aCount = a.doctor_count ?? -1
      const bCount = b.doctor_count ?? -1
      if (bCount !== aCount) return bCount - aCount
      const aRank = a.rank_by_doctors ?? Number.POSITIVE_INFINITY
      const bRank = b.rank_by_doctors ?? Number.POSITIVE_INFINITY
      return aRank - bRank
    })
}

export default async function EmployerPracticePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token } = await searchParams

  if (!token?.trim()) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Preview unavailable</h1>
        <p style={{ marginTop: 8, color: '#666' }}>This preview link is missing a valid token.</p>
        <Link href={`${EMPLOYERS_PUBLIC_URL}/practices/${id}`} style={{ color: '#1C4A45' }}>
          Back to employer profile
        </Link>
      </div>
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('employer_fetch_practice_preview', {
    p_token: token,
    p_practice_id: id,
  })

  if (error || !data) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Preview unavailable</h1>
        <p style={{ marginTop: 8, color: '#666' }}>
          This preview link expired or you are not authorized for this practice.
        </p>
        <Link href={`${EMPLOYERS_PUBLIC_URL}/practices/${id}`} style={{ color: '#1C4A45' }}>
          Back to employer profile
        </Link>
      </div>
    )
  }

  const payload = data as PreviewPayload
  const practice = asRecord(payload.practice)
  if (!practice || typeof practice.id !== 'string') {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Practice not found</h1>
      </div>
    )
  }

  const overlay = normalizeEmployerPracticeOverlay(payload.overlay)
  const visibleOverlay = overlay?.visible ? overlay : null
  const logoUrl = await resolveEmployerLogoUrl(
    supabase,
    visibleOverlay?.profile?.logo_storage_path,
  )

  return (
    <PracticeDetailAuthorized
      employerPreview={{
        practice: {
          id: practice.id,
          practice_name: typeof practice.practice_name === 'string' ? practice.practice_name : null,
          city_st: typeof practice.city_st === 'string' ? practice.city_st : null,
          phone: typeof practice.phone === 'string' ? practice.phone : null,
          website: typeof practice.website === 'string' ? practice.website : null,
          retention_score:
            typeof practice.retention_score === 'number' ? practice.retention_score : null,
          retention_score_delta:
            typeof practice.retention_score_delta === 'number'
              ? practice.retention_score_delta
              : null,
          experience_level:
            typeof practice.experience_level === 'number' ? practice.experience_level : null,
          experience_level_delta:
            typeof practice.experience_level_delta === 'number'
              ? practice.experience_level_delta
              : null,
          latest_roster_size:
            typeof practice.latest_roster_size === 'number' ? practice.latest_roster_size : null,
          total_physicians_all_time:
            typeof practice.total_physicians_all_time === 'number'
              ? practice.total_physicians_all_time
              : null,
          short_tenure_departure_count:
            typeof practice.short_tenure_departure_count === 'number'
              ? practice.short_tenure_departure_count
              : null,
          med_yrs_grad: typeof practice.med_yrs_grad === 'number' ? practice.med_yrs_grad : null,
          veteran_count: typeof practice.veteran_count === 'number' ? practice.veteran_count : null,
          tenure_0_1: typeof practice.tenure_0_1 === 'number' ? practice.tenure_0_1 : null,
          tenure_2_3: typeof practice.tenure_2_3 === 'number' ? practice.tenure_2_3 : null,
          tenure_4_5: typeof practice.tenure_4_5 === 'number' ? practice.tenure_4_5 : null,
          tenure_6_7: typeof practice.tenure_6_7 === 'number' ? practice.tenure_6_7 : null,
          tenure_8_plus: typeof practice.tenure_8_plus === 'number' ? practice.tenure_8_plus : null,
          org_pac_id: typeof practice.org_pac_id === 'string' ? practice.org_pac_id : null,
        },
        affiliations: parseAffiliations(payload.affiliations),
        locations: parseLocations(payload.locations),
        overlay: visibleOverlay,
        logoUrl,
        backHref: `${EMPLOYERS_PUBLIC_URL}/practices/${id}`,
      }}
    />
  )
}
