import { describe, it, expect } from "vitest"
import { getRepresentativeName } from "../utils/representativeUtils"

describe("getRepresentativeName", () => {
  it("returns full name when both firstName and lastName are provided", () => {
    const rep = {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
    }
    expect(getRepresentativeName(rep)).toBe("John Doe")
  })

  it("returns firstName only when lastName is not provided", () => {
    const rep = {
      firstName: "Jane",
      email: "jane@example.com",
    }
    expect(getRepresentativeName(rep)).toBe("Jane")
  })

  it("returns email when neither firstName nor lastName are provided", () => {
    const rep = {
      email: "contact@example.com",
    }
    expect(getRepresentativeName(rep)).toBe("contact@example.com")
  })

  it("returns email when firstName is empty string", () => {
    const rep = {
      firstName: "",
      lastName: "Smith",
      email: "smith@example.com",
    }
    expect(getRepresentativeName(rep)).toBe("smith@example.com")
  })

  it("handles email with special characters", () => {
    const rep = {
      email: "john.doe+recruiter@company.co.uk",
    }
    expect(getRepresentativeName(rep)).toBe("john.doe+recruiter@company.co.uk")
  })
})
