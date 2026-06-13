// ── Color helpers ──────────────────────────────────────────
export function nameToColor(name: string): [string, string] {
  const colors: [string, string][] = [
    ['#185FA5', '#E8F0FB'],
    ['#1A6B3A', '#D4EDDA'],
    ['#7B3FA0', '#EEE0F8'],
    ['#C8640A', '#FFF0E0'],
    ['#1A6B6B', '#D4EDED'],
    ['#A03F3F', '#F8E0E0'],
    ['#3F5BA0', '#E0E6F8'],
    ['#6B6B1A', '#EDEDD4'],
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export function getInitials(name: string): string {
  if (!name) return '?'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return words[0][0].toUpperCase()
}

// ── Score helpers ──────────────────────────────────────────
export function scoreColor(s: number | null): string {
  if (s === null) return '#aaa'
  if (s >= 85) return '#1A6B3A'
  if (s >= 80) return '#4CAF50'
  if (s >= 70) return '#C8B400'
  if (s >= 60) return '#E07B00'
  return '#C0392B'
}

export function scoreBg(s: number | null): string {
  if (s === null) return '#f5f5f5'
  if (s >= 85) return '#f0faf4'
  if (s >= 80) return '#f4faf4'
  if (s >= 70) return '#fdfbe6'
  if (s >= 60) return '#fff7ed'
  return '#fdf2f2'
}

export function scoreClass(s: number | null): string {
  if (s === null) return 's-na'
  if (s >= 85) return 's-dg'
  if (s >= 80) return 's-lg'
  if (s >= 70) return 's-yw'
  if (s >= 60) return 's-or'
  return 's-rd'
}

export function scoreLabel(s: number | null): { text: string; bg: string; color: string } {
  if (s === null) return { text: 'No score', bg: '#f5f5f5', color: '#aaa' }
  if (s >= 85) return { text: s.toFixed(1), bg: '#d4edda', color: '#1A6B3A' }
  if (s >= 80) return { text: s.toFixed(1), bg: '#e8f5e9', color: '#2e7d32' }
  if (s >= 70) return { text: s.toFixed(1), bg: '#fffde7', color: '#7a6800' }
  if (s >= 60) return { text: s.toFixed(1), bg: '#fff3e0', color: '#b85c00' }
  return { text: s.toFixed(1), bg: '#ffebee', color: '#C0392B' }
}

export function deltaColor(d: number): string {
  if (d > 5) return '#1A6B3A'
  if (d < -5) return '#A32D2D'
  return '#888'
}

export function deltaBg(d: number): string {
  if (d > 5) return '#e8f5ee'
  if (d < -5) return '#fdeaea'
  return '#f0f0f0'
}

export function deltaArrow(d: number): string {
  if (d > 5) return '▲'
  if (d < -5) return '▼'
  return '—'
}

// ── Time helpers ───────────────────────────────────────────
export function daysAgo(isoString: string | null): string | null {
  if (!isoString) return null
  const days = Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  if (days < 60) return '1 month ago'
  return `${Math.floor(days / 30)} months ago`
}
