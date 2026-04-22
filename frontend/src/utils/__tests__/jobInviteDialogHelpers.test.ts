import { describe, it, expect } from "vitest"
import {
  buildInfoMessage,
  buildSendButtonLabel,
  emptyInviteListHint,
  formatInterestChipLabel,
  formatTagDisplay,
  getFilteredStudents,
  getStudentCountLabel,
  normalizeStudentFromApi,
  studentHasInterestTag,
  studentSkillsMatchFilter,
} from "../jobInviteDialogHelpers"

describe("normalizeStudentFromApi", () => {
  it("maps string fields and coerces id", () => {
    const s = normalizeStudentFromApi({
      id: 99,
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      major: "CS",
    })
    expect(s).toMatchObject({
      id: "99",
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      major: "CS",
      skills: "",
      interestTags: [],
    })
  })

  it("joins array skills", () => {
    const s = normalizeStudentFromApi({ id: "1", skills: ["x", "y"] })
    expect(s.skills).toBe("x, y")
  })

  it("normalizes interest tag objects", () => {
    const s = normalizeStudentFromApi({
      id: "1",
      interestTags: [{ name: "  Finance " }, { tag: "ai" }],
    })
    expect(s.interestTags).toContain("finance")
    expect(s.interestTags).toContain("ai")
  })
})

describe("studentSkillsMatchFilter", () => {
  it("matches case-insensitive substring", () => {
    expect(studentSkillsMatchFilter("Python, SQL", "py")).toBe(true)
    expect(studentSkillsMatchFilter(undefined, "")).toBe(true)
    expect(studentSkillsMatchFilter("Java", "py")).toBe(false)
  })

  it("treats semicolons and newlines like commas (no regex normalization)", () => {
    expect(studentSkillsMatchFilter("Java; Python\nRust", "python")).toBe(true)
    expect(studentSkillsMatchFilter("a  ,  b", "a b")).toBe(true)
  })
})

describe("studentHasInterestTag", () => {
  const st = {
    id: "1",
    firstName: "a",
    lastName: "b",
    email: "e",
    major: "m",
    interestTags: ["machine learning"],
  }

  it("returns true when filter empty", () => {
    expect(studentHasInterestTag(st, "  ")).toBe(true)
  })

  it("matches normalized tag", () => {
    expect(studentHasInterestTag(st, "machine")).toBe(true)
  })
})

describe("getFilteredStudents", () => {
  const rows = [
    {
      id: "1",
      firstName: "Alice",
      lastName: "Jones",
      email: "a@x.com",
      major: "CS",
      skills: "python",
      interestTags: ["ai"],
    },
    {
      id: "2",
      firstName: "Bob",
      lastName: "Smith",
      email: "b@x.com",
      major: "EE",
      skills: "",
      interestTags: [],
    },
  ]

  it("returns all when search empty", () => {
    expect(getFilteredStudents(rows, "   ").length).toBe(2)
  })

  it("filters by name", () => {
    expect(getFilteredStudents(rows, "alice").length).toBe(1)
  })

  it("filters by email", () => {
    expect(getFilteredStudents(rows, "b@x").length).toBe(1)
  })

  it("filters by interest tag substring", () => {
    expect(getFilteredStudents(rows, "ai").map((r) => r.id)).toEqual(["1"])
  })

  it("filters by major", () => {
    expect(getFilteredStudents(rows, "ee").map((r) => r.id)).toEqual(["2"])
  })

  it("filters by skills substring", () => {
    const withSkills = [
      ...rows,
      {
        id: "3",
        firstName: "C",
        lastName: "D",
        email: "c@x.com",
        major: "CS",
        skills: "kubernetes, docker",
        interestTags: [] as string[],
      },
    ]
    expect(getFilteredStudents(withSkills, "kube").map((r) => r.id)).toEqual(["3"])
  })
})

describe("formatInterestChipLabel and formatTagDisplay", () => {
  it("title-cases words and preserves empty token segments", () => {
    expect(formatInterestChipLabel("machine learning")).toBe("Machine Learning")
    expect(formatInterestChipLabel("  hi  world ")).toBe("  Hi  World ")
  })

  it("formatTagDisplay delegates to chip label", () => {
    expect(formatTagDisplay("finance")).toBe("Finance")
  })
})

describe("buildInfoMessage", () => {
  it("mentions booth pool when booth mode", () => {
    const m = buildInfoMessage("booth", "b1", 3, 3)
    expect(m).toContain("visited your booth")
  })

  it("mentions full list in all mode", () => {
    const m = buildInfoMessage("all", undefined, 5, 5)
    expect(m).toContain("full student list")
  })

  it("adds filter hint when counts differ", () => {
    const m = buildInfoMessage("all", undefined, 10, 2)
    expect(m).toContain("2 match your filters")
  })

  it("adds filter hint in booth mode when filtered differs from loaded", () => {
    const m = buildInfoMessage("booth", "b1", 10, 2)
    expect(m).toContain("visited your booth")
    expect(m).toContain("2 match your filters")
  })
})

describe("buildSendButtonLabel", () => {
  it("shows count when selections", () => {
    expect(buildSendButtonLabel(false, 3)).toBe("Send (3)")
  })

  it("shows Sending when loading", () => {
    expect(buildSendButtonLabel(true, 5)).toBe("Sending...")
  })

  it("shows plain Send when none selected", () => {
    expect(buildSendButtonLabel(false, 0)).toBe("Send")
  })
})

describe("getStudentCountLabel", () => {
  it("singular vs plural", () => {
    expect(getStudentCountLabel(1)).toBe("student")
    expect(getStudentCountLabel(2)).toBe("students")
  })
})

describe("emptyInviteListHint", () => {
  it("filter miss when students exist", () => {
    expect(emptyInviteListHint(5, "all", undefined)).toContain("filters")
  })

  it("booth empty", () => {
    expect(emptyInviteListHint(0, "booth", "x")).toContain("visited this booth")
  })

  it("global empty", () => {
    expect(emptyInviteListHint(0, "all", undefined)).toBe("No students found.")
  })
})
