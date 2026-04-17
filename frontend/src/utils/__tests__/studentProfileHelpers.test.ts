import { describe, it, expect } from "vitest"
import { ACCEPTED_INTEREST_TAGS } from "../../constants/interestTagOptions"
import {
  MAX_INTEREST_TAGS,
  normalizeInterestTags,
  stringFieldFromFirestore,
} from "../studentProfileHelpers"

describe("stringFieldFromFirestore", () => {
  it("returns empty for nullish", () => {
    expect(stringFieldFromFirestore(null)).toBe("")
    expect(stringFieldFromFirestore(undefined)).toBe("")
  })

  it("returns strings as-is", () => {
    expect(stringFieldFromFirestore("  hi  ")).toBe("  hi  ")
  })

  it("stringifies numbers and booleans", () => {
    expect(stringFieldFromFirestore(2026)).toBe("2026")
    expect(stringFieldFromFirestore(true)).toBe("true")
  })

  it("drops objects to fallback", () => {
    expect(stringFieldFromFirestore({ x: 1 }, "")).toBe("")
  })
})

describe("normalizeInterestTags", () => {
  it("dedupes, lowercases, and caps length", () => {
    const tags = [...ACCEPTED_INTEREST_TAGS.slice(0, 3), ...ACCEPTED_INTEREST_TAGS.slice(0, 2)]
    const out = normalizeInterestTags(tags)
    expect(out.length).toBeLessThanOrEqual(MAX_INTEREST_TAGS)
    expect(new Set(out).size).toBe(out.length)
  })

  it("filters unknown tags", () => {
    expect(normalizeInterestTags(["not-a-real-tag", ACCEPTED_INTEREST_TAGS[0]])).toEqual([
      ACCEPTED_INTEREST_TAGS[0],
    ])
  })

  it("handles empty input", () => {
    expect(normalizeInterestTags([])).toEqual([])
  })
})
