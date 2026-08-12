'use client'

import { useId, useState } from 'react'
import {
  formatPublicCityState,
  formatPublicZip,
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

export default function PublicPracticeLocations({
  locations,
}: {
  locations: PublicPracticeLocation[]
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()

  return (
    <section style={{ marginBottom: 28 }} aria-labelledby="public-locations-heading">
      {locations.length <= 1 ? (
        <>
          <h2
            id="public-locations-heading"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#999',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginBottom: 10,
            }}
          >
            Locations
          </h2>
          {locations.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>No CMS billing locations listed.</p>
          ) : (
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.45, margin: 0 }}>
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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: 12,
              background: 'none',
              border: 'none',
              padding: 0,
              marginBottom: 10,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#999',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
              }}
            >
              Locations ({locations.length})
            </span>
            <span
              aria-hidden="true"
              style={{
                fontSize: 14,
                color: '#1C4A45',
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
                lineHeight: 1,
              }}
            >
              ▼
            </span>
          </button>

          <ul
            id={listId}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gap: 8,
            }}
          >
            {locations.map((loc, i) => (
              <li
                key={loc.id}
                hidden={!expanded && i > 0}
                style={{ fontSize: 13, color: '#555', lineHeight: 1.45 }}
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
    </section>
  )
}
