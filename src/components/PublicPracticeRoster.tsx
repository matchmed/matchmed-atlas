'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import type { PublicRosterPhysician } from '@/lib/public-search'

export default function PublicPracticeRoster({
  roster,
}: {
  roster: PublicRosterPhysician[]
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const multi = roster.length >= 2

  return (
    <section className="public-roster" aria-labelledby="roster-heading">
      <p className="public-roster-note">
        Physician rosters reflect the latest CMS data and may lag recent departures or additions.
      </p>
      <h2 id="roster-heading" className="public-roster-heading">
        Currently observed physicians ({roster.length})
      </h2>
      {roster.length === 0 ? (
        <p className="public-roster-empty">No currently observed physicians listed.</p>
      ) : (
        <>
          <div className={`public-roster-preview${multi && !expanded ? ' is-collapsed' : ''}`}>
            <ul id={listId} className="public-roster-list">
              {roster.map((doc, i) => (
                <li
                  key={doc.id}
                  hidden={multi && !expanded && i > 1}
                >
                  <Link href={`/physicians/${doc.id}`} className="public-roster-link">
                    {doc.physician_name || 'Physician'}
                  </Link>
                </li>
              ))}
            </ul>
            {multi && !expanded && (
              <div className="public-roster-fade" aria-hidden="true" />
            )}
          </div>
          {multi && (
            <button
              type="button"
              className="public-roster-toggle"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded(open => !open)}
            >
              <span>
                {expanded
                  ? 'Show fewer physicians'
                  : `Show all ${roster.length} physicians`}
              </span>
              <span
                aria-hidden="true"
                className={`public-roster-chevron${expanded ? ' is-open' : ''}`}
              >
                ▼
              </span>
            </button>
          )}
        </>
      )}
    </section>
  )
}
