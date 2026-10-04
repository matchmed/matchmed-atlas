'use client'

import { useActionState } from 'react'
import {
  publishBriefAction,
  publishLibraryAction,
  saveDraftLibraryUrl,
  scheduleBriefAction,
  scheduleLibraryAction,
} from './publication-actions'

type PublicationResult = { ok: true; message: string } | { ok: false; error: string }

function PublicationForm({
  action,
  id,
  slug,
  label,
}: {
  action: (prev: PublicationResult | null, formData: FormData) => Promise<PublicationResult>
  id: string
  slug: string
  label: string
}) {
  const [state, formAction, pending] = useActionState(action, null)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <button type="submit" disabled={pending}>{pending ? 'Checking destinations…' : label}</button>
      {state?.ok === false ? <p role="alert">{state.error}</p> : null}
      {state?.ok === true ? <p>{state.message}</p> : null}
    </form>
  )
}

export function SponsorPublicationControls({
  kind,
  id,
  slug,
  draftUrl,
}: {
  kind: 'library' | 'brief'
  id: string
  slug: string
  draftUrl?: string | null
}) {
  const publish = kind === 'library' ? publishLibraryAction : publishBriefAction
  const schedule = kind === 'library' ? scheduleLibraryAction : scheduleBriefAction
  const [saved, saveAction, saving] = useActionState(saveDraftLibraryUrl, null)
  return (
    <div>
      {kind === 'library' ? (
        <form action={saveAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="slug" value={slug} />
          <label>
            Unverified draft destination
            <input name="url" type="url" defaultValue={draftUrl ?? ''} required />
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Saving draft…' : 'Save draft destination'}</button>
          <p>Saving a draft does not publish it or check DNS.</p>
          {saved?.ok === false ? <p role="alert">{saved.error}</p> : null}
          {saved?.ok === true ? <p>{saved.message}</p> : null}
        </form>
      ) : null}
      <PublicationForm action={publish} id={id} slug={slug} label="Publish" />
      <PublicationForm action={schedule} id={id} slug={slug} label="Schedule" />
    </div>
  )
}
