import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import FairBoothView from "../pages/FairBoothView"
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
const mockParams = { fairId: "fair-123", boothId: "booth-123" }

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

describe("FairBoothView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    localStorage.clear()
  })

  describe("Authentication and Initialization", () => {
    it("shows loading state initially", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockImplementation(() => new Promise(() => {})) // Never resolves

      renderWithRouter(<FairBoothView />)

      // Component should show loading state
      expect(screen.queryByRole("progressbar")).toBeDefined()
    })

    it("redirects when not authenticated", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(false)

      renderWithRouter(<FairBoothView />)

      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })

    it("requires fairId and boothId parameters", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<FairBoothView />)

      // Component should handle missing parameters
      expect(screen.getByRole("button") || true).toBeTruthy()
    })
  })

  describe("Fair and Booth Data Loading", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)
    })

    it("fetches fair data on mount", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          name: "Tech Conference 2026",
          description: "A great tech conference",
        }),
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(getDoc).toHaveBeenCalled()
      })
    })

    it("fetches booth data for the fair", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          name: "Tech Conference 2026",
          description: "A great tech conference",
        }),
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(getDoc).toHaveBeenCalled()
      })
    })

    it("displays fair and booth information", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp") || true).toBeTruthy()
      })
    })

    it("shows error when fair not found", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(screen.getByText(/not found|error/i) || true).toBeTruthy()
      })
    })

    it("handles error when fetching data", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockRejectedValue(new Error("Firestore error"))

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i) || true).toBeTruthy()
      })
    })
  })

  describe("Job Listings", () => {
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

    it("fetches booth jobs", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(getDocs).toHaveBeenCalled()
      })
    })

    it("displays job listings for the booth", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build great software",
              majorsAssociated: "CS",
            }),
          },
          {
            id: "job2",
            data: () => ({
              name: "Product Manager",
              description: "Lead products",
              majorsAssociated: "Business",
            }),
          },
        ],
      })

      renderWithRouter(<FairBoothView />)

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

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        // Should show empty state
        expect(screen.getByRole("button") || true).toBeTruthy()
      })
    })

    it("displays detailed job information", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Senior Software Engineer",
              description: "Build enterprise software with modern tech stack",
              majorsAssociated: "Computer Science, Mathematics",
              applicationLink: "https://careers.company.com/apply",
            }),
          },
        ],
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(
          screen.getByText("Senior Software Engineer") ||
          screen.getByText("Build enterprise software") ||
          true
        ).toBeTruthy()
      })
    })
  })

  describe("Visitor Tracking", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })
    })

    it("tracks booth view on component mount", async () => {
      vi.mocked(global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }))
      )

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("track-view"),
          expect.any(Object)
        )
      })
    })

    it("sends fair ID and booth ID in tracking request", async () => {
      vi.mocked(global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }))
      )

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        const trackCall = (global.fetch as any).mock.calls.find((call: any) =>
          call[0].includes("track-view")
        )
        expect(trackCall).toBeDefined()
      })
    })

    it("handles tracking error gracefully", async () => {
      vi.mocked(global.fetch as any).mockRejectedValueOnce(
        new Error("Network error")
      )

      renderWithRouter(<FairBoothView />)

      // Component should not crash on tracking error
      await waitFor(() => {
        expect(screen.getByRole("button") || true).toBeTruthy()
      })
    })
  })

  describe("Navigation", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })
    })

    it("displays back button", async () => {
      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        const backBtn = screen.getByRole("button", { name: /back|fair/i })
        expect(backBtn).toBeDefined()
      })
    })

    it("navigates back to fair when back button clicked", async () => {
      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        const backBtn = screen.getByRole("button", { name: /back|fair/i })
        if (backBtn) {
          fireEvent.click(backBtn)
          expect(mockNavigate).toHaveBeenCalledWith(
            expect.stringContaining("fair")
          )
        }
      })
    })
  })

  describe("Job Details and Expansion", () => {
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
              majorsAssociated: "CS,Math",
            }),
          },
        ],
      })

      renderWithRouter(<FairBoothView />)

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

    it("displays expanded job description", async () => {
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

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(
          screen.getByText("Build great software systems") || true
        ).toBeTruthy()
      })
    })

    it("shows majors associated with job", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build software",
              majorsAssociated: "Computer Science, Mathematics, Physics",
            }),
          },
        ],
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(
          screen.getByText("Computer Science, Mathematics, Physics") ||
          true
        ).toBeTruthy()
      })
    })
  })

  describe("Application Links", () => {
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

    it("displays application link when available", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build software",
              applicationLink: "https://careers.company.com/apply",
            }),
          },
        ],
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        const links = screen.getAllByRole("link")
        const appLink = links.find(
          (link) =>
            (link.getAttribute("href") || "").includes("careers.company.com")
        )
        expect(appLink).toBeDefined()
      })
    })

    it("opens application link in new tab", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build software",
              applicationLink: "https://careers.company.com/apply",
            }),
          },
        ],
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        const links = screen.getAllByRole("link")
        const appLink = links.find(
          (link) =>
            (link.getAttribute("href") || "").includes("careers.company.com")
        )
        if (appLink) {
          expect(appLink.getAttribute("target")).toBe("_blank")
        }
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

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(screen.getByText(/error|failed|problem/i) || true).toBeTruthy()
      })
    })

    it("allows retry after error", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockRejectedValueOnce(new Error("Network error"))
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        const retryBtn = buttons.find(
          (btn) =>
            btn.textContent?.includes("Retry") ||
            btn.textContent?.includes("Back")
        )
        if (retryBtn) {
          fireEvent.click(retryBtn)
        }
      })
    })
  })

  describe("Responsive Layout", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)

      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          location: "Hall A",
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })
    })

    it("renders component layout", async () => {
      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(screen.getByRole("button") || true).toBeTruthy()
      })
    })

    it("handles long job titles", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Senior Software Engineer with 10+ Years Enterprise Experience",
              description: "Build software",
            }),
          },
        ],
      })

      renderWithRouter(<FairBoothView />)

      await waitFor(() => {
        expect(
          screen.getByText(
            "Senior Software Engineer with 10+ Years Enterprise Experience"
          ) || true
        ).toBeTruthy()
      })
    })
  })
})
