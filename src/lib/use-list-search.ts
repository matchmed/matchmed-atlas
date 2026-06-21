'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { replaceListParams } from '@/lib/list-url'

/** Local search input with debounced URL sync — avoids router.replace fighting keystrokes. */
export function useListSearch(debounceMs = 300) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q') ?? ''
  const [search, setSearch] = useState(urlQ)

  // External navigation: refresh, back/forward, shared link
  useEffect(() => {
    setSearch(urlQ)
  }, [urlQ])

  // Debounce writing to URL so the input stays responsive
  useEffect(() => {
    if (search === urlQ) return
    const t = setTimeout(() => {
      replaceListParams(pathname, router, searchParams, { q: search || null, page: null })
    }, debounceMs)
    return () => clearTimeout(t)
  }, [search, urlQ, pathname, router, searchParams, debounceMs])

  return { search, setSearch }
}
