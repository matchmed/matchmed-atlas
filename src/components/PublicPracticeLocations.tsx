'use client'

import { useId, useState } from 'react'
import { locationSetsMatch } from '@/lib/practice-detail-presentation'
import {
  formatPublicCityState,
  formatPublicZip,
  type EmployerOverlayLocation,
  type PublicPracticeLocation,
} from '@/lib/public-search'
import PracticeLocationsDisclaimer from '@/components/PracticeLocationsDisclaimer'

function formatLocationLine(loc: PublicPracticeLocation): string {
  const parts = [
    (loc.address || '').trim(),
    formatPublicCityState(loc.city, loc.state),
    formatPublicZip(loc.zip),
  ].filter(Boolean)
  return parts.join(' · ')
}

function formatEmployerLocationLine(loc: EmployerOverlayLocation): string {
  const parts = [
    (loc.address || '').trim(),
    formatPublicCityState(loc.city, loc.state),
    formatPublicZip(loc.zip),
  ].filter(Boolean)
  if (loc.phone) parts.push(loc.phone)
  return parts.join(' · ')
}

function CmsLocationsBlock({
  locations,
  secondary = false,
  headingId,
}: {
  locations: PublicPracticeLocation[]
  secondary?: boolean
  headingId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const label = secondary ? 'CMS-observed billing locations' : 'Locations'

  if (locations.length === 0) {
    return secondary ? null : (
      <p className="public-profile-muted">No CMS billing locations listed.</p>
    )
  }

  const labelClass = secondary
    ? 'public-profile-section-label is-secondary'
    : 'public-profile-section-label'

  return (
    <div className={secondary ? 'practice-cms-locations is-secondary' : undefined}>
      {locations.length <= 1 ? (
        <>
          <h2 id={headingId} className={labelClass}>{label}</h2>
          <p className="public-profile-text">
            {formatLocationLine(locations[0]) || 'Location'}
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            id={headingId}
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded(open => !open)}
            className={`${labelClass} is-interactive`}
          >
            <span>{label} ({locations.length})</span>
            <span
              aria-hidden="true"
              className={`public-profile-chevron${expanded ? ' is-open' : ''}`}
            >
              ▼
            </span>
          </button>
          <ul id={listId} className="public-profile-location-list">
            {locations.map((loc, i) => (
              <li
                key={loc.id}
                hidden={!expanded && i > 0}
                className="public-profile-text"
              >
                {formatLocationLine(loc) || 'Location'}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="practice-locations-disclaimer-wrap">
        <PracticeLocationsDisclaimer />
      </div>
    </div>
  )
}

function EmployerLocationsBlock({
  employerLocations,
}: {
  employerLocations: EmployerOverlayLocation[]
}) {
  return (
    <div className="practice-current-locations">
      <h2 id="current-locations-heading" className="public-profile-section-label is-accent">
        Current locations
      </h2>
      <ul className="public-profile-location-list">
        {employerLocations.map(loc => (
          <li key={loc.id} className="public-profile-text">
            {formatEmployerLocationLine(loc) || 'Location'}
            {loc.is_primary && (
              <span className="employer-location-primary">Primary</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PublicPracticeLocations({
  locations,
  employerLocations = [],
}: {
  locations: PublicPracticeLocation[]
  employerLocations?: EmployerOverlayLocation[]
}) {
  const hasEmployerLocations = employerLocations.length > 0
  const locationsMatch = locationSetsMatch(locations, employerLocations)

  if (!hasEmployerLocations) {
    return (
      <section className="public-profile-section" aria-labelledby="public-locations-heading">
        <CmsLocationsBlock
          locations={locations}
          headingId="public-locations-heading"
        />
      </section>
    )
  }

  return (
    <section
      className="public-profile-section practice-locations-panel has-employer-overlay"
      aria-labelledby="current-locations-heading"
    >
      <EmployerLocationsBlock employerLocations={employerLocations} />
      {locationsMatch ? (
        <p className="public-profile-muted" style={{ marginTop: 8 }}>
          Matches latest CMS-observed billing location{locations.length === 1 ? '' : 's'}
        </p>
      ) : (
        <CmsLocationsBlock locations={locations} secondary />
      )}
    </section>
  )
}
