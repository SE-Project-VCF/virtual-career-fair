import { describe, it, expect } from "vitest"
import { ACCEPTED_INTEREST_TAGS, formatInterestTagLabel } from "../interestTagOptions"

describe("interestTagOptions", () => {
  it("formatInterestTagLabel title-cases each word", () => {
    expect(formatInterestTagLabel("data science")).toBe("Data Science")
    expect(formatInterestTagLabel("machine learning")).toBe("Machine Learning")
    expect(formatInterestTagLabel("ux")).toBe("Ux")
  })

  it("handles empty segments gracefully", () => {
    expect(formatInterestTagLabel("a  b")).toBe("A  B")
  })

  it("ACCEPTED_INTEREST_TAGS is sorted and non-empty", () => {
    expect(ACCEPTED_INTEREST_TAGS.length).toBeGreaterThan(10)
    const copy = [...ACCEPTED_INTEREST_TAGS]
    copy.sort((a, b) => a.localeCompare(b))
    expect(ACCEPTED_INTEREST_TAGS).toEqual(copy)
  })
})
