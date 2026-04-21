import { describe, it, expect, vi, beforeEach } from "vitest"
import { getDocs } from "firebase/firestore"
import { fetchOwnedCompaniesForUser } from "../ownedCompanies"

describe("fetchOwnedCompaniesForUser", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockReset()
  })

  it("maps docs, uses document id when companyName is missing, blank, or non-string; sorts by name", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      forEach: (fn: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
        fn({ id: "z-id", data: () => ({ companyName: "Zebra Co" }) })
        fn({ id: "n-id", data: () => ({ companyName: "   " }) })
        fn({ id: "a-id", data: () => ({ companyName: "Alpha" }) })
        fn({ id: "plain-id", data: () => ({ companyName: undefined }) })
        fn({ id: "num-id", data: () => ({ companyName: 99 }) })
      },
    } as any)

    const result = await fetchOwnedCompaniesForUser("owner-uid")

    expect(result).toEqual([
      { id: "a-id", companyName: "Alpha" },
      { id: "n-id", companyName: "n-id" },
      { id: "num-id", companyName: "num-id" },
      { id: "plain-id", companyName: "plain-id" },
      { id: "z-id", companyName: "Zebra Co" },
    ])
  })
})
