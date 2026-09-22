import { useEffect, useState } from "react"

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
  authFetch: (url: string) => Promise<Response>,
) {
  const [data, setData] = useState<PagedResponse<T> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    authFetch(url)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return { data, loading }
}
