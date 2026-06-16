const DEFAULT_TTL = 30 * 60 * 1000 // 30 minutes

type FavoritesEntry = {
  userId: string
  favorites: unknown[]
  ts: number
}

let entry: FavoritesEntry | null = null

export function peekFavoritesCache<T>(ttlMs = DEFAULT_TTL): T[] | null {
  if (!entry || Date.now() - entry.ts > ttlMs) return null
  return entry.favorites as T[]
}

export function isFavoritesCacheForUser(userId: string, ttlMs = DEFAULT_TTL): boolean {
  return entry !== null && entry.userId === userId && Date.now() - entry.ts <= ttlMs
}

export function setFavoritesCache<T>(userId: string, favorites: T[]) {
  entry = { userId, favorites, ts: Date.now() }
}

export function invalidateFavoritesCache() {
  entry = null
}
