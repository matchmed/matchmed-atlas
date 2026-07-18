'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  PracticesIcon,
  PhysiciansIcon,
  FavoritesIcon,
  JobsIcon,
  ScoringIcon,
  ShieldCheckIcon,
} from '@/components/nav-icons'

interface Stats {
  practices: number
  doctors: number
  affiliations: number
  jobs: number
}

const navCardStyle: CSSProperties = {
  border: '1px solid #e0ddd8',
  borderRadius: 10,
  padding: '16px 18px',
  display: 'flex',
  gap: 14,
  alignItems: 'flex-start',
  transition: 'box-shadow 0.12s, border-color 0.12s',
  height: '100%',
  boxSizing: 'border-box',
}

const iconTileStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  background: '#E8F0EF',
  color: '#1C4A45',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

export default function HomePageClient() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [ready, setReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const supabase = createClient()

      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        await supabase.auth.exchangeCodeForSession(code)
      }

      const hash = window.location.hash
      let sessionUser = null

      if (hash && hash.includes('access_token')) {
        sessionUser = await new Promise<any>(resolve => {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            subscription.unsubscribe()
            resolve(session?.user || null)
          })
          setTimeout(() => resolve(null), 3000)
        })
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        sessionUser = user
      }

      if (!sessionUser) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('user_id', sessionUser.id)
        .maybeSingle()

      if (!profile || !profile.onboarding_complete) {
        router.replace('/onboarding')
        return
      }

      setReady(true)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!ready) return
    async function load() {
      const supabase = createClient()
      const [p, d, a, j] = await Promise.all([
        supabase.from('practices').select('id', { count: 'exact', head: true }),
        supabase.from('doctors').select('id', { count: 'exact', head: true }),
        supabase.from('affiliations').select('id', { count: 'exact', head: true }),
        supabase.from('employer_leads').select('id', { count: 'exact', head: true }),
      ])
      setStats({
        practices: p.count || 0,
        doctors: d.count || 0,
        affiliations: a.count || 0,
        jobs: j.count || 0,
      })
    }
    load()
  }, [ready])

  if (!ready) {
    return <div className="loading-bar"><div className="loading-bar-inner" /></div>
  }

  const statCards = [
    { label: 'Ophthalmology Practices', value: stats?.practices.toLocaleString() ?? '—', href: '/practices' },
    { label: 'Physician Careers Tracked', value: stats?.doctors.toLocaleString() ?? '—', href: '/physicians' },
    { label: 'Career Affiliations', value: stats?.affiliations.toLocaleString() ?? '—', href: '/practices' },
    { label: 'Active Job Listings', value: stats?.jobs.toLocaleString() ?? '—', href: '/jobs' },
  ]

  const quickLinks = [
    { href: '/practices', label: 'Browse Practices', desc: 'Search 6,800+ ophthalmology practices with retention scores and career history', icon: <PracticesIcon size={20} /> },
    { href: '/physicians', label: 'Physician Directory', desc: 'Explore 22,000+ ophthalmologist career records from CMS data', icon: <PhysiciansIcon size={20} /> },
    { href: '/jobs', label: 'Job Opportunities', desc: 'View open positions from practices actively recruiting', icon: <JobsIcon size={20} /> },
    { href: '/favorites', label: 'My Favorites', desc: 'Practices you have saved for later review', icon: <FavoritesIcon size={20} /> },
  ]

  return (
    <div>
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#1C4A45', marginBottom: 10 }}>
          Ophthalmology Workforce Intelligence
        </div>
        <h1 className="font-serif" style={{ fontSize: 32, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 10, lineHeight: 1.2 }}>
          Ophthalmology Workforce Intelligence
        </h1>
        <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6, maxWidth: 600 }}>
          Every score on Atlas is derived from publicly available CMS Medicare data (no surveys, no self-reporting, no recruiter claims).
          Longitudinal physician-practice career data covering 2019 to present.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 40 }}>
        {statCards.map(s => (
          <Link key={s.label} href={s.href} style={{
            background: '#ffffff',
            borderRadius: 12,
            padding: '18px 16px',
            border: '1px solid #e0ddd8',
            display: 'block',
            transition: 'transform 0.12s, box-shadow 0.12s',
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1, marginBottom: 6 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>{s.label}</div>
          </Link>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', marginBottom: 16, paddingBottom: 8, borderBottom: '0.5px solid #e8e8e8' }}>
          Navigate Atlas
        </div>
        <div className="navigate-atlas-grid">
          {quickLinks.map(l => (
            <Link key={l.href} href={l.href} className="bg-canvas navigate-atlas-card" style={navCardStyle}>
              <div style={iconTileStyle}>
                {l.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{l.label}</div>
                <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{l.desc}</div>
              </div>
            </Link>
          ))}

          <Link
            href="/scoring-methodology"
            className="bg-canvas navigate-atlas-card navigate-atlas-span-full"
            style={navCardStyle}
          >
            <div style={iconTileStyle}>
              <ScoringIcon size={20} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>How Scores Work</div>
              <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>Understand the data behind Retention Scores and Experience Levels</div>
            </div>
          </Link>

          <Link
            href="/partners"
            className="bg-canvas navigate-atlas-card navigate-atlas-span-full navigate-atlas-span-3"
            style={navCardStyle}
          >
            <div style={iconTileStyle}>
              <ShieldCheckIcon size={20} />
            </div>
            <div className="navigate-atlas-partners-body">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Keeping Atlas Free</div>
                <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
                  Partner support helps keep Atlas free for physicians. Partners never influence practice profiles, scores, methodology, or private physician activity.
                </div>
              </div>
              <div className="navigate-atlas-partners-mark">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#888', lineHeight: 1.3 }}>Sample Partner</div>
                <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4, marginTop: 4 }}>Illustrative partnership concept</div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 40, padding: '16px 20px', background: '#f9f9f9', borderRadius: 8, border: '0.5px solid #e8e8e8' }}>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: '#555' }}>Data source: </strong> Medicare Part B Provider Data, Centers for Medicare &amp; Medicaid Services (CMS).
          Updated periodically as new CMS data becomes available. Atlas is not affiliated with, endorsed by, or sponsored by CMS or any federal agency.{' '}
          <Link href="/scoring-methodology" style={{ color: '#1C4A45' }}>Learn more about our methodology →</Link>
        </p>
      </div>
    </div>
  )
}
