import { createClient } from '@/lib/supabase-server'
import {
  defaultSponsorDisclosure,
  isSponsorSectionType,
  type SponsorContentItem,
} from '@/lib/sponsor-labels'
import type { ActiveSponsorSummary, SponsorPage } from '@/lib/sponsors'

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

export async function fetchActiveSponsorsServer(): Promise<{
  data: ActiveSponsorSummary[]
  error: string | null
}> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_active_atlas_sponsors')
  if (error) return { data: [], error: error.message }
  return { data: asSponsors(data), error: null }
}

export async function fetchSponsorPageServer(slug: string): Promise<{
  data: SponsorPage | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_atlas_sponsor_page', { p_slug: slug })
  if (error) return { data: null, error: error.message }
  return { data: asSponsorPage(data), error: null }
}
