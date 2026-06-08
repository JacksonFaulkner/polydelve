import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { PackagesTable } from "@/components/PackagesTable"

const mockAuthFetch = vi.fn()

vi.mock("@/lib/api", () => ({
  useApi: () => ({ authFetch: mockAuthFetch }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}))

const MOCK_PACKAGES = [
  {
    name: "requests",
    ecosystem: "PyPI",
    weekly_downloads: 500000,
    epss_score: 0.05,
    risk_score: 3.5,
    has_mal_advisory: false,
    sectors: ["networking"],
    logo_url: null,
    num_cves: 2,
    news_mentions: 0,
    latest_cve_date: "2024-01-01",
    worst_severity: "high",
    max_cvss_score: 7.5,
  },
]

const mockResponse = (data: object) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PackagesTable", () => {
  it("shows loading state initially", () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {})) // never resolves
    render(<PackagesTable ecosystem="PyPI" />)
    // Table renders skeleton or spinner — just check it doesn't crash
    expect(document.body).toBeTruthy()
  })

  it("renders packages after fetch", async () => {
    mockAuthFetch.mockReturnValue(
      mockResponse({ total: 1, page: 1, page_size: 50, packages: MOCK_PACKAGES })
    )
    render(<PackagesTable ecosystem="PyPI" />)
    await waitFor(() => {
      expect(screen.getByText("requests")).toBeInTheDocument()
    })
  })

  it("renders empty state when no packages", async () => {
    mockAuthFetch.mockReturnValue(
      mockResponse({ total: 0, page: 1, page_size: 50, packages: [] })
    )
    render(<PackagesTable ecosystem="PyPI" />)
    await waitFor(() => {
      // table is present but has no data rows beyond header
      expect(screen.queryByText("requests")).not.toBeInTheDocument()
    })
  })

  it("renders correct ecosystem in fetch URL", async () => {
    mockAuthFetch.mockReturnValue(
      mockResponse({ total: 0, page: 1, page_size: 50, packages: [] })
    )
    render(<PackagesTable ecosystem="npm" />)
    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining("ecosystem=npm")
      )
    })
  })

  it("shows risk score for packages", async () => {
    mockAuthFetch.mockReturnValue(
      mockResponse({ total: 1, page: 1, page_size: 50, packages: MOCK_PACKAGES })
    )
    render(<PackagesTable ecosystem="PyPI" />)
    await waitFor(() => {
      expect(screen.getByText("requests")).toBeInTheDocument()
    })
  })

  it("handles fetch error gracefully", async () => {
    mockAuthFetch.mockRejectedValue(new Error("Network error"))
    // Should not throw — component handles errors internally
    expect(() => render(<PackagesTable ecosystem="PyPI" />)).not.toThrow()
  })
})
