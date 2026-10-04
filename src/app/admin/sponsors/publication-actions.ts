'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import {
  loadBriefCandidate,
  loadLibraryCandidate,
  runTrustedPublication,
  type PublicationKind,
  type PublicationMode,
  type PublicationReader,
  type PublicationResult,
} from '@/lib/sponsor-publication'

function publicationId(formData: FormData): string | null {
  const id = String(formData.get('id') ?? '')
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

async function publishFromForm(kind: PublicationKind, mode: PublicationMode, formData: FormData): Promise<PublicationResult> {
  const id = publicationId(formData)
  if (!id) return { ok: false, error: 'Publication blocked. The content id is not valid.' }
  const slug = String(formData.get('slug') ?? '')
  const supabase = await createClient()
  const result = await runTrustedPublication({
    mode,
    kind,
    id,
    getUser: async () => {
      const { data } = await supabase.auth.getUser()
      return data.user ? { id: data.user.id } : null
    },
    isAtlasAdmin: async () => {
      const { data, error } = await supabase.rpc('is_atlas_admin')
      return !error && data === true
    },
    loadCandidate: (candidateId) =>
      kind === 'library'
        ? loadLibraryCandidate(supabase as unknown as PublicationReader, candidateId)
        : loadBriefCandidate(supabase, candidateId),
    publish: async (call) => {
      const { error } =
        call.rpc === 'admin_publish_content'
          ? await supabase.rpc('admin_publish_content', { p_content_id: call.id })
          : await supabase.rpc('admin_publish_brief', { p_revision_id: call.id, p_sharing: call.sharing === true })
      return error ? 'rejected' : null
    },
  })
  if (result.ok && /^[a-z0-9-]+$/.test(slug)) revalidatePath(`/admin/sponsors/${slug}`)
  return result
}

export async function saveDraftLibraryUrl(_prev: PublicationResult | null, formData: FormData): Promise<PublicationResult> {
  const id = publicationId(formData)
  const url = String(formData.get('url') ?? '').trim()
  if (!id || !url) return { ok: false, error: 'The draft destination was not saved.' }
  const slug = String(formData.get('slug') ?? '')
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { ok: false, error: 'Sign in as a MatchMed administrator to publish.' }
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_atlas_admin')
  if (adminError || isAdmin !== true) return { ok: false, error: 'Atlas administrator access is required to publish.' }
  const { data, error } = await supabase
    .from('sponsor_vendor_content')
    .update({ url })
    .eq('id', id)
    .eq('publication_state', 'draft')
    .is('company_approved_at', null)
    .is('matchmed_approved_at', null)
    .select('id')
  if (error || !data?.length) {
    return { ok: false, error: 'The draft destination was not saved. Use an HTTPS URL without credentials or private context.' }
  }
  if (/^[a-z0-9-]+$/.test(slug)) revalidatePath(`/admin/sponsors/${slug}`)
  return { ok: true, message: 'Draft destination saved. It is not published.' }
}

export async function publishLibraryAction(_prev: PublicationResult | null, formData: FormData) {
  return publishFromForm('library', 'publish', formData)
}

export async function scheduleLibraryAction(_prev: PublicationResult | null, formData: FormData) {
  return publishFromForm('library', 'schedule', formData)
}

export async function publishBriefAction(_prev: PublicationResult | null, formData: FormData) {
  return publishFromForm('brief', 'publish', formData)
}

export async function scheduleBriefAction(_prev: PublicationResult | null, formData: FormData) {
  return publishFromForm('brief', 'schedule', formData)
}
