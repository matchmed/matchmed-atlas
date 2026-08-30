'use client'

import { useId, useState } from 'react'
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

export default function PublicPracticeLocations({
  locations,
  employerLocations = [],
  employerAttribution,
}: {
  locations: PublicPracticeLocation[]
  employerLocations?: EmployerOverlayLocation[]
  employerAttribution?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()

  return (
    <section className="public-profile-section" aria-labelledby="public-locations-heading">
      {locations.length <= 1 ? (
        <>
          <h2 id="public-locations-heading" className="public-profile-section-label">
            Locations
          </h2>
          {locations.length === 0 ? (
            <p className="public-profile-muted">No CMS billing locations listed.</p>
          ) : (
            <p className="public-profile-text">
              {formatLocationLine(locations[0]) || 'Location'}
            </p>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            id="public-locations-heading"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded(open => !open)}
            className="public-profile-section-label is-interactive"
          >
            <span>Locations ({locations.length})</span>
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
      <div style={{ marginTop: 8 }}>
        <PracticeLocationsDisclaimer />
      </div>

      {employerLocations.length > 0 && (
        <div className="public-employer-locations">
          <h3 className="public-profile-section-label is-accent">
            Practice-reported locations
          </h3>
          {employerAttribution && (
            <p className="employer-overlay-attribution">{employerAttribution}</p>
          )}
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
      )}
    </section>
  )
}
