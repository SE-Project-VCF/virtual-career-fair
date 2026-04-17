import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY,
  readWelcomeBubbleDismissed,
  clearJobmotherWelcomeBubbleDismissed,
  getJobmotherClarifyChips,
} from "./jobmother"

describe("readWelcomeBubbleDismissed / clearJobmotherWelcomeBubbleDismissed", () => {
  beforeEach(() => {
    try {
      globalThis.localStorage?.clear()
    } catch {
      /* ignore */
    }
  })

  it("returns false when no keys set", () => {
    expect(readWelcomeBubbleDismissed()).toBe(false)
  })

  it("returns true when primary key is set", () => {
    globalThis.localStorage?.setItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY, "true")
    expect(readWelcomeBubbleDismissed()).toBe(true)
  })

  it("returns true when legacy teaser key is set", () => {
    globalThis.localStorage?.setItem("jobmother-teaser-dismissed", "true")
    expect(readWelcomeBubbleDismissed()).toBe(true)
  })

  it("clearJobmotherWelcomeBubbleDismissed removes both keys", () => {
    globalThis.localStorage?.setItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY, "true")
    globalThis.localStorage?.setItem("jobmother-teaser-dismissed", "true")
    clearJobmotherWelcomeBubbleDismissed()
    expect(globalThis.localStorage?.getItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY)).toBeNull()
    expect(globalThis.localStorage?.getItem("jobmother-teaser-dismissed")).toBeNull()
  })

  it("clear welcome state works when invoked twice via the same implementation", () => {
    globalThis.localStorage?.setItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY, "true")
    clearJobmotherWelcomeBubbleDismissed()
    clearJobmotherWelcomeBubbleDismissed()
    expect(readWelcomeBubbleDismissed()).toBe(false)
  })

  it("readWelcomeBubbleDismissed returns false if localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(readWelcomeBubbleDismissed()).toBe(false)
    spy.mockRestore()
  })
})

describe("getJobmotherClarifyChips", () => {
  it("returns everyone-only chips when role is missing or not a string", () => {
    const base = getJobmotherClarifyChips(undefined)
    expect(base.length).toBeLessThanOrEqual(8)
    expect(base).toContain("Take me to my dashboard")
    expect(getJobmotherClarifyChips(123 as unknown as string)).toContain("Open chat")
  })

  it("includes student prompts for student role", () => {
    const chips = getJobmotherClarifyChips("student")
    expect(chips).toContain("Where are my job invitations?")
    expect(chips.length).toBeLessThanOrEqual(8)
  })

  it("includes company prompts for companyOwner and company", () => {
    expect(getJobmotherClarifyChips("companyOwner")).toContain("Candidate shortlist")
    expect(getJobmotherClarifyChips("company")).toContain("Q&A sessions")
  })

  it("adds representative-only chip for representative", () => {
    const chips = getJobmotherClarifyChips("representative")
    expect(chips).toContain("View submissions for my booth")
  })

  it("includes admin prompts for administrator", () => {
    expect(getJobmotherClarifyChips("administrator")).toContain("Open the admin panel")
  })

  it("falls back to everyone set for unknown role", () => {
    const chips = getJobmotherClarifyChips("guest")
    expect(chips).toContain("Show me career fairs")
    expect(chips.length).toBeLessThanOrEqual(8)
  })
})
