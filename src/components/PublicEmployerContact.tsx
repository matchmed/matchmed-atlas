import type { EmployerOverlayProfile, PublicPractice } from '@/lib/public-search'

function externalHref(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}

export default function PublicEmployerContact({
  practice,
  profile,
  attributionLabel,
}: {
  practice: PublicPractice
  profile: EmployerOverlayProfile | null | undefined
  attributionLabel?: string
}) {
  const phone = profile?.primary_phone || practice.phone
  const website = profile?.website || practice.website
  const recruitingEmail = profile?.recruiting_email
  const recruitingPhone = profile?.recruiting_phone
  const careersUrl = profile?.careers_url

  const hasEmployerContact = Boolean(
    profile?.primary_phone ||
      profile?.website ||
      profile?.recruiting_email ||
      profile?.recruiting_phone ||
      profile?.careers_url,
  )

  return (
    <div className="public-profile-contact">
      {phone && (
        <a href={`tel:${phone}`} className="public-profile-link">
          {phone}
        </a>
      )}
      {website && (
        <a
          href={externalHref(website)}
          target="_blank"
          rel="noopener noreferrer"
          className="public-profile-link"
          style={{ wordBreak: 'break-all' }}
        >
          {website}
        </a>
      )}
      {recruitingEmail && (
        <a href={`mailto:${recruitingEmail}`} className="public-profile-link">
          Recruiting: {recruitingEmail}
        </a>
      )}
      {recruitingPhone && (
        <a href={`tel:${recruitingPhone}`} className="public-profile-link">
          Recruiting: {recruitingPhone}
        </a>
      )}
      {careersUrl && (
        <a
          href={externalHref(careersUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="public-profile-link"
          style={{ wordBreak: 'break-all' }}
        >
          Careers page
        </a>
      )}
      {hasEmployerContact && attributionLabel && (
        <p className="employer-overlay-attribution">{attributionLabel}</p>
      )}
    </div>
  )
}
