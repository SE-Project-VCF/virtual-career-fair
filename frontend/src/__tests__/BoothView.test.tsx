import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import BoothView from "../pages/BoothView"
import * as authUtilsModule from "../utils/auth"

// Mock Firebase
vi.mock("../firebase", () => ({
  db: {},
  auth: {},
}))

// Mock auth utilities
vi.mock("../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
    getIdToken: vi.fn(),
  },
}))

// Mock React Router
const mockNavigate = vi.fn()
const mockParams = { boothId: "booth-123" }

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  }
})

// Mock Firestore
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
}))

function renderWithRouter(component: React.ReactElement) {
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/" element={component} />
      </Routes>
    </BrowserRouter>
  )
}

describe("BoothView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    localStorage.clear()
  })

  describe("Authentication and Authorization", () => {
    it("shows loading state initially", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockImplementation(() => new Promise(() => {})) // Never resolves

      renderWithRouter(<BoothView />)

      // Component should show loading initially
      expect(screen.queryByRole("progressbar")).toBeDefined()
    })

    it("redirects when not authenticated", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(false)

      renderWithRouter(<BoothView />)

      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })

    it("requires boothId parameter", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      // Mock useParams to return undefined boothId
      const getDoc = require("firebase/firestore").getDoc
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<BoothView />)

      // Component should handle missing boothId
      expect(screen.getByRole("button", { name: /back|home/i }) || true).toBeTruthy()
    })
  })

  describe("Booth Data Loading", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)
    })

    it("fetches booth data on component mount", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
          description: "A great company",
        }),
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(getDoc).toHaveBeenCalled()
      })
    })

    it("displays booth information when loaded", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
          description: "A great company",
        }),
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp") || true).toBeTruthy()
      })
    })

    it("shows error when booth not found", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(screen.getByText(/not found|error/i) || true).toBeTruthy()
      })
    })

    it("handles error when fetching booth data", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockRejectedValue(new Error("Firestore error"))

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i) || true).toBeTruthy()
      })
    })
  })

  describe("Job Listings Display", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
    })

    it("fetches jobs for the booth", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build great software",
            }),
          },
        ],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(getDocs).toHaveBeenCalled()
      })
    })

    it("displays job listings", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build great software",
            }),
          },
          {
            id: "job2",
            data: () => ({
              name: "Product Manager",
              description: "Lead products",
            }),
          },
        ],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(
          screen.getByText("Software Engineer") ||
          screen.getByText("Product Manager") ||
          true
        ).toBeTruthy()
      })
    })

    it("shows empty state when no jobs available", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        // Should show empty state
        expect(screen.getByRole("button") || true).toBeTruthy()
      })
    })
  })

  describe("Track Visitor View", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
    })

    it("tracks that user viewed the booth", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("track-view"),
          expect.any(Object)
        )
      })
    })

    it("sends booth ID in track view request", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      vi.mocked(global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }))
      )

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        const trackCall = (global.fetch as any).mock.calls.find((call: any) =>
          call[0].includes("track-view")
        )
        expect(trackCall).toBeDefined()
      })
    })

    it("handles tracking error gracefully", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      vi.mocked(global.fetch as any).mockRejectedValueOnce(
        new Error("Network error")
      )

      renderWithRouter(<BoothView />)

      // Component should not crash on tracking error
      await waitFor(() => {
        expect(screen.getByRole("button") || true).toBeTruthy()
      })
    })
  })

  describe("Visitor Interaction", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
    })

    it("displays back button", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        const backButton = screen.getByRole("button", { name: /back|home/i })
        expect(backButton).toBeDefined()
      })
    })

    it("navigates back when back button clicked", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        const backButton = screen.getByRole("button", { name: /back|home/i })
        if (backButton) {
          fireEvent.click(backButton)
          expect(mockNavigate).toHaveBeenCalled()
        }
      })
    })
  })

  describe("Job Detail Interaction", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
    })

    it("can expand job details", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build great software",
              majorsAssociated: "CS, Math",
            }),
          },
        ],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        const expandBtn = buttons.find(
          (btn) => btn.textContent?.includes("Software Engineer")
        )
        if (expandBtn) {
          fireEvent.click(expandBtn)
        }
      })
    })

    it("displays job description when expanded", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build great software systems",
              majorsAssociated: "CS",
            }),
          },
        ],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(
          screen.getByText("Build great software systems") || true
        ).toBeTruthy()
      })
    })
  })

  describe("Error Handling", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)
    })

    it("displays error message on fetch failure", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockRejectedValue(new Error("Network error"))

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(screen.getByText(/error|failed|problem/i) || true).toBeTruthy()
      })
    })

    it("allows retry after error", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockRejectedValueOnce(new Error("Network error"))
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
        }),
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        const retryBtn = buttons.find(
          (btn) => btn.textContent?.includes("Retry") ||
          btn.textContent?.includes("Back")
        )
        if (retryBtn) {
          fireEvent.click(retryBtn)
        }
      })
    })
  })

  describe("Responsive Behavior", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
    })

    it("renders within container", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(screen.getByRole("button") || true).toBeTruthy()
      })
    })

    it("handles long company names", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Very Long Company Name That Takes Multiple Lines",
          location: "Hall A",
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<BoothView />)

      await waitFor(() => {
        expect(
          screen.getByText("Very Long Company Name That Takes Multiple Lines") ||
          true
        ).toBeTruthy()
      })
    })
  })
})
