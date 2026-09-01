import type { CSSProperties } from 'react'

function externalHref(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}

export default function EmployerRecruitingContact({
  contactName,
  email,
  phone,
  careersUrl,
  className = 'employer-recruiting-contact',
  linkClassName = 'public-profile-link',
  linkStyle,
}: {
  contactName?: string | null
  email?: string | null
  phone?: string | null
  careersUrl?: string | null
  className?: string
  linkClassName?: string
  linkStyle?: CSSProperties
}) {
  const hasRecruiting = Boolean(contactName || email || phone)
  if (!hasRecruiting && !careersUrl) return null

  return (
    <div className={className}>
      {hasRecruiting && (
        <div className="employer-recruiting-contact-group">
          <span className="employer-recruiting-contact-label">Recruiting contact</span>
          <span className="employer-recruiting-contact-items">
            {contactName && <span>{contactName}</span>}
            {contactName && (email || phone) && (
              <span className="employer-recruiting-contact-sep" aria-hidden="true">·</span>
            )}
            {email && (
              <a href={`mailto:${email}`} className={linkClassName || undefined} style={linkStyle}>
                {email}
              </a>
            )}
            {email && phone && <span className="employer-recruiting-contact-sep" aria-hidden="true">·</span>}
            {phone && (
              <a href={`tel:${phone}`} className={linkClassName || undefined} style={linkStyle}>
                {phone}
              </a>
            )}
          </span>
        </div>
      )}
      {careersUrl && (
        <a
          href={externalHref(careersUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName || undefined}
          style={{ wordBreak: 'break-all', ...linkStyle }}
        >
          Careers page
        </a>
      )}
    </div>
  )
}
