import { describe, it, expect } from "vitest"
import { pathToSector, SECTOR_PATH } from "@/components/Navbar"

describe("SECTOR_PATH", () => {
  it("all sectors have a path", () => {
    const paths = Object.values(SECTOR_PATH)
    expect(paths.length).toBeGreaterThan(0)
    paths.forEach((p) => expect(p).toMatch(/^\//))
  })

  it("root path maps to Predict", () => {
    expect(pathToSector("/")).toBe("Predict")
  })

  it("known paths resolve correctly", () => {
    expect(pathToSector("/news")).toBe("News")
    expect(pathToSector("/pypi")).toBe("PyPI")
    expect(pathToSector("/npm")).toBe("npm")
    expect(pathToSector("/predict")).toBe("Predict")
    expect(pathToSector("/leaderboard")).toBe("Leaderboard")
    expect(pathToSector("/dashboard")).toBe("Dashboard")
  })

  it("unknown path falls back to Predict", () => {
    expect(pathToSector("/does-not-exist")).toBe("Predict")
    expect(pathToSector("/random/deep/path")).toBe("Predict")
  })

  it("all SECTOR_PATH values round-trip through pathToSector", () => {
    for (const [sector, path] of Object.entries(SECTOR_PATH)) {
      expect(pathToSector(path)).toBe(sector)
    }
  })
})
