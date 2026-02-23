import { describe, it, expect, vi, beforeEach } from "vitest"
import { trackBoothView } from "../boothHistory"
import { doc, setDoc, serverTimestamp } from "firebase/firestore"

vi.mock("../../firebase", () => ({
  db: {},
}))

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _seconds: 1234567890, _nanoseconds: 0 })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("trackBoothView", () => {
  const mockBooth = {
    boothId: "booth-123",
    companyName: "Tech Corp",
    industry: "Technology",
    location: "San Francisco",
    logoUrl: "https://example.com/logo.png",
  }

  it("tracks booth view successfully with all fields", async () => {
    const mockDocRef = { id: "booth-123" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-123", mockBooth)

    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      "users",
      "user-123",
      "boothHistory",
      "booth-123"
    )
    expect(setDoc).toHaveBeenCalledWith(
      mockDocRef,
      {
        boothId: "booth-123",
        companyName: "Tech Corp",
        industry: "Technology",
        location: "San Francisco",
        logoUrl: "https://example.com/logo.png",
        lastViewedAt: expect.any(Object),
      },
      { merge: true }
    )
  })

  it("tracks booth view with minimal fields", async () => {
    const minimalBooth = {
      boothId: "booth-456",
      companyName: "Minimal Corp",
    }
    const mockDocRef = { id: "booth-456" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-456", minimalBooth)

    expect(setDoc).toHaveBeenCalledWith(
      mockDocRef,
      {
        boothId: "booth-456",
        companyName: "Minimal Corp",
        industry: null,
        location: null,
        logoUrl: null,
        lastViewedAt: expect.any(Object),
      },
      { merge: true }
    )
  })

  it("converts undefined optional fields to null", async () => {
    const boothWithUndefined = {
      boothId: "booth-789",
      companyName: "Undefined Corp",
      industry: undefined,
      location: undefined,
      logoUrl: undefined,
    }
    const mockDocRef = { id: "booth-789" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-789", boothWithUndefined)

    expect(setDoc).toHaveBeenCalledWith(
      mockDocRef,
      {
        boothId: "booth-789",
        companyName: "Undefined Corp",
        industry: null,
        location: null,
        logoUrl: null,
        lastViewedAt: expect.any(Object),
      },
      { merge: true }
    )
  })

  it("uses merge option to update existing history entry", async () => {
    const mockDocRef = { id: "booth-123" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-123", mockBooth)

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { merge: true }
    )
  })

  it("uses boothId as document ID for deduplication", async () => {
    const mockDocRef = { id: "booth-unique" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    const booth = { ...mockBooth, boothId: "booth-unique" }
    await trackBoothView("user-123", booth)

    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      "users",
      "user-123",
      "boothHistory",
      "booth-unique"
    )
  })

  it("includes serverTimestamp for lastViewedAt", async () => {
    const mockDocRef = { id: "booth-123" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-123", mockBooth)

    expect(serverTimestamp).toHaveBeenCalled()
    const setDocCall = vi.mocked(setDoc).mock.calls[0]
    const data = setDocCall[1] as any
    expect(data.lastViewedAt).toBeDefined()
  })

  it("does not track when uid is empty", async () => {
    await trackBoothView("", mockBooth)

    expect(setDoc).not.toHaveBeenCalled()
  })

  it("does not track when uid is undefined", async () => {
    await trackBoothView(undefined as any, mockBooth)

    expect(setDoc).not.toHaveBeenCalled()
  })

  it("does not track when booth is null", async () => {
    await trackBoothView("user-123", null as any)

    expect(setDoc).not.toHaveBeenCalled()
  })

  it("does not track when booth is undefined", async () => {
    await trackBoothView("user-123", undefined as any)

    expect(setDoc).not.toHaveBeenCalled()
  })

  it("does not track when boothId is empty", async () => {
    const invalidBooth = { ...mockBooth, boothId: "" }
    await trackBoothView("user-123", invalidBooth)

    expect(setDoc).not.toHaveBeenCalled()
  })

  it("does not track when boothId is missing", async () => {
    const invalidBooth = { companyName: "Tech Corp" } as any
    await trackBoothView("user-123", invalidBooth)

    expect(setDoc).not.toHaveBeenCalled()
  })

  it("handles setDoc errors gracefully", async () => {
    const mockDocRef = { id: "booth-123" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockRejectedValue(new Error("Firestore error"))

    await expect(trackBoothView("user-123", mockBooth)).rejects.toThrow("Firestore error")
  })

  it("tracks same booth for different users separately", async () => {
    const mockDocRef1 = { id: "booth-123" }
    const mockDocRef2 = { id: "booth-123" }
    vi.mocked(doc)
      .mockReturnValueOnce(mockDocRef1 as any)
      .mockReturnValueOnce(mockDocRef2 as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-1", mockBooth)
    await trackBoothView("user-2", mockBooth)

    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      "users",
      "user-1",
      "boothHistory",
      "booth-123"
    )
    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      "users",
      "user-2",
      "boothHistory",
      "booth-123"
    )
    expect(setDoc).toHaveBeenCalledTimes(2)
  })

  it("tracks different booths for same user separately", async () => {
    const booth1 = { ...mockBooth, boothId: "booth-1" }
    const booth2 = { ...mockBooth, boothId: "booth-2" }
    const mockDocRef1 = { id: "booth-1" }
    const mockDocRef2 = { id: "booth-2" }
    vi.mocked(doc)
      .mockReturnValueOnce(mockDocRef1 as any)
      .mockReturnValueOnce(mockDocRef2 as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-123", booth1)
    await trackBoothView("user-123", booth2)

    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      "users",
      "user-123",
      "boothHistory",
      "booth-1"
    )
    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      "users",
      "user-123",
      "boothHistory",
      "booth-2"
    )
    expect(setDoc).toHaveBeenCalledTimes(2)
  })

  it("preserves special characters in companyName", async () => {
    const specialBooth = {
      boothId: "booth-special",
      companyName: "Tech & Co. (USA) - 2024",
    }
    const mockDocRef = { id: "booth-special" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-123", specialBooth)

    const setDocCall = vi.mocked(setDoc).mock.calls[0]
    const data = setDocCall[1] as any
    expect(data.companyName).toBe("Tech & Co. (USA) - 2024")
  })

  it("handles empty strings for optional fields", async () => {
    const boothWithEmptyStrings = {
      boothId: "booth-empty",
      companyName: "Empty Corp",
      industry: "",
      location: "",
      logoUrl: "",
    }
    const mockDocRef = { id: "booth-empty" }
    vi.mocked(doc).mockReturnValue(mockDocRef as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    await trackBoothView("user-123", boothWithEmptyStrings)

    const setDocCall = vi.mocked(setDoc).mock.calls[0]
    const data = setDocCall[1] as any
    expect(data.industry).toBe("")
    expect(data.location).toBe("")
    expect(data.logoUrl).toBe("")
  })
})
