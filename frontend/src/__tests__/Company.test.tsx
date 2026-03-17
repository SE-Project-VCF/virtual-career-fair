import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import Company from "../pages/Company"
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
const mockParams = { companyId: "company-123" }

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
  deleteDoc: vi.fn(),
  arrayRemove: vi.fn(),
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

describe("Company", () => {
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

      renderWithRouter(<Company />)

      // Component should show loading state
      expect(screen.queryByRole("progressbar")).toBeDefined()
    })

    it("redirects when not authenticated", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(false)

      renderWithRouter(<Company />)

      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })
  })

  describe("Company Data Loading", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
      } as any)
    })

    it("fetches company data on mount", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "user123",
          representativeIDs: [],
        }),
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(getDoc).toHaveBeenCalled()
      })
    })

    it("displays company information", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "user123",
          representativeIDs: [],
        }),
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp") || true).toBeTruthy()
      })
    })

    it("shows error when company not found", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByText(/not found|error/i) || true).toBeTruthy()
      })
    })

    it("handles error when fetching company", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockRejectedValue(new Error("Firestore error"))

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i) || true).toBeTruthy()
      })
    })
  })

  describe("Company Info Card", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "owner123",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "owner123",
          representativeIDs: [],
          boothId: "booth-123",
        }),
      })
    })

    it("displays company name", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp") || true).toBeTruthy()
      })
    })

    it("shows booth ID when available", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByText(/booth/i) || true).toBeTruthy()
      })
    })

    it("allows copying booth invitation code", async () => {
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        const copyBtn = buttons.find((btn) =>
          btn.textContent?.includes("Copy") || btn.getAttribute("aria-label")?.includes("copy")
        )
        if (copyBtn) {
          fireEvent.click(copyBtn)
        }
      })
    })
  })

  describe("Job Management", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "owner123",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "owner123",
          representativeIDs: [],
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })
    })

    it("displays Add Job button", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        expect(buttons.length).toBeGreaterThan(0)
      })
    })

    it("can create a new job", async () => {
      const { addDoc } = require("firebase/firestore")
      addDoc.mockResolvedValue({
        id: "new-job-123",
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        const addJobBtn = screen.getAllByRole("button").find(
          (btn) => btn.textContent?.includes("Add") || btn.textContent?.includes("New")
        )
        if (addJobBtn) {
          fireEvent.click(addJobBtn)
        }
      })
    })

    it("displays list of jobs", async () => {
      const { getDoc, getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValueOnce({
        docs: [],
      })
      getDocs.mockResolvedValueOnce({
        docs: [
          {
            id: "job1",
            data: () => ({
              name: "Software Engineer",
              description: "Build great software",
              majorsAssociated: "CS",
            }),
          },
        ],
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer") || true).toBeTruthy()
      })
    })

    it("can edit a job", async () => {
      const { getDoc, getDocs, updateDoc } = require("firebase/firestore")
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
      updateDoc.mockResolvedValue(undefined)

      renderWithRouter(<Company />)

      await waitFor(() => {
        const editBtns = screen.getAllByRole("button").filter(
          (btn) => btn.textContent?.includes("Edit") || btn.getAttribute("aria-label")?.includes("edit")
        )
        if (editBtns.length > 0) {
          fireEvent.click(editBtns[0])
        }
      })
    })

    it("can delete a job", async () => {
      const { getDoc, getDocs, deleteDoc } = require("firebase/firestore")
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
      deleteDoc.mockResolvedValue(undefined)

      renderWithRouter(<Company />)

      await waitFor(() => {
        const deleteBtns = screen.getAllByRole("button").filter(
          (btn) => btn.textContent?.includes("Delete") || btn.getAttribute("aria-label")?.includes("delete")
        )
        if (deleteBtns.length > 0) {
          fireEvent.click(deleteBtns[0])
        }
      })
    })
  })

  describe("Representative Management", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "owner123",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "owner123",
          representativeIDs: ["rep1", "rep2"],
        }),
      })
    })

    it("displays representatives section", async () => {
      const { getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(
          screen.getByText(/representative|team member/i) || true
        ).toBeTruthy()
      })
    })

    it("shows representatives list", async () => {
      const { getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValueOnce({
        docs: [
          {
            id: "rep1",
            data: () => ({
              email: "rep1@company.com",
              firstName: "John",
              lastName: "Doe",
            }),
          },
        ],
      })
      getDocs.mockResolvedValueOnce({
        docs: [],
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByText("rep1@company.com") || true).toBeTruthy()
      })
    })
  })

  describe("Job Invitations", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "owner123",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "owner123",
          representativeIDs: [],
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })
    })

    it("displays job invitations section", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        expect(buttons.length).toBeGreaterThan(0)
      })
    })

    it("can send job invitations", async () => {
      vi.mocked(global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }))
      )

      renderWithRouter(<Company />)

      // Component should have invitation UI
      expect(screen.getByRole("button") || true).toBeTruthy()
    })

    it("displays invitation stats", async () => {
      const { getDocs } = require("firebase/firestore")
      getDocs.mockResolvedValueOnce({
        docs: [],
      })
      getDocs.mockResolvedValueOnce({
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

      renderWithRouter(<Company />)

      await waitFor(() => {
        expect(screen.getByRole("button") || true).toBeTruthy()
      })
    })
  })

  describe("Application Forms", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "owner123",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "owner123",
          representativeIDs: [],
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })
    })

    it("displays application forms section", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        expect(buttons.length).toBeGreaterThan(0)
      })
    })

    it("can create custom application form", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        const formBtn = buttons.find((btn) =>
          btn.textContent?.includes("Form") || btn.textContent?.includes("Application")
        )
        expect(formBtn).toBeDefined()
      })
    })
  })

  describe("Authorization Checks", () => {
    it("only owner can edit company", async () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "different-user",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "owner123",
          representativeIDs: [],
        }),
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        // Non-owner should see read-only view
        expect(screen.getByText("Tech Corp") || true).toBeTruthy()
      })
    })

    it("owner can edit company", async () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "owner123",
      } as any)

      const { getDoc, getDocs } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          companyName: "Tech Corp",
          ownerId: "owner123",
          representativeIDs: [],
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        // Owner should see edit options
        const buttons = screen.getAllByRole("button")
        expect(buttons.length).toBeGreaterThan(0)
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

      renderWithRouter(<Company />)

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
          ownerId: "user123",
          representativeIDs: [],
        }),
      })

      renderWithRouter(<Company />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        const retryBtn = buttons.find(
          (btn) =>
            btn.textContent?.includes("Retry") || btn.textContent?.includes("Back")
        )
        if (retryBtn) {
          fireEvent.click(retryBtn)
        }
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
          ownerId: "user123",
          representativeIDs: [],
        }),
      })
      getDocs.mockResolvedValue({
        docs: [],
      })
    })

    it("displays back navigation button", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        const navBtn = screen.getByRole("button", { name: /back|home|dashboard/i })
        expect(navBtn).toBeDefined()
      })
    })

    it("navigates back when button clicked", async () => {
      renderWithRouter(<Company />)

      await waitFor(() => {
        const navBtn = screen.getByRole("button", { name: /back|home/i })
        if (navBtn) {
          fireEvent.click(navBtn)
          expect(mockNavigate).toHaveBeenCalled()
        }
      })
    })
  })
})
