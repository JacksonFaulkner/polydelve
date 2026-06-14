import { useCallback } from "react"
import { useAuth } from "./auth"

const BASE = import.meta.env.VITE_API_URL ?? "/api"
const AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE

// Auth0 errors that mean the stored refresh token is unusable. When these
// occur the cached token is stale (e.g. user removed from org, rotated token
// revoked) and silent refresh will loop forever, so force a fresh login.
const REAUTH_ERRORS = new Set(["login_required", "invalid_grant", "consent_required"])

export function useApi() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth()

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string>),
      }
      try {
        const token = await getAccessTokenSilently({ authorizationParams: { audience: AUDIENCE } })
        if (token) headers["Authorization"] = `Bearer ${token}`
      } catch (e: unknown) {
        const err = (e as { error?: string } | null)?.error
        if (err && REAUTH_ERRORS.has(err)) {
          // Stale token — clears cache and restarts the auth code flow.
          await loginWithRedirect()
          return new Response(null, { status: 401 })
        }
        // not authenticated — request will 401
      }
      return fetch(`${BASE}${path}`, { ...init, headers })
    },
    [getAccessTokenSilently, loginWithRedirect],
  )

  return { authFetch }
}
