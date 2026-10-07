import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { ApiError, useApi } from "@/lib/api"

const getAccessTokenSilently = vi.fn()
const loginWithRedirect = vi.fn()

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ getAccessTokenSilently, loginWithRedirect }),
}))

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

// In-memory Storage: Node's own experimental localStorage global can shadow jsdom's.
const store = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
})

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

const authHeader = (callIndex: number) =>
  (fetchMock.mock.calls[callIndex][1] as RequestInit).headers as Record<string, string>

const guestMints = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/guest")).length

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe("authFetch", () => {
  it("sends the Auth0 token when logged in", async () => {
    getAccessTokenSilently.mockResolvedValue("user-token")
    fetchMock.mockImplementation(() => json({}))
    const { result } = renderHook(() => useApi())

    await result.current.authFetch("/users/me")

    expect(authHeader(0).Authorization).toBe("Bearer user-token")
    expect(guestMints()).toBe(0)
  })

  it("mints a guest token once and reuses it while logged out", async () => {
    getAccessTokenSilently.mockRejectedValue({ error: "login_required_but_not_reauth" })
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/auth/guest") ? json({ token: "guest-token", expires_in: 3600 }) : json({}),
    )
    const { result } = renderHook(() => useApi())

    await result.current.authFetch("/packages")
    await result.current.authFetch("/packages")

    expect(guestMints()).toBe(1)
    const apiCalls = fetchMock.mock.calls.filter(([url]) => !String(url).endsWith("/auth/guest"))
    for (const [, init] of apiCalls) {
      expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe("Bearer guest-token")
    }
  })

  it("re-mints an expired cached guest token", async () => {
    localStorage.setItem("polydelve_guest_token", JSON.stringify({ token: "old", expiresAt: Date.now() - 1 }))
    getAccessTokenSilently.mockRejectedValue(new Error("not logged in"))
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/auth/guest") ? json({ token: "fresh", expires_in: 3600 }) : json({}),
    )
    const { result } = renderHook(() => useApi())

    await result.current.authFetch("/packages")

    expect(guestMints()).toBe(1)
    expect(authHeader(1).Authorization).toBe("Bearer fresh")
  })

  it("forces a fresh login when the refresh token is unusable", async () => {
    getAccessTokenSilently.mockRejectedValue({ error: "invalid_grant" })
    const { result } = renderHook(() => useApi())

    const res = await result.current.authFetch("/users/me")

    expect(loginWithRedirect).toHaveBeenCalledOnce()
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("getJson", () => {
  it("returns parsed JSON on success", async () => {
    getAccessTokenSilently.mockResolvedValue("t")
    fetchMock.mockImplementation(() => json({ bits: 1000 }))
    const { result } = renderHook(() => useApi())

    await expect(result.current.getJson<{ bits: number }>("/users/me")).resolves.toEqual({ bits: 1000 })
  })

  it("throws ApiError with the status on a non-2xx response", async () => {
    getAccessTokenSilently.mockResolvedValue("t")
    fetchMock.mockImplementation(() => json({ detail: "nope" }, 500))
    const { result } = renderHook(() => useApi())

    const err = await result.current.getJson("/users/me").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(500)
  })
})
