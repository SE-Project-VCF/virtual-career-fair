/**
 * Fair-scoped tests for BoothEditor, covering:
 *   - loadFairBooth (lines 269-326)
 *   - fair-scoped handleSubmit (lines 490-507)
 *   - handleStartFresh (lines 543-559)
 *   - companyId missing guard (lines 142-143)
 *   - back/cancel navigation when fairId is set
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import BoothEditor from "../BoothEditor"
import * as authUtils from "../../utils/auth"
import * as firestore from "firebase/firestore"
import { useFair } from "../../contexts/FairContext"

const mockNavigate = vi.fn()

// Mutable holders so individual tests can change values without re-mocking modules
const mockParams: { companyId: string | undefined } = { companyId: "company-1" }
const mockSearchParams: { instance: URLSearchParams } = { instance: new URLSearchParams() }

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useParams: () => ({ companyId: mockParams.companyId }),
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams.instance, vi.fn()],
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}))

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db: any, col: string, id: string) => ({ _collection: col, _id: id })),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  where: vi.fn(),
  query: vi.fn(),
}))

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}))

vi.mock("../../firebase", () => ({
  db: {},
  storage: {},
  auth: {
    currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") },
    onAuthStateChanged: vi.fn(),
  },
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}))

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
  FairProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}))

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockCompanyDoc = {
  exists: () => true,
  id: "company-1",
  data: () => ({
    companyName: "Tech Company",
    ownerId: "user-1",
    representativeIDs: [],
  }),
}

const fairBoothPayload = {
  boothId: "fair-booth-1",
  companyName: "Tech Company",
  industry: "software",
  companySize: "51-200",
  location: "San Francisco",
  description: "Fair booth description",
  contactName: "Jane Doe",
  contactEmail: "owner@company.com",
}

const renderBoothEditor = () =>
  render(
    <BrowserRouter>
      <BoothEditor />
    </BrowserRouter>
  )

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BoothEditor – fair-scoped", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockParams.companyId = "company-1"
    mockSearchParams.instance = new URLSearchParams()

    vi.mocked(useFair).mockReturnValue({ fairId: "fair-1", fair: null, isLive: false, loading: false })
    vi.mocked(authUtils.authUtils.isAuthenticated).mockReturnValue(true)
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
      email: "owner@company.com",
    })
    vi.mocked(firestore.getDoc).mockResolvedValue(mockCompanyDoc as any)
    vi.mocked(firestore.getDocs).mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ uid: "user-1", email: "owner@company.com" }) }],
    } as any)
    vi.mocked(firestore.updateDoc).mockResolvedValue(undefined)

    // Default: loadFairBooth returns 404 (no existing fair booth)
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 404, ok: false })
  })

  // -------------------------------------------------------------------------
  // companyId guard (lines 142-143)
  // -------------------------------------------------------------------------
  describe("companyId missing guard", () => {
    it("redirects to /companies when companyId is undefined", async () => {
      mockParams.companyId = undefined
      renderBoothEditor()
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/companies")
      })
    })
  })

  // -------------------------------------------------------------------------
  // loadFairBooth (lines 220, 269-326)
  // -------------------------------------------------------------------------
  describe("loadFairBooth", () => {
    it("prefills company name and shows Create Booth when API returns 404", async () => {
      renderBoothEditor()
      await waitFor(() => {
        expect((screen.getByRole("textbox", { name: /company name/i }) as HTMLInputElement).value).toBe("Tech Company")
      })
      expect(screen.getByRole("heading", { name: /create booth/i })).toBeInTheDocument()
    })

    it("loads booth data and shows Edit Booth on successful fetch", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => fairBoothPayload,
      })

      renderBoothEditor()

      await waitFor(() => {
        expect(
          (screen.getByRole("textbox", { name: /company description/i }) as HTMLInputElement).value
        ).toBe("Fair booth description")
      })
      expect(screen.getByRole("heading", { name: /edit booth/i })).toBeInTheDocument()
    })

    it("throws and shows error when fetch returns non-ok non-404 status without urlBoothId", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: async () => ({ error: "Server error" }),
      })

      renderBoothEditor()

      await waitFor(() => {
        expect(screen.getByText("Failed to load fair booth")).toBeInTheDocument()
      })
      consoleError.mockRestore()
    })

    it("uses urlBoothId fallback and prefills name when fetch throws and bid param is set", async () => {
      mockSearchParams.instance = new URLSearchParams("bid=url-booth-1")
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"))
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      renderBoothEditor()

      await waitFor(() => {
        expect(
          (screen.getByRole("textbox", { name: /company name/i }) as HTMLInputElement).value
        ).toBe("Tech Company")
      })
      expect(screen.queryByText("Failed to load fair booth")).not.toBeInTheDocument()
      consoleError.mockRestore()
    })

    it("shows error when fetch throws and no urlBoothId is present", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"))
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      renderBoothEditor()

      await waitFor(() => {
        expect(screen.getByText("Failed to load fair booth")).toBeInTheDocument()
      })
      consoleError.mockRestore()
    })
  })

  // -------------------------------------------------------------------------
  // Fair-scoped form submission (lines 490-507)
  // -------------------------------------------------------------------------
  describe("fair-scoped handleSubmit", () => {
    beforeEach(() => {
      // Load booth successfully so fairBoothId and form fields are set
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => fairBoothPayload,
      })
    })

    it("PUTs to the fair booth API and navigates to /fairs on success", async () => {
      const user = userEvent.setup()
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      renderBoothEditor()

      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /edit booth/i })).toBeInTheDocument()
      )

      await user.click(screen.getByRole("button", { name: /update booth/i }))

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/fairs/fair-1/booths/fair-booth-1",
          expect.objectContaining({ method: "PUT" })
        )
      })

      await waitFor(() =>
        expect(screen.getByText("Booth updated successfully!")).toBeInTheDocument()
      )

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/fairs"), {
        timeout: 3000,
      })
    }, 10000)

    it("shows generic error when PUT request fails", async () => {
      const user = userEvent.setup()
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Update failed" }),
      })

      renderBoothEditor()

      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /edit booth/i })).toBeInTheDocument()
      )

      await user.click(screen.getByRole("button", { name: /update booth/i }))

      await waitFor(() =>
        expect(screen.getByText(/failed to save booth/i)).toBeInTheDocument()
      )
    })

    it("shows error when fairBoothId is null (404 load) and user tries to save", async () => {
      const user = userEvent.setup()
      // Override: 404 so fairBoothId never gets set
      globalThis.fetch = vi.fn().mockResolvedValue({ status: 404, ok: false })

      renderBoothEditor()

      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument()
      )

      const industrySelect = screen.getByRole("combobox", { name: /industry/i })
      await user.click(industrySelect)
      await waitFor(() =>
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument()
      )
      await user.click(screen.getByRole("option", { name: /software development/i }))

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i })
      await user.click(sizeSelect)
      await waitFor(() =>
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument()
      )
      await user.click(screen.getByRole("option", { name: /51-200 employees/i }))

      await user.type(screen.getByRole("textbox", { name: /location/i }), "San Francisco")
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Test")
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Jane Doe")
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "owner@company.com")

      await user.click(screen.getByRole("button", { name: /create booth/i }))

      await waitFor(() =>
        expect(screen.getByText(/Unable to save.*booth not found/i)).toBeInTheDocument()
      )
    }, 15000)
  })

  // -------------------------------------------------------------------------
  // handleStartFresh (lines 543-559)
  // -------------------------------------------------------------------------
  describe("handleStartFresh", () => {
    it("shows Start Fresh banner when fairBoothHasData is true and resets form on click", async () => {
      const user = userEvent.setup()
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => fairBoothPayload,
      })

      renderBoothEditor()

      // Banner appears because fairBoothHasData is true (industry is set)
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /start fresh/i })).toBeInTheDocument()
      )

      await user.click(screen.getByRole("button", { name: /start fresh/i }))

      // Description field should be cleared
      await waitFor(() => {
        const desc = screen.getByRole("textbox", {
          name: /company description/i,
        }) as HTMLInputElement
        expect(desc.value).toBe("")
      })

      // Banner disappears after reset (fairBoothHasData set to false)
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: /start fresh/i })).not.toBeInTheDocument()
      )
    })
  })

  // -------------------------------------------------------------------------
  // Navigation with fairId (back arrow + cancel → /fairs)
  // -------------------------------------------------------------------------
  describe("navigation with fairId", () => {
    it("back arrow navigates to /fairs", async () => {
      const user = userEvent.setup()
      renderBoothEditor()

      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /create booth/i })).toBeInTheDocument()
      )

      // First button in the header is the ArrowBack icon button
      await user.click(screen.getAllByRole("button")[0])
      expect(mockNavigate).toHaveBeenCalledWith("/fairs")
    })

    it("Cancel button navigates to /fairs", async () => {
      const user = userEvent.setup()
      renderBoothEditor()

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
      )

      await user.click(screen.getByRole("button", { name: /cancel/i }))
      expect(mockNavigate).toHaveBeenCalledWith("/fairs")
    })
  })
})
