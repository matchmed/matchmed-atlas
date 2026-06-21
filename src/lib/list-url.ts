import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

export function replaceListParams(
  pathname: string,
  router: AppRouterInstance,
  current: URLSearchParams,
  updates: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams(current.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  const qs = params.toString()
  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
}

export function pageFromParams(searchParams: URLSearchParams): number {
  const raw = parseInt(searchParams.get('page') || '1', 10)
  return Math.max(0, (Number.isFinite(raw) ? raw : 1) - 1)
}

export function statesFromParams(searchParams: URLSearchParams): Set<string> {
  const raw = searchParams.get('states')
  if (!raw) return new Set()
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean))
}
