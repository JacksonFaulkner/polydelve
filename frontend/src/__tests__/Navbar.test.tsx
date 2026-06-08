import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Navbar } from "@/components/Navbar"

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: vi.fn(),
    logout: vi.fn(),
    user: null,
  }),
}))

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: vi.fn(),
    logout: vi.fn(),
    user: null,
  }),
}))

describe("Navbar — unauthenticated", () => {
  it("renders public tabs", () => {
    render(<Navbar activeSector="All" />)
    expect(screen.getByText("All")).toBeInTheDocument()
    expect(screen.getByText("News")).toBeInTheDocument()
    expect(screen.getByText("Leaderboard")).toBeInTheDocument()
  })

  it("does not render auth-gated tabs when logged out", () => {
    render(<Navbar activeSector="All" />)
    expect(screen.queryByText("PyPI")).not.toBeInTheDocument()
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument()
  })

  it("shows sign in button when logged out", () => {
    render(<Navbar activeSector="All" />)
    expect(screen.getByText("Sign in")).toBeInTheDocument()
  })

  it("active tab has correct aria role as link", () => {
    render(<Navbar activeSector="News" />)
    const newsLink = screen.getByRole("link", { name: /news/i })
    expect(newsLink).toHaveAttribute("href", "/news")
  })
})
