'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { nameToColor, getInitials, scoreClass, scoreLabel, deltaColor, deltaBg, deltaArrow } from '@/lib/utils'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const PAGE_SIZE = 50

interface Practice {
  id: string
  practice_name: string | null
  city_st: string | null
  state: string | null
  retention_score: number | null
  retention_score_delta: number | null
  latest_roster_size: number | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  org_pac_id: string | null
}

type SortKey = 'practice_name' | 'city_st' | 'retention_score' | 'retention_score_delta' | 'latest_roster_size'

export default function PracticesPage() {
  const router = useRouter()
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set())
  const [stateSearch, setStateSearch] = useState('')
  const [stateOpen, setStateOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('retention_score')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [page, setPage] = useState(0)
  const [view, setView] = useState<'table' | 'map'>('table')
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInitedRef = useRef(false)
  const popupRef = useRef<mapboxgl.Popup | null>(null)

  // Load all practices
  useEffect(() => {
    async function load() {
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
      setPractices(all)
      setLoading(false)
    }
    load()
  }, [])

  // All states from data
  const allStates = Array.from(new Set(practices.map(p => p.state).filter(Boolean) as string[])).sort()

  // Filtered + sorted
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
    setPage(0)
  }

  function toggleState(s: string) {
    setSelectedStates(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
    setPage(0)
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

  // Map init
  useEffect(() => {
    if (view !== 'map' || mapInitedRef.current || !mapContainerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-96, 38],
      zoom: 4,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      mapInitedRef.current = true
      const geo = buildGeoJSON(filtered)
      map.addSource('practices', { type: 'geojson', data: geo, cluster: true, clusterMaxZoom: 10, clusterRadius: 40 })
      map.addLayer({ id: 'clusters', type: 'circle', source: 'practices', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#185FA5', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28], 'circle-opacity': 0.85, 'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.4)' }
      })
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'practices', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#fff' }
      })
      map.addLayer({ id: 'unclustered', type: 'circle', source: 'practices', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7, 12, 10], 'circle-opacity': 0.88, 'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.5)' }
      })

      map.on('click', 'clusters', e => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        const src = map.getSource('practices') as mapboxgl.GeoJSONSource
        src.getClusterExpansionZoom(f[0].properties!.cluster_id, (err, zoom) => {
          if (!err) map.easeTo({ center: (f[0].geometry as any).coordinates, zoom: zoom! })
        })
      })

      map.on('click', 'unclustered', e => {
        const props = e.features![0].properties!
        const coords = (e.features![0].geometry as any).coordinates.slice()
        const score = props.score === 'null' || props.score === null ? null : parseFloat(props.score)
        const sl = scoreLabel(score)
        if (popupRef.current) popupRef.current.remove()
        popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '240px' })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">${props.name}</div>
            <div style="font-size:12px;color:#888;margin-bottom:4px;">${props.location}</div>
            ${props.phone ? `<div style="font-size:12px;color:#185FA5;margin-bottom:8px;">${props.phone}</div>` : ''}
            <div style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;background:${sl.bg};color:${sl.color};margin-bottom:10px;">${sl.text}</div>
            <button onclick="window.location.href='/practices/${props.practiceId}'" style="display:block;width:100%;padding:7px;background:#185FA5;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;text-align:center;">Open practice →</button>
          `)
          .addTo(map)
      })

      map.on('mouseenter', 'unclustered', () => map.getCanvas().style.cursor = 'pointer')
      map.on('mouseleave', 'unclustered', () => map.getCanvas().style.cursor = '')
      map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer')
      map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '')
    })
  }, [view])

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

  function scoreLabel(s: number | null): { text: string; bg: string; color: string } {
    if (s === null) return { text: 'No score', bg: '#f5f5f5', color: '#aaa' }
    if (s >= 85) return { text: s.toFixed(1), bg: '#d4edda', color: '#1A6B3A' }
    if (s >= 80) return { text: s.toFixed(1), bg: '#e8f5e9', color: '#2e7d32' }
    if (s >= 70) return { text: s.toFixed(1), bg: '#fffde7', color: '#7a6800' }
    if (s >= 60) return { text: s.toFixed(1), bg: '#fff3e0', color: '#b85c00' }
    return { text: s.toFixed(1), bg: '#ffebee', color: '#C0392B' }
  }

  const thStyle = (key: SortKey): React.CSSProperties => ({
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: sortKey === key ? '#185FA5' : '#888',
    textTransform: 'uppercase', letterSpacing: '.05em', cursor: 'pointer',
    userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid #e8e8e8',
    background: '#f7f7f7',
  })

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search practice name or city..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          style={{ fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd', borderRadius: 8, outline: 'none', flex: 1, minWidth: 180 }}
        />

        {/* State dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setStateOpen(o => !o)} style={{
            fontSize: 13, padding: '7px 11px', height: 36, border: '1px solid #ddd',
            borderRadius: 8, background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 130,
          }}>
            {selectedStates.size === 0 ? 'All states ▾' : selectedStates.size === 1 ? `${[...selectedStates][0]} ▾` : `${selectedStates.size} states ▾`}
          </button>
          {stateOpen && (
            <div style={{ position: 'absolute', top: 40, left: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, width: 180 }}>
              <input
                type="text"
                placeholder="Search states..."
                value={stateSearch}
                onChange={e => setStateSearch(e.target.value)}
                style={{ display: 'block', width: '100%', border: 'none', borderBottom: '1px solid #eee', padding: '9px 12px', fontSize: 13, outline: 'none', borderRadius: '8px 8px 0 0' }}
              />
              <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
                {allStates.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase())).map(s => (
                  <div key={s} onClick={() => toggleState(s)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedStates.has(s)} readOnly style={{ width: 13, height: 13 }} />
                    {s}
                  </div>
                ))}
              </div>
              <button onClick={() => { setSelectedStates(new Set()); setPage(0) }} style={{ display: 'block', width: '100%', padding: '7px 12px', fontSize: 11, color: '#185FA5', background: 'none', border: 'none', borderTop: '1px solid #eee', cursor: 'pointer', textAlign: 'left' }}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
          {(['table', 'map'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '7px 14px', fontSize: 13, cursor: 'pointer', height: 36, border: 'none',
              background: view === v ? '#185FA5' : '#fff',
              color: view === v ? '#fff' : '#888',
              textTransform: 'capitalize',
            }}>
              {v === 'table' ? 'Table' : 'Map'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading-bar"><div className="loading-bar-inner" /></div>}

      {/* Table view */}
      {view === 'table' && (
        <>
          <div style={{ border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle('practice_name')} onClick={() => handleSort('practice_name')}>
                    Practice {sortKey === 'practice_name' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={thStyle('city_st')} onClick={() => handleSort('city_st')}>
                    Location {sortKey === 'city_st' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={thStyle('retention_score')} onClick={() => handleSort('retention_score')}>
                    Retention score {sortKey === 'retention_score' ? (sortDir === 1 ? '↑' : '↓') : '↕'}
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
                        style={{ fontSize: 12, color: '#185FA5', cursor: 'pointer', padding: '4px 10px', border: '1px solid #185FA5', borderRadius: 6, background: 'none', whiteSpace: 'nowrap' }}
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

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: '#aaa', flexWrap: 'wrap', gap: 8 }}>
            <span>{filtered.length.toLocaleString()} practices{search || selectedStates.size > 0 ? ' (filtered)' : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.35 : 1 }}>← Prev</button>
              <span style={{ fontSize: 12, color: '#888' }}>Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.35 : 1 }}>Next →</button>
            </div>
            <span>{practices.length.toLocaleString()} total practices</span>
          </div>
        </>
      )}

      {/* Map view */}
      {view === 'map' && (
        <div style={{ position: 'relative', height: 600, borderRadius: 10, overflow: 'hidden' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          {/* Legend */}
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
        </div>
      )}
    </div>
  )
}
