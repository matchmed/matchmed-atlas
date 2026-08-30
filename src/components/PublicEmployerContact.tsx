import type { EmployerOverlayProfile, PublicPractice } from '@/lib/public-search'
import EmployerRecruitingContact from '@/components/EmployerRecruitingContact'

function externalHref(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}

export default function PublicEmployerContact({
  practice,
  profile,
}: {
  practice: PublicPractice
  profile: EmployerOverlayProfile | null | undefined
}) {
  const phone = profile?.primary_phone || practice.phone
  const website = profile?.website || practice.website

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
      <EmployerRecruitingContact
        email={profile?.recruiting_email}
        phone={profile?.recruiting_phone}
        careersUrl={profile?.careers_url}
      />
    </div>
  )
}
