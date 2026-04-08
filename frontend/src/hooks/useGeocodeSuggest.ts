import { useState, useEffect, useRef } from "react"
import { API_URL } from "../config"

export interface LocationSuggestOption {
  id: string
  label: string
  lat: number
  lng: number
  city?: string | null
  state?: string | null
  zip?: string | null
}

/**
 * Debounced Mapbox-backed place suggestions via GET /api/geocode/suggest.
 */
export function useGeocodeSuggest(searchQuery: string, enabled: boolean) {
  const [options, setOptions] = useState<LocationSuggestOption[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled) {
      setOptions([])
      return
    }
    const q = searchQuery.trim()
    if (q.length < 2) {
      setOptions([])
      setLoading(false)
      return
    }
    const timer = globalThis.setTimeout(() => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setLoading(true)
      void fetch(`${API_URL}/api/geocode/suggest?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then((res) => res.json())
        .then((data: { suggestions?: LocationSuggestOption[] }) => {
          if (!ac.signal.aborted) {
            setOptions(Array.isArray(data.suggestions) ? data.suggestions : [])
          }
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError" && !ac.signal.aborted) {
            setOptions([])
          }
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false)
        })
    }, 350)
    return () => {
      globalThis.clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [searchQuery, enabled])

  return { options, loading }
}
