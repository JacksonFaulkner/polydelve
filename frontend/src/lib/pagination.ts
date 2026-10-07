import { useCallback, useEffect, useState } from "react"

export interface PagedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** Fetch a PagedResponse for a given URL; re-runs whenever `url` changes.
 * Page state is owned by the caller (typically the URL via nuqs). */
export function usePagedFetch<T>(
  url: string,
  getJson: <R>(path: string) => Promise<R>,
) {
  const [data, setData] = useState<PagedResponse<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getJson<PagedResponse<T>>(url)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) { setData(null); setError(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url, getJson, attempt])

  return { data, loading, error, retry }
}
