'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  formatPublicCityState,
  publicPlatformCounts,
  publicSearch,
  type PublicSearchPractice,
  type PublicSearchPhysician,
} from '@/lib/public-search'

type Hit =
  | { kind: 'practice'; item: PublicSearchPractice }
  | { kind: 'physician'; item: PublicSearchPhysician }

const DEBOUNCE_MS = 300

export default function PublicSearchHome() {
  const router = useRouter()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedPractices, setFetchedPractices] = useState<PublicSearchPractice[]>([])
  const [fetchedPhysicians, setFetchedPhysicians] = useState<PublicSearchPhysician[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [counts, setCounts] = useState<{ practices: number; physicians: number } | null>(null)

  const canSearch = debounced.length >= 3
  const practices = canSearch ? fetchedPractices : []
  const physicians = canSearch ? fetchedPhysicians : []

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await publicPlatformCounts(supabase)
      if (!cancelled && data) {
        setCounts({
          practices: data.practice_count,
          physicians: data.physician_count,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebounced(query.trim())
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query])

  useEffect(() => {
    if (!canSearch) return

    let cancelled = false
    const q = debounced
    ;(async () => {
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const { data, error: rpcError } = await publicSearch(supabase, q)
      if (cancelled) return
      if (rpcError) {
        setError('Search is temporarily unavailable. Please try again.')
        setFetchedPractices([])
        setFetchedPhysicians([])
      } else {
        setFetchedPractices(data?.practices ?? [])
        setFetchedPhysicians(data?.physicians ?? [])
      }
      setActiveIndex(-1)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [canSearch, debounced])

  const flatHits: Hit[] = useMemo(() => {
    const rows: Hit[] = []
    for (const item of fetchedPractices) {
      if (!canSearch) break
      rows.push({ kind: 'practice', item })
    }
    for (const item of fetchedPhysicians) {
      if (!canSearch) break
      rows.push({ kind: 'physician', item })
    }
    return canSearch ? rows : []
  }, [canSearch, fetchedPractices, fetchedPhysicians])

  const showPanel = canSearch
  const noResults =
    showPanel && !loading && !error && practices.length === 0 && physicians.length === 0

  function goToHit(hit: Hit) {
    if (hit.kind === 'practice') router.push(`/practices/${hit.item.id}`)
    else router.push(`/physicians/${hit.item.id}`)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showPanel || flatHits.length === 0) {
      if (e.key === 'Escape') {
        setQuery('')
        setDebounced('')
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % flatHits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i <= 0 ? flatHits.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      goToHit(flatHits[activeIndex])
    } else if (e.key === 'Escape') {
      setActiveIndex(-1)
      inputRef.current?.blur()
    }
  }

  return (
    <div className="public-home">
      <section className="public-home-hero" aria-labelledby="public-home-headline">
        <p className="public-home-eyebrow">MatchMed Atlas</p>
        <h1 id="public-home-headline" className="font-serif public-home-title">
          Research a practice before you sign.
        </h1>
        <p className="public-home-sub">
          Search ophthalmology practices and physicians using public CMS-observed workforce data.
        </p>

        <div className="public-search" role="search">
          <label htmlFor="public-search-input" className="sr-only">
            Search a practice or ophthalmologist
          </label>
          <input
            ref={inputRef}
            id="public-search-input"
            type="search"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Search a practice or ophthalmologist"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-controls={listId}
            aria-expanded={showPanel}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
            }
            className="public-search-input"
          />

          {showPanel && (
            <div
              id={listId}
              role="listbox"
              aria-label="Search results"
              className="public-search-panel"
            >
              {loading && (
                <div className="public-search-status" role="status">
                  Searching…
                </div>
              )}
              {error && (
                <div className="public-search-status public-search-error" role="alert">
                  {error}
                </div>
              )}
              {noResults && (
                <div className="public-search-status" role="status">
                  No practices or ophthalmologists matched that search.
                </div>
              )}

              {!loading && !error && practices.length > 0 && (
                <div className="public-search-group">
                  <div className="public-search-group-label">Practices</div>
                  {practices.map((p, i) => {
                    const flatIndex = i
                    const active = flatIndex === activeIndex
                    const loc = formatPublicCityState(p.city, p.state)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        id={`${listId}-opt-${flatIndex}`}
                        role="option"
                        aria-selected={active}
                        className={`public-search-option${active ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => goToHit({ kind: 'practice', item: p })}
                      >
                        <span className="public-search-option-title">
                          {p.practice_name || 'Practice'}
                        </span>
                        <span className="public-search-option-meta">
                          {[loc, p.location_count && p.location_count > 1
                            ? `${p.location_count} locations`
                            : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {!loading && !error && physicians.length > 0 && (
                <div className="public-search-group">
                  <div className="public-search-group-label">Ophthalmologists</div>
                  {physicians.map((d, i) => {
                    const flatIndex = practices.length + i
                    const active = flatIndex === activeIndex
                    const loc = formatPublicCityState(d.city, d.state)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        id={`${listId}-opt-${flatIndex}`}
                        role="option"
                        aria-selected={active}
                        className={`public-search-option${active ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => goToHit({ kind: 'physician', item: d })}
                      >
                        <span className="public-search-option-title">
                          {d.physician_name || 'Physician'}
                        </span>
                        <span className="public-search-option-meta">
                          {[d.current_practice_name, loc].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {counts && (
          <p className="public-home-counts">
            Tracking about {counts.practices.toLocaleString()}+ practices and{' '}
            {counts.physicians.toLocaleString()}+ ophthalmologists
          </p>
        )}
      </section>

      <section className="public-home-foot" aria-label="About Atlas data">
        <p>
          Physician and practice records reflect the latest available CMS Doctors and Clinicians
          data and may lag recent changes.{' '}
          <Link href="/scoring-methodology">How Atlas scoring works</Link>
          {' · '}
          <Link href="/signup">Create a free account</Link>
          {' '}to unlock workforce stability analysis.
        </p>
      </section>
    </div>
  )
}
