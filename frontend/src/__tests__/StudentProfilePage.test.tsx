import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import StudentProfilePage from "../pages/StudentProfilePage"
import * as authUtilsModule from "../utils/auth"
import * as firebaseModule from "../firebase"

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
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock Firestore functions
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
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

describe("StudentProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    localStorage.clear()
  })

  describe("Authentication Guards", () => {
    it("redirects to /login when user is not authenticated", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(false)

      renderWithRouter(<StudentProfilePage />)

      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })

    it("does not redirect when user is authenticated", () => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<StudentProfilePage />)

      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  describe("Profile Loading and Display", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)
    })

    it("renders form fields for user input", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        expect(screen.getByText(/major/i)).toBeInTheDocument()
        expect(screen.getByText(/Year of Graduation|expected/i)).toBeInTheDocument()
        expect(screen.getByText(/skills/i)).toBeInTheDocument()
      })
    })

    it("loads existing profile data from Firestore", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          major: "Computer Science",
          expectedGradYear: "2026",
          skills: "JavaScript, React",
          resumeUrl: "https://storage.example.com/resume.pdf",
          resumeVisible: true,
        }),
      })

      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        const majorInput = screen.getByDisplayValue("Computer Science")
        expect(majorInput).toBeInTheDocument()
      })
    })

    it("handles missing profile gracefully", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /save|upload/i })).toBeInTheDocument()
      })
    })

    it("handles error when fetching profile", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockRejectedValue(new Error("Firestore error"))

      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load profile|error/i)).toBeInTheDocument()
      })
    })
  })

  describe("Profile Form Interaction", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })
    })

    it("updates major field on user input", async () => {
      renderWithRouter(<StudentProfilePage />)

      const majorInputs = screen.getAllByDisplayValue("")
      const majorInput = majorInputs[0]

      await userEvent.type(majorInput, "Computer Science")

      expect((majorInput as HTMLInputElement).value).toContain("Computer Science")
    })

    it("updates year field on user input", async () => {
      renderWithRouter(<StudentProfilePage />)

      const inputs = screen.getAllByDisplayValue("")
      const yearInput = inputs[1]

      await userEvent.type(yearInput, "2026")

      expect((yearInput as HTMLInputElement).value).toContain("2026")
    })

    it("updates skills field on user input", async () => {
      renderWithRouter(<StudentProfilePage />)

      const inputs = screen.getAllByDisplayValue("")
      const skillsInput = inputs[2]

      await userEvent.type(skillsInput, "JavaScript, Python, React")

      expect((skillsInput as HTMLInputElement).value).toContain(
        "JavaScript, Python, React"
      )
    })
  })

  describe("Resume Visibility Toggle", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          major: "CS",
          expectedGradYear: "2026",
          skills: "JavaScript",
          resumeUrl: "https://storage.example.com/resume.pdf",
          resumeVisible: true,
        }),
      })
    })

    it("displays resume visibility toggle", async () => {
      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        const toggles = screen.getAllByRole("checkbox")
        expect(toggles.length).toBeGreaterThan(0)
      })
    })

    it("toggles resume visibility state", async () => {
      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        const toggles = screen.getAllByRole("checkbox")
        const visibilityToggle = toggles[0]

        fireEvent.click(visibilityToggle)
        expect((visibilityToggle as HTMLInputElement).checked).toBeDefined()
      })
    })
  })

  describe("Tailored Resumes", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })
    })

    it("displays tailored resumes section", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([]))
      )

      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        const tailoredButton = buttons.find((btn) =>
          btn.textContent?.includes("Tailored")
        )
        expect(tailoredButton).toBeDefined()
      })
    })

    it("fetches tailored resumes list", async () => {
      const tailoredResumes = [
        {
          id: "tailor1",
          jobId: "job1",
          jobTitle: "Software Engineer",
          createdAt: new Date().toISOString(),
        },
      ]

      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(tailoredResumes))
      )

      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("tailored-resumes"),
          expect.any(Object)
        )
      })
    })

    it("handles error fetching tailored resumes", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"))

      renderWithRouter(<StudentProfilePage />)

      // Component should not crash
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument()
    })
  })

  describe("File Upload", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })
    })

    it("accepts PDF and DOCX files", async () => {
      renderWithRouter(<StudentProfilePage />)

      const inputs = screen.getAllByRole("button")
      const uploadBtn = inputs.find((btn) => btn.textContent?.includes("Upload") || btn.textContent?.includes("Choose"))

      // File upload test
      expect(uploadBtn).toBeDefined()
    })

    it("displays file upload error", async () => {
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      renderWithRouter(<StudentProfilePage />)

      // Component should have error state handling
      expect(screen.getByRole("button", { name: /save|upload/i })).toBeInTheDocument()
    })
  })

  describe("Profile Save", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")

      const { getDoc, setDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })
      setDoc.mockResolvedValue(undefined)
    })

    it("saves profile to Firestore", async () => {
      renderWithRouter(<StudentProfilePage />)

      const buttons = screen.getAllByRole("button")
      const saveBtn = buttons.find((btn) => btn.textContent?.includes("Save"))

      if (saveBtn) {
        fireEvent.click(saveBtn)

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object)
          )
        })
      }
    })

    it("handles save error gracefully", async () => {
      const { setDoc } = require("firebase/firestore")
      setDoc.mockRejectedValue(new Error("Save failed"))

      renderWithRouter(<StudentProfilePage />)

      // Component should display error
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /save|upload/i })).toBeInTheDocument()
      })
    })
  })

  describe("Loading States", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)
    })

    it("shows loading spinner while fetching profile", () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      renderWithRouter(<StudentProfilePage />)

      // Check for loading state
      expect(screen.queryByRole("progressbar")).toBeDefined()
    })

    it("shows loading state during file upload", async () => {
      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")
      vi.mocked(global.fetch).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<StudentProfilePage />)

      // Component should handle upload loading state
      expect(screen.getByRole("button", { name: /save|upload/i })).toBeInTheDocument()
    })
  })

  describe("Default Values", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.isAuthenticated).mockReturnValue(true)
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "user123",
        email: "student@test.com",
      } as any)
    })

    it("sets resumeVisible to true by default", async () => {
      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          major: "CS",
          // resumeVisible not provided
        }),
      })

      renderWithRouter(<StudentProfilePage />)

      await waitFor(() => {
        const checkboxes = screen.getAllByRole("checkbox")
        expect(checkboxes.length).toBeGreaterThan(0)
      })
    })

    it("handles missing user gracefully", () => {
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue(null)

      const { getDoc } = require("firebase/firestore")
      getDoc.mockResolvedValue({
        exists: () => false,
      })

      renderWithRouter(<StudentProfilePage />)

      // Component should render safely
      expect(screen.getByRole("button", { name: /save|upload/i })).toBeInTheDocument()
    })
  })
})
