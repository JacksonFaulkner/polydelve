import { useCallback } from "react"
import { useAuth } from "./auth"

const BASE = import.meta.env.VITE_API_URL ?? "/api"
const AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE

export function useApi() {
  const { getAccessTokenSilently } = useAuth()

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string>),
      }
      try {
        const token = await getAccessTokenSilently({ authorizationParams: { audience: AUDIENCE } })
        if (token) headers["Authorization"] = `Bearer ${token}`
      } catch {
        // not authenticated — request will 401
      }
      return fetch(`${BASE}${path}`, { ...init, headers })
    },
    [getAccessTokenSilently],
  )

  return { authFetch }
}
