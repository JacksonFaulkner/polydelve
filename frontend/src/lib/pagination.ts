import { useEffect, useState } from "react"

export interface PagedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** Shared page/page_size fetch-and-paginate hook for list endpoints that
 * return a PagedResponse. Resets to page 1 whenever `resetKey` changes
 * (e.g. a filter or search term). */
export function usePaginatedFetch<T>(
  buildUrl: (page: number, pageSize: number) => string,
  authFetch: (url: string) => Promise<Response>,
  opts: { pageSize?: number; resetKey?: unknown } = {},
) {
  const { pageSize = 25, resetKey } = opts
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PagedResponse<T> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  useEffect(() => {
    setLoading(true)
    authFetch(buildUrl(page, pageSize))
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, resetKey])

  return { page, setPage, data, loading }
}
