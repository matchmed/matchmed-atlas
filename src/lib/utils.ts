// ── Color helpers ──────────────────────────────────────────
export function nameToColor(name: string): [string, string] {
  const colors: [string, string][] = [
    ['#1C4A45', '#E8F0EF'],
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
// Numeric Retention Scores use a single Atlas teal treatment.
// Muted gray is reserved for unavailable scores, not performance.
export const RETENTION_SCORE_INK = '#1C4A45'
export const RETENTION_SCORE_FILL = '#E8F0EF'
export const RETENTION_SCORE_UNAVAILABLE_INK = '#aaa'
export const RETENTION_SCORE_UNAVAILABLE_FILL = '#f5f5f5'

export function scoreColor(s: number | null): string {
  return s === null ? RETENTION_SCORE_UNAVAILABLE_INK : RETENTION_SCORE_INK
}

export function scoreBg(s: number | null): string {
  return s === null ? RETENTION_SCORE_UNAVAILABLE_FILL : RETENTION_SCORE_FILL
}

export function scoreClass(s: number | null): string {
  return s === null ? 's-na' : 's-score'
}

export function scoreLabel(s: number | null): { text: string; bg: string; color: string } {
  if (s === null) {
    return {
      text: 'No score',
      bg: RETENTION_SCORE_UNAVAILABLE_FILL,
      color: RETENTION_SCORE_UNAVAILABLE_INK,
    }
  }
  return { text: s.toFixed(1), bg: RETENTION_SCORE_FILL, color: RETENTION_SCORE_INK }
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
