import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { GradeBadge } from "@/components/GradeBadge"
import type { Grade } from "@/types"

const GRADES: Grade[] = ["A", "B", "C", "D", "F"]

describe("GradeBadge", () => {
  it.each(GRADES)("renders grade %s", (grade) => {
    render(<GradeBadge grade={grade} />)
    expect(screen.getByText(grade)).toBeInTheDocument()
  })

  it("grade A has emerald color class", () => {
    const { container } = render(<GradeBadge grade="A" />)
    expect(container.firstChild).toHaveClass("text-emerald-400")
  })

  it("grade F has red color class", () => {
    const { container } = render(<GradeBadge grade="F" />)
    expect(container.firstChild).toHaveClass("text-red-400")
  })

  it("grade A and F have different styles", () => {
    const { container: aContainer } = render(<GradeBadge grade="A" />)
    const { container: fContainer } = render(<GradeBadge grade="F" />)
    expect((aContainer.firstChild as HTMLElement)?.className).not.toBe((fContainer.firstChild as HTMLElement)?.className)
  })
})
