'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { nameToColor, getInitials, scoreColor, scoreBg } from '@/lib/utils'

interface FavoritePractice {
  id: string
  practice_name: string | null
  dba: string | null
  city_st: string | null
  retention_score: number | null
  latest_roster_size: number | null
  practice_id: string
}

export default function FavoritesPage() {
  const router = useRouter()
  const [favorites, setFavorites] = useState<FavoritePractice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('favorites')
        .select('id, practice_id, practices(id, practice_name, dba, city_st, retention_score, latest_roster_size)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (data) {
        setFavorites(data.map((f: any) => ({
          id: f.id,
          practice_id: f.practice_id,
          practice_name: f.practices?.practice_name || null,
          dba: null,
          city_st: f.practices?.city_st || null,
          retention_score: f.practices?.retention_score || null,
          latest_roster_size: f.practices?.latest_roster_size || null,
        })))
      }
      setLoading(false)
    }
    load()
  }, [])

  async function removeFavorite(favId: string) {
    const supabase = createClient()
    await supabase.from('favorites').delete().eq('id', favId)
    setFavorites(prev => prev.filter(f => f.id !== favId))
  }

  if (loading) return <div className="loading-bar"><div className="loading-bar-inner" /></div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.3px', marginBottom: 4 }}>My Favorites</h1>
        <p style={{ fontSize: 13, color: '#888' }}>{favorites.length} saved {favorites.length === 1 ? 'practice' : 'practices'}</p>
      </div>

      {favorites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>☆</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#888', marginBottom: 6 }}>No saved practices yet</div>
          <div style={{ fontSize: 13, color: '#aaa', marginBottom: 24 }}>
            Browse practices and click "Add to Favorites" to save them here.
          </div>
          <button
            onClick={() => router.push('/practices')}
            style={{ padding: '10px 20px', background: '#185FA5', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Browse practices
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {favorites.map(f => {
            const name = f.practice_name || f.dba || 'Unknown Practice'
            const [fg, bg] = nameToColor(name)
            const initials = getInitials(name)
            const hasScore = f.retention_score !== null

            return (
              <div
                key={f.id}
                style={{
                  background: 'white',
                  border: '1px solid #e8e8e8',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  cursor: 'pointer',
                }}
                onClick={() => router.push(`/practices/${f.practice_id}`)}
              >
                <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                  {initials}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{f.city_st || '—'} · {f.latest_roster_size || 0} physicians</div>
                </div>

                {hasScore && (
                  <div style={{ background: scoreBg(f.retention_score), borderRadius: 8, padding: '6px 12px', textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(f.retention_score) }}>{f.retention_score!.toFixed(1)}</div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>score</div>
                  </div>
                )}

                <button
                  onClick={e => { e.stopPropagation(); removeFavorite(f.id) }}
                  style={{ padding: '6px 10px', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#aaa', cursor: 'pointer', flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}