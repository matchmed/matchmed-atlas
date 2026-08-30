import type { EmployerOverlayProfile } from '@/lib/public-search'

export default function PublicEmployerContext({
  profile,
  logoUrl,
}: {
  profile: EmployerOverlayProfile | null | undefined
  logoUrl: string | null
}) {
  const overview = profile?.overview?.trim()
  if (!overview && !logoUrl) return null

  return (
    <section className="public-employer-context" aria-labelledby="employer-context-heading">
      <h2 id="employer-context-heading" className="public-profile-section-label is-accent">
        About the practice
      </h2>
      {logoUrl && (
        <div className="public-employer-context-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Practice logo" />
        </div>
      )}
      {overview && <p className="public-profile-text">{overview}</p>}
      <p className="public-profile-muted public-employer-context-provenance">
        Provided by the practice. Does not replace CMS observations or Atlas analysis.
      </p>
    </section>
  )
}
