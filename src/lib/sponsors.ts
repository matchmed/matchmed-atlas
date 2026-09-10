import { createClient } from '@/lib/supabase'
import {
  defaultSponsorDisclosure,
  isSponsorSectionType,
  type SponsorContentItem,
} from '@/lib/sponsor-labels'

export type { SponsorContentItem }
export { groupSponsorSections } from '@/lib/sponsor-labels'

export type ActiveSponsorSummary = {
  slug: string
  display_label: string
  short_description: string | null
  logo_url: string | null
  sort_order: number
}

export type SponsorPage = {
  slug: string
  display_label: string
  short_description: string | null
  logo_url: string | null
  disclosure_text: string
  sections: SponsorContentItem[]
}

function asSponsors(data: unknown): ActiveSponsorSummary[] {
  if (!Array.isArray(data)) return []
  return data
    .map((row) => {
      const r = row as Record<string, unknown>
      const slug = typeof r.slug === 'string' ? r.slug : ''
      const display_label = typeof r.display_label === 'string' ? r.display_label : ''
      if (!slug || !display_label) return null
      return {
        slug,
        display_label,
        short_description: (r.short_description as string | null) ?? null,
        logo_url: (r.logo_url as string | null) ?? null,
        sort_order: typeof r.sort_order === 'number' ? r.sort_order : 100,
      } satisfies ActiveSponsorSummary
    })
    .filter((x): x is ActiveSponsorSummary => x !== null)
}

function asSponsorPage(data: unknown): SponsorPage | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const r = data as Record<string, unknown>
  const slug = typeof r.slug === 'string' ? r.slug : ''
  const display_label = typeof r.display_label === 'string' ? r.display_label : ''
  if (!slug || !display_label) return null

  const rawSections = Array.isArray(r.sections) ? r.sections : []
  const sections: SponsorContentItem[] = []
  for (const item of rawSections) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const section_type = typeof s.section_type === 'string' ? s.section_type : ''
    const title = typeof s.title === 'string' ? s.title : ''
    if (!isSponsorSectionType(section_type) || !title) continue
    sections.push({
      section_type,
      title,
      description: (s.description as string | null) ?? null,
      url: (s.url as string | null) ?? null,
      event_date: s.event_date == null ? null : String(s.event_date),
      status_label: (s.status_label as string | null) ?? null,
      cta_label: (s.cta_label as string | null) ?? null,
      sort_order: typeof s.sort_order === 'number' ? s.sort_order : 100,
      image_url: typeof s.image_url === 'string' && s.image_url.trim() ? s.image_url : null,
      image_alt: typeof s.image_alt === 'string' && s.image_alt.trim() ? s.image_alt : null,
    })
  }

  return {
    slug,
    display_label,
    short_description: (r.short_description as string | null) ?? null,
    logo_url: (r.logo_url as string | null) ?? null,
    disclosure_text:
      typeof r.disclosure_text === 'string' && r.disclosure_text.trim()
        ? r.disclosure_text
        : defaultSponsorDisclosure(display_label),
    sections,
  }
}

function asSlugSet(data: unknown): Set<string> {
  if (!Array.isArray(data)) return new Set()
  return new Set(data.filter((s): s is string => typeof s === 'string' && s.length > 0))
}

export async function fetchActiveSponsors(): Promise<{
  data: ActiveSponsorSummary[]
  error: string | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_active_atlas_sponsors')
  if (error) return { data: [], error: error.message }
  return { data: asSponsors(data), error: null }
}

export async function fetchSponsorPage(slug: string): Promise<{
  data: SponsorPage | null
  error: string | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_atlas_sponsor_page', { p_slug: slug })
  if (error) return { data: null, error: error.message }
  return { data: asSponsorPage(data), error: null }
}

export async function fetchActiveSponsorSlugs(): Promise<{
  data: Set<string>
  error: string | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_active_sponsor_slugs')
  if (error) return { data: new Set(), error: error.message }
  return { data: asSlugSet(data), error: null }
}
