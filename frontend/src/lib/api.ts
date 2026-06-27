import { useCallback } from "react"
import { useAuth } from "./auth"

const BASE = import.meta.env.VITE_API_URL ?? "/api"
const AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE

// Auth0 errors that mean the stored refresh token is unusable. When these
// occur the cached token is stale (e.g. user removed from org, rotated token
// revoked) and silent refresh will loop forever, so force a fresh login.
const REAUTH_ERRORS = new Set(["login_required", "invalid_grant", "consent_required"])

// Guest bearer token for logged-out browsing. Minted by the backend and cached
// in-memory + localStorage so we don't re-mint on every request. Lets read-only
// endpoints (packages, simulate) work without a real login; betting still 401s.
const GUEST_KEY = "polydelve_guest_token"
let guestPromise: Promise<string | null> | null = null

async function getGuestToken(): Promise<string | null> {
  const cached = readGuestToken()
  if (cached) return cached
  if (!guestPromise) {
    guestPromise = fetch(`${BASE}/auth/guest`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { token: string; expires_in: number } | null) => {
        if (!d?.token) return null
        const expiresAt = Date.now() + (d.expires_in - 60) * 1000
        localStorage.setItem(GUEST_KEY, JSON.stringify({ token: d.token, expiresAt }))
        return d.token
      })
      .catch(() => null)
      .finally(() => { guestPromise = null })
  }
  return guestPromise
}

function readGuestToken(): string | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (!raw) return null
    const { token, expiresAt } = JSON.parse(raw) as { token: string; expiresAt: number }
    if (Date.now() >= expiresAt) { localStorage.removeItem(GUEST_KEY); return null }
    return token
  } catch {
    return null
  }
}

export function useApi() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth()

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string>),
      }
      let token: string | null = null
      try {
        token = await getAccessTokenSilently({ authorizationParams: { audience: AUDIENCE } })
      } catch (e: unknown) {
        const err = (e as { error?: string } | null)?.error
        if (err && REAUTH_ERRORS.has(err)) {
          // Stale token — clears cache and restarts the auth code flow.
          await loginWithRedirect()
          return new Response(null, { status: 401 })
        }
        // not logged in — fall back to a guest token below
      }
      if (!token) token = await getGuestToken()
      if (token) headers["Authorization"] = `Bearer ${token}`
      return fetch(`${BASE}${path}`, { ...init, headers })
    },
    [getAccessTokenSilently, loginWithRedirect],
  )

  return { authFetch }
}
