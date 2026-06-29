'use client'
import { Suspense, useEffect, useState, useRef, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { scoreClass, scoreLabel, deltaColor, deltaBg, deltaArrow, getInitials, nameToColor } from '@/lib/utils'
import { loadAtlasCache, peekAtlasCache, saveAtlasCache } from '@/lib/atlas-cache'
import {
  PRACTICES_CACHE_DB,
  PRACTICES_CACHE_STORE,
  PRACTICES_CACHE_KEY,
  PRACTICES_CACHE_TTL,
  type PracticeListRow,
} from '@/lib/practices-cache'
import { replaceListParams, pageFromParams, statesFromParams } from '@/lib/list-url'
import { useListSearch } from '@/lib/use-list-search'
import { invalidateFavoritesCache } from '@/lib/favorites-cache'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const PAGE_SIZE = 50
const CACHE_KEY = PRACTICES_CACHE_KEY
const CACHE_TTL = PRACTICES_CACHE_TTL
const CACHE_DB = PRACTICES_CACHE_DB
const CACHE_STORE = PRACTICES_CACHE_STORE

type Practice = PracticeListRow

type SortKey = 'practice_name' | 'city_st' | 'retention_score' | 'retention_score_delta' | 'latest_roster_size'

function sortLabel(key: SortKey): string {
  const labels: Record<SortKey, string> = {
    practice_name: 'name',
    city_st: 'location',
    retention_score: 'score',
    retention_score_delta: 'change vs 2019',
    latest_roster_size: 'roster size',
  }
  return labels[key]
}

function ShortlistHeart({ filled, onClick }: { filled: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={filled ? 'Remove from shortlist' : 'Add to shortlist'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, flexShrink: 0 }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill={filled ? '#E53935' : 'none'} stroke={filled ? '#E53935' : '#888'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    </button>
  )
}

function practicePopupHtml(
  props: { name: string; location: string; phone?: string; practiceId: string },
  sl: { text: string; bg: string; color: string },
  isShortlisted: boolean,
) {
  const fill = isShortlisted ? '#E53935' : 'none'
  const stroke = isShortlisted ? '#E53935' : '#888'
  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;">
      <div style="font-size:14px;font-weight:600;color:#1a1a1a;">${props.name}</div>
      <button onclick="window.__toggleShortlist('${props.practiceId}')" style="background:none;border:none;cursor:pointer;padding:0;line-height:0;flex-shrink:0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
        </svg>
      </button>
    </div>
    <div style="font-size:12px;color:#888;margin-bottom:4px;">${props.location}</div>
    ${props.phone ? `<div style="font-size:12px;color:#1C4A45;margin-bottom:8px;">${props.phone}</div>` : ''}
    <div style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;background:${sl.bg};color:${sl.color};margin-bottom:10px;">${sl.text}</div>
    <button onclick="window.__openPracticeFromMap('${props.practiceId}')" style="display:block;width:100%;padding:7px;background:#1C4A45;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;text-align:center;">Open practice →</button>
  `
}

function PracticeCard({ practice, onOpen }: { practice: Practice; onOpen: () => void }) {
  const [fg, bg] = nameToColor(practice.practice_name || '')
  const initials = getInitials(practice.practice_name || '?')
  const sl = scoreLabel(practice.retention_score)
  const location = practice.city_st || '—'
  const roster = practice.latest_roster_size
    ? `${practice.latest_roster_size} physician${practice.latest_roster_size === 1 ? '' : 's'}`
    : null
  const meta = roster ? `${location} · ${roster}` : location

  return (
    <button type="button" className="practice-card" onClick={onOpen}>
      <div className="practice-card-avatar" style={{ color: fg, background: bg }}>
        {initials}
      </div>
      <div className="practice-card-body">
        <div className="practice-card-name">{practice.practice_name || '—'}</div>
        <div className="practice-card-meta">{meta}</div>
      </div>
      <div className="practice-card-score" style={{ background: sl.bg, color: sl.color }}>
        <div className="practice-card-score-value">
          {practice.retention_score !== null ? sl.text : '—'}
        </div>
        <div className="practice-card-score-label">score</div>
      </div>
    </button>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PracticesPage() {
  return (
    <Suspense fallback={<div className="loading-bar"><div className="loading-bar-inner" /></div>}>
      <PracticesPageContent />
    </Suspense>
  )
}

function PracticesPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [practices, setPractices] = useState<Practice[]>(
    () => peekAtlasCache<Practice>(CACHE_DB, CACHE_KEY, CACHE_TTL) ?? [],
  )
  const [loading, setLoading] = useState(
    () => !peekAtlasCache<Practice>(CACHE_DB, CACHE_KEY, CACHE_TTL),
  )
  const { search, setSearch } = useListSearch()
  const selectedStates = useMemo(() => statesFromParams(searchParams), [searchParams])
  const page = pageFromParams(searchParams)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInitedRef = useRef(false)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const mapRestoreRef = useRef<{ center: [number, number]; zoom: number } | null>(null)
  const lastPopupRef = useRef<{ coords: [number, number]; props: Record<string, any> } | null>(null)
  const shortlistedPracticeIdsRef = useRef<Set<string>>(new Set())
  const showPracticePopupRef = useRef<(coords: [number, number], props: Record<string, any>) => void>(() => {})
  const toggleShortlistRef = useRef<(practiceId: string) => void>(() => {})

  function patchUrl(updates: Record<string, string | null | undefined>) {
    replaceListParams(pathname, router, searchParams, updates)
  }

  function goToPage(p: number) {
    patchUrl({ page: p === 0 ? null : String(p + 1) })
  }

  const [stateSearch, setStateSearch] = useState('')
  const [stateOpen, setStateOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('retention_score')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [view, setView] = useState<'table' | 'map'>('table')
  const [clusterPractices, setClusterPractices] = useState<any[]>([])
  const [clusterPanelOpen, setClusterPanelOpen] = useState(false)
  const [highlightedClusterId, setHighlightedClusterId] = useState<number | null>(null)
  const [shortlistedPracticeIds, setShortlistedPracticeIds] = useState<Set<string>>(new Set())
  const [profileId, setProfileId] = useState<string | null>(null)

  // Load all practices with IndexedDB cache
  useEffect(() => {
    async function load() {
      const cached = await loadAtlasCache<Practice>(CACHE_DB, CACHE_STORE, CACHE_KEY, CACHE_TTL)
      if (cached) {
        setPractices(cached)
        setLoading(false)
        return
      }
      const supabase = createClient()
      setLoading(true)
      let all: Practice[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('practices')
          .select('id,practice_name,city_st,state,retention_score,retention_score_delta,latest_roster_size,latitude,longitude,phone,org_pac_id')
          .range(from, from + 999)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < 1000) break
        from += 1000
      }
      await saveAtlasCache(CACHE_DB, CACHE_STORE, CACHE_KEY, all)
      setPractices(all)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    async function loadShortlist() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!profile) return

      setProfileId(profile.id)

      const { data } = await supabase
        .from('shortlists')
        .select('practice_id')
        .eq('physician_id', profile.id)

      if (data) {
        const ids = new Set(data.map(r => r.practice_id))
        shortlistedPracticeIdsRef.current = ids
        setShortlistedPracticeIds(ids)
      }
    }
    loadShortlist()
  }, [])

  // Restore map state after returning from practice detail
  useEffect(() => {
    if (practices.length === 0) return
    try {
      const lastView = sessionStorage.getItem('atlas_last_view')
      const centerRaw = sessionStorage.getItem('atlas_map_center')
      const zoomRaw = sessionStorage.getItem('atlas_map_zoom')
      if (lastView === 'map') {
        sessionStorage.removeItem('atlas_last_view')
        sessionStorage.removeItem('atlas_map_center')
        sessionStorage.removeItem('atlas_map_zoom')
        if (centerRaw) {
          mapRestoreRef.current = {
            center: JSON.parse(centerRaw),
            zoom: zoomRaw ? parseFloat(zoomRaw) : 4,
          }
        }
        setView('map')
      }
    } catch (e) {}
  }, [practices])

  const allStates = Array.from(new Set(practices.map(p => p.state).filter(Boolean) as string[])).sort()

  const filtered = practices.filter(p => {
    const q = search.toLowerCase()
    const matchesSearch = !q || (p.practice_name || '').toLowerCase().includes(q) || (p.city_st || '').toLowerCase().includes(q)
    const matchesState = selectedStates.size === 0 || selectedStates.has(p.state || '')
    return matchesSearch && matchesState
  }).sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    if (typeof av === 'string') return av.localeCompare(bv as string) * sortDir
    return ((av as number) - (bv as number)) * sortDir
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pagePractices = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortKey(key); setSortDir(key === 'retention_score' || key === 'latest_roster_size' ? -1 : 1) }
    goToPage(0)
  }

  function toggleState(s: string) {
    const next = new Set(selectedStates)
    next.has(s) ? next.delete(s) : next.add(s)
    patchUrl({
      states: next.size ? [...next].sort().join(',') : null,
      page: null,
    })
  }

  function clearStates() {
    patchUrl({ states: null, page: null })
  }

  function deltaChip(d: number | null) {
    if (d === null) return <span style={{ color: '#ccc', fontSize: 12 }}>—</span>
    const sign = d > 0 ? '+' : ''
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 11, fontWeight: 600,
        color: deltaColor(d), background: deltaBg(d),
        padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
      }}>
        {deltaArrow(d)} {sign}{d.toFixed(1)}
      </span>
    )
  }

  function scoreColor(s: number | null) {
    if (s === null) return '#aaa'
    if (s >= 85) return '#1A6B3A'
    if (s >= 80) return '#4CAF50'
    if (s >= 70) return '#C8B400'
    if (s >= 60) return '#E07B00'
    return '#C0392B'
  }

  function scoreLabelLocal(s: number | null): { text: string; bg: string; color: string } {
    if (s === null) return { text: 'No score', bg: '#f5f5f5', color: '#aaa' }
    if (s >= 85) return { text: s.toFixed(1), bg: '#d4edda', color: '#1A6B3A' }
    if (s >= 80) return { text: s.toFixed(1), bg: '#e8f5e9', color: '#2e7d32' }
    if (s >= 70) return { text: s.toFixed(1), bg: '#fffde7', color: '#7a6800' }
    if (s >= 60) return { text: s.toFixed(1), bg: '#fff3e0', color: '#b85c00' }
    return { text: s.toFixed(1), bg: '#ffebee', color: '#C0392B' }
  }

  function showPracticePopup(coords: [number, number], props: Record<string, any>) {
    if (!mapRef.current) return
    lastPopupRef.current = { coords, props }
    const score = props.score === 'null' || props.score === null ? null : parseFloat(props.score)
    const sl = scoreLabelLocal(score)
    const isShortlisted = shortlistedPracticeIdsRef.current.has(props.practiceId)
    if (popupRef.current) popupRef.current.remove()
    popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '240px' })
      .setLngLat(coords)
      .setHTML(practicePopupHtml(props as { name: string; location: string; phone?: string; practiceId: string }, sl, isShortlisted))
      .addTo(mapRef.current)
  }

  async function toggleShortlist(practiceId: string) {
    if (!profileId) return
    const supabase = createClient()
    const isShortlisted = shortlistedPracticeIdsRef.current.has(practiceId)

    setShortlistedPracticeIds(prev => {
      const next = new Set(prev)
      if (isShortlisted) next.delete(practiceId)
      else next.add(practiceId)
      shortlistedPracticeIdsRef.current = next
      return next
    })

    if (isShortlisted) {
      await supabase.from('shortlists').delete().eq('physician_id', profileId).eq('practice_id', practiceId)
    } else {
      await supabase.from('shortlists').insert({ physician_id: profileId, practice_id: practiceId })
    }
    invalidateFavoritesCache()

    if (lastPopupRef.current?.props.practiceId === practiceId) {
      showPracticePopupRef.current(lastPopupRef.current.coords, lastPopupRef.current.props)
    }
  }

  showPracticePopupRef.current = showPracticePopup
  toggleShortlistRef.current = toggleShortlist

  function openPractice(practiceId: string) {
    router.push(`/practices/${practiceId}`)
  }

  function openPracticeFromMap(practiceId: string) {
    if (mapRef.current && mapInitedRef.current) {
      try {
        const center = mapRef.current.getCenter()
        const zoom = mapRef.current.getZoom()
        sessionStorage.setItem('atlas_last_view', 'map')
        sessionStorage.setItem('atlas_map_center', JSON.stringify([center.lng, center.lat]))
        sessionStorage.setItem('atlas_map_zoom', String(zoom))
      } catch (e) {}
    }
    router.push(`/practices/${practiceId}`)
  }

  useEffect(() => {
    (window as any).__openPracticeFromMap = openPracticeFromMap
    ;(window as any).__toggleShortlist = (practiceId: string) => toggleShortlistRef.current(practiceId)
  }, [])

  // Map init
  useEffect(() => {
    if (view !== 'map' || mapInitedRef.current || !mapContainerRef.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    setTimeout(() => {
    mapboxgl.accessToken = token

    const restore = mapRestoreRef.current
    const map = new mapboxgl.Map({
      container: mapContainerRef.current!,
      style: 'mapbox://styles/mapbox/light-v11',
      center: restore?.center || [-96, 38],
      zoom: restore?.zoom || 4,
    })
    mapRef.current = map
    mapRestoreRef.current = null
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      mapInitedRef.current = true
      const geo = buildGeoJSON(filtered)
      map.addSource('practices', { type: 'geojson', data: geo, cluster: true, clusterMaxZoom: 10, clusterRadius: 40 })
      map.addLayer({
        id: 'cluster-highlight',
        type: 'circle',
        source: 'practices',
        filter: ['==', ['get', 'cluster_id'], -1],
        paint: {
          'circle-color': '#1C4A45',
          'circle-radius': ['+', ['step', ['get', 'point_count'], 16, 10, 22, 50, 28], 14],
          'circle-opacity': 0.22,
          'circle-stroke-width': 4,
          'circle-stroke-color': '#1C4A45',
          'circle-stroke-opacity': 0.55,
        },
      })
      map.addLayer({ id: 'clusters', type: 'circle', source: 'practices', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#1C4A45', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28], 'circle-opacity': 0.85, 'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.4)' }
      })
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'practices', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#fff' }
      })
      map.addLayer({ id: 'unclustered', type: 'circle', source: 'practices', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7, 12, 10], 'circle-opacity': 0.88, 'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.5)' }
      })

      map.on('click', 'clusters', e => {
        e.originalEvent.stopPropagation()
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'cluster-count'] })
        if (!f || !f.length) return
        const src = map.getSource('practices') as mapboxgl.GeoJSONSource
        const clusterId = f[0].properties!.cluster_id
        src.getClusterLeaves(clusterId, 100, 0, (err, features) => {
          if (err || !features) return
          const leaves = features.map(f => f.properties)
          setTimeout(() => {
            setClusterPractices(leaves)
            setClusterPanelOpen(true)
            setHighlightedClusterId(clusterId)
          }, 0)
        })
      })

      map.on('click', 'cluster-count', e => {
        e.originalEvent.stopPropagation()
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'cluster-count'] })
        if (!f || !f.length) return
        const src = map.getSource('practices') as mapboxgl.GeoJSONSource
        const clusterId = f[0].properties!.cluster_id
        src.getClusterLeaves(clusterId, 100, 0, (err, features) => {
          if (err || !features) return
          const leaves = features.map(f => f.properties)
          setTimeout(() => {
            setClusterPractices(leaves)
            setClusterPanelOpen(true)
            setHighlightedClusterId(clusterId)
          }, 0)
        })
      })

      map.on('click', 'unclustered', e => {
        const props = e.features![0].properties!
        const coords = (e.features![0].geometry as any).coordinates.slice() as [number, number]
        showPracticePopupRef.current(coords, props)
      })

      map.on('mouseenter', 'unclustered', () => map.getCanvas().style.cursor = 'pointer')
      map.on('mouseleave', 'unclustered', () => map.getCanvas().style.cursor = '')
      map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer')
      map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '')
    })
    }, 0)
  }, [view])

  useEffect(() => {
    if (!mapInitedRef.current || !mapRef.current) return
    const map = mapRef.current
    if (!map.getLayer('cluster-highlight')) return

    const id = highlightedClusterId ?? -1
    map.setFilter('cluster-highlight', ['==', ['get', 'cluster_id'], id])

    if (highlightedClusterId !== null) {
      map.setPaintProperty('clusters', 'circle-opacity', ['case', ['==', ['get', 'cluster_id'], highlightedClusterId], 1, 0.85])
      map.setPaintProperty('clusters', 'circle-stroke-width', ['case', ['==', ['get', 'cluster_id'], highlightedClusterId], 3.5, 1.5])
      map.setPaintProperty('clusters', 'circle-stroke-color', ['case', ['==', ['get', 'cluster_id'], highlightedClusterId], '#1C4A45', 'rgba(255,255,255,0.4)'])
    } else {
      map.setPaintProperty('clusters', 'circle-opacity', 0.85)
      map.setPaintProperty('clusters', 'circle-stroke-width', 1.5)
      map.setPaintProperty('clusters', 'circle-stroke-color', 'rgba(255,255,255,0.4)')
    }
  }, [highlightedClusterId])

  // Update map when filter changes
  useEffect(() => {
    if (!mapInitedRef.current || !mapRef.current) return
    const src = mapRef.current.getSource('practices') as mapboxgl.GeoJSONSource | undefined
    if (src) src.setData(buildGeoJSON(filtered))
  }, [filtered])

  function buildGeoJSON(records: Practice[]): GeoJSON.FeatureCollection {
    const seen: Record<string, number> = {}
    return {
      type: 'FeatureCollection',
      features: records.filter(r => r.latitude && r.longitude && isFinite(r.latitude) && isFinite(r.longitude)).map(r => {
        const key = `${r.latitude?.toFixed(4)},${r.longitude?.toFixed(4)}`
        seen[key] = (seen[key] || 0) + 1
        const count = seen[key]
        const jitter = count > 1 ? 0.003 : 0
        const angle = (count - 1) * 2.4
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.longitude! + jitter * Math.cos(angle), r.latitude! + jitter * Math.sin(angle)] },
          properties: { name: r.practice_name || '', location: r.city_st || '', score: r.retention_score === null ? 'null' : r.retention_score, color: scoreColor(r.retention_score), phone: r.phone || '', practiceId: r.id }
        }
      })
    }
  }

  const thStyle = (key: SortKey): React.CSSProperties => ({
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: sortKey === key ? '#1C4A45' : '#888',
    textTransform: 'uppercase', letterSpacing: '.05em', cursor: 'pointer',
    userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid #e8e8e8',
    background: '#f7f7f7',
  })

  const stateFilterPanel = (
    <>
      <input
        type="text"
        placeholder="Search states..."
        value={stateSearch}
        onChange={e => setStateSearch(e.target.value)}
        style={{ display: 'block', width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
      />
      <div className="practices-state-filter-list">
        {allStates.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase())).map(s => (
          <div key={s} onClick={() => toggleState(s)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px', fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={selectedStates.has(s)} readOnly style={{ width: 14, height: 14, accentColor: '#1C4A45' }} />
            {s}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={clearStates}
        style={{ display: 'block', width: '100%', padding: '10px 0 0', fontSize: 13, color: '#1C4A45', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}
      >
        Clear all
      </button>
    </>
  )

  return (
    <div>
      {/* Controls */}
      <div style={{ marginBottom: 12 }}>
        <div className="practices-controls-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            className="practices-search-input"
            placeholder="Search practices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd', borderRadius: 8, outline: 'none', flex: 1, minWidth: 180 }}
          />

          <button
            type="button"
            className={`practices-filter-btn-mobile ${selectedStates.size > 0 ? 'practices-filter-btn-mobile-active' : ''}`}
            onClick={() => setStateOpen(true)}
            aria-label="Filter by state"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>

          <button
            type="button"
            className="practices-view-toggle-mobile"
            onClick={() => setView(view === 'table' ? 'map' : 'table')}
            aria-label={view === 'table' ? 'Switch to map view' : 'Switch to list view'}
          >
            {view === 'table' ? (
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            ) : (
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          {/* State dropdown — desktop */}
          <div className="practices-state-dropdown" style={{ position: 'relative' }}>
            <button onClick={() => setStateOpen(o => !o)} style={{
              fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd',
              borderRadius: 8, background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 130,
            }}>
              {selectedStates.size === 0 ? 'All states ▾' : selectedStates.size === 1 ? `${[...selectedStates][0]} ▾` : `${selectedStates.size} states ▾`}
            </button>
            {stateOpen && (
              <div style={{ position: 'absolute', top: 40, left: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, width: 220, padding: 12 }}>
                {stateFilterPanel}
              </div>
            )}
          </div>

          {/* View toggle — desktop */}
          <div className="practices-view-toggle-desktop" style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
            {(['table', 'map'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '7px 14px', fontSize: 13, cursor: 'pointer', height: 36, border: 'none',
                background: view === v ? '#1C4A45' : '#fff',
                color: view === v ? '#fff' : '#888',
                textTransform: 'capitalize',
              }}>
                {v === 'table' ? 'Table' : 'Map'}
              </button>
            ))}
          </div>
        </div>

        {stateOpen && (
          <div className="practices-filter-sheet-root">
            <div className="practices-filter-sheet-backdrop" onClick={() => setStateOpen(false)} />
            <div className="practices-filter-sheet">
              <div className="practices-filter-sheet-header">
                <span>Filter by state</span>
                <button type="button" onClick={() => setStateOpen(false)}>Done</button>
              </div>
              {stateFilterPanel}
            </div>
          </div>
        )}
      </div>

      {loading && <div className="loading-bar"><div className="loading-bar-inner" /></div>}

      {/* Table / card list view */}
      {view === 'table' && (
        <>
          <div className="practices-table-view">
          <div className="data-table-wrapper">
            <div className="data-table-scroll">
            <table className="data-table data-table-practices">
              <thead>
                <tr>
                  <th style={thStyle('practice_name')} onClick={() => handleSort('practice_name')}>
                    Practice {sortKey === 'practice_name' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={thStyle('city_st')} onClick={() => handleSort('city_st')}>
                    Location {sortKey === 'city_st' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={thStyle('retention_score')} onClick={() => handleSort('retention_score')}>
                    <span className="data-table-label-full">Retention score</span>
                    <span className="data-table-label-short">Retention</span>
                    {' '}{sortKey === 'retention_score' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={thStyle('retention_score_delta')} onClick={() => handleSort('retention_score_delta')}>
                    vs 2019 {sortKey === 'retention_score_delta' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={thStyle('latest_roster_size')} onClick={() => handleSort('latest_roster_size')}>
                    Roster {sortKey === 'latest_roster_size' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ ...thStyle('practice_name'), cursor: 'default' }} />
                </tr>
              </thead>
              <tbody>
                {pagePractices.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/practices/${p.id}`)}>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0', fontWeight: 500, maxWidth: 320 }}>
                      {p.practice_name || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0', color: '#666' }}>
                      {p.city_st || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0' }}>
                      <span className={`score-pill ${scoreClass(p.retention_score)}`}>
                        {p.retention_score !== null ? p.retention_score.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0' }}>
                      {deltaChip(p.retention_score_delta)}
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0', color: '#666' }}>
                      {p.latest_roster_size || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', borderTop: '1px solid #f0f0f0' }}>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/practices/${p.id}`) }}
                        style={{ fontSize: 12, color: '#1C4A45', cursor: 'pointer', padding: '4px 10px', border: '1px solid #1C4A45', borderRadius: 6, background: 'none', whiteSpace: 'nowrap' }}
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && pagePractices.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>No practices match your filters.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
          </div>

          <div className="practices-card-view">
            {pagePractices.map(p => (
              <PracticeCard key={p.id} practice={p} onOpen={() => openPractice(p.id)} />
            ))}
            {!loading && pagePractices.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                No practices match your filters.
              </div>
            )}
          </div>

          {/* Footer — desktop */}
          <div className="practices-footer-desktop" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: '#aaa', flexWrap: 'wrap', gap: 8 }}>
            <span>{filtered.length.toLocaleString()} practices{search || selectedStates.size > 0 ? ' (filtered)' : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => goToPage(Math.max(0, page - 1))} disabled={page === 0} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.35 : 1 }}>← Prev</button>
              <span style={{ fontSize: 12, color: '#888' }}>Page {page + 1} of {totalPages}</span>
              <button onClick={() => goToPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.35 : 1 }}>Next →</button>
            </div>
            <span>{practices.length.toLocaleString()} total practices</span>
          </div>

          {/* Footer — mobile */}
          <div className="practices-footer-mobile">
            <p style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginBottom: 10 }}>
              {filtered.length.toLocaleString()} practices · sorted by {sortLabel(sortKey)}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <button onClick={() => goToPage(Math.max(0, page - 1))} disabled={page === 0} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.35 : 1 }}>← Prev</button>
              <span style={{ fontSize: 12, color: '#888' }}>Page {page + 1} of {totalPages}</span>
              <button onClick={() => goToPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.35 : 1 }}>Next →</button>
            </div>
          </div>
        </>
      )}

      {/* Map view */}
      {view === 'map' && (
        <div style={{ position: 'relative', height: 600, borderRadius: 10, overflow: 'hidden' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '10px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.12)', fontSize: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Retention score</div>
            {[['#1A6B3A', '85+'], ['#4CAF50', '80-85'], ['#C8B400', '70-80'], ['#E07B00', '60-70'], ['#C0392B', 'Below 60'], ['#aaa', 'No score']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: '#555' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#888', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
            <span style={{ color: '#333', fontWeight: 500 }}>{filtered.filter(r => r.latitude).length.toLocaleString()}</span> practices
          </div>
          {clusterPanelOpen && (
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 320,
              zIndex: 20,
              background: '#fff',
              borderLeft: '1px solid #e8e8e8',
              boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e8e8e8' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{clusterPractices.length} practices</span>
                <button
                  type="button"
                  onClick={() => { setClusterPanelOpen(false); setClusterPractices([]); setHighlightedClusterId(null) }}
                  aria-label="Close panel"
                  style={{ background: 'none', border: 'none', fontSize: 20, lineHeight: 1, color: '#888', cursor: 'pointer', padding: '0 4px' }}
                >
                  ×
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {clusterPractices.map((practice, i) => {
                  const score = practice.score === 'null' || practice.score === null ? null : parseFloat(practice.score)
                  return (
                  <div key={practice.practiceId || i} style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#111' }}>
                        {practice.name}
                        {score !== null && (
                          <span style={{
                            display: 'inline-block',
                            marginLeft: '8px',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: scoreLabel(score).bg,
                            color: scoreLabel(score).color,
                          }}>
                            {score.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <ShortlistHeart
                        filled={shortlistedPracticeIds.has(practice.practiceId)}
                        onClick={e => { e.stopPropagation(); toggleShortlist(practice.practiceId) }}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{practice.location}</div>
                    <button
                      type="button"
                      onClick={() => openPracticeFromMap(practice.practiceId)}
                      style={{ fontSize: 12, color: '#1C4A45', cursor: 'pointer', padding: '4px 10px', border: '1px solid #1C4A45', borderRadius: 6, background: 'none', whiteSpace: 'nowrap' }}
                    >
                      Open →
                    </button>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}