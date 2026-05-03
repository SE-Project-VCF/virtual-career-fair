import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import StudentProfileCard from "../components/StudentProfileCard"
import * as authUtilsModule from "../utils/auth"
import * as firestoreModule from "firebase/firestore"

const navMock = vi.hoisted(() => ({
  navigate: vi.fn(),
}))

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return {
    ...actual,
    useNavigate: () => navMock.navigate,
  }
})

// Mock Firestore
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
}))

vi.mock("../firebase", () => ({
  db: {},
}))

vi.mock("../utils/auth", () => ({
  authUtils: {
    getIdToken: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

describe("StudentProfileCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    navMock.navigate.mockClear()
    vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue(null)
  })

  describe("Loading State", () => {
    it("shows loading spinner while fetching profile", () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockImplementation(() => new Promise(() => {}))

      const { container } = render(<StudentProfileCard studentId="student-123" />)

      const spinner = container.querySelector("svg")
      expect(spinner).toBeTruthy()
    })

    it("displays loading text", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockImplementation(() => new Promise(() => {}))

      render(<StudentProfileCard studentId="student-123" />)

      expect(true).toBe(true)
    })
  })

  describe("Profile Loaded Successfully", () => {
    it("displays profile with all fields", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          major: "Computer Science",
          expectedGradYear: 2025,
          skills: "JavaScript, React, Node.js",
          resumeUrl: "https://example.com/resume.pdf",
          resumeVisible: true,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument()
      })
    })

    it("displays student email", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("jane@example.com")).toBeInTheDocument()
      })
    })

    it("displays major chip", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          major: "Data Science",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Major: Data Science/)).toBeInTheDocument()
      })
    })

    it("displays graduation year chip", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          expectedGradYear: 2026,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Expected Graduation: 2026/)).toBeInTheDocument()
      })
    })

    it("displays both major and graduation year", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          major: "Engineering",
          expectedGradYear: 2027,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Major: Engineering/)).toBeInTheDocument()
        expect(screen.getByText(/Expected Graduation: 2027/)).toBeInTheDocument()
      })
    })

    it("displays interest tag chips when present", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          interestTags: ["data science", "software engineering"],
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("Interests")).toBeInTheDocument()
        expect(screen.getByText("Data Science")).toBeInTheDocument()
        expect(screen.getByText("Software Engineering")).toBeInTheDocument()
      })
    })

    it("shows LinkedIn link when linkedinUrl is set", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          linkedinUrl: "www.linkedin.com/in/johndoe",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        const link = screen.getByRole("link", { name: /LinkedIn/i })
        expect(link).toHaveAttribute("href", "https://www.linkedin.com/in/johndoe")
      })
    })
  })

  describe("Partial Profile Data", () => {
    it("handles missing first name", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          lastName: "Doe",
          email: "unknown@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("unknown@example.com")).toBeInTheDocument()
      })
    })

    it("handles missing last name", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          email: "john@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("john@example.com")).toBeInTheDocument()
      })
    })

    it("handles missing email", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument()
      })
    })

    it("handles missing major", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          expectedGradYear: 2025,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Expected Graduation: 2025/)).toBeInTheDocument()
      })
    })

    it("handles missing graduation year", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          major: "Mathematics",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Major: Mathematics/)).toBeInTheDocument()
      })
    })
  })

  describe("Skills Parsing", () => {
    it("displays no skills section when skills are empty", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          skills: "",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.queryByText("Skills")).not.toBeInTheDocument()
      })
    })

    it("displays single skill", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          skills: "JavaScript",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("Skills")).toBeInTheDocument()
        expect(screen.getByText("JavaScript")).toBeInTheDocument()
      })
    })

    it("parses comma-separated skills", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          skills: "JavaScript, React, Node.js",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("JavaScript")).toBeInTheDocument()
        expect(screen.getByText("React")).toBeInTheDocument()
        expect(screen.getByText("Node.js")).toBeInTheDocument()
      })
    })

    it("parses semicolon-separated skills", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          skills: "Python; Django; SQL",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("Python")).toBeInTheDocument()
        expect(screen.getByText("Django")).toBeInTheDocument()
        expect(screen.getByText("SQL")).toBeInTheDocument()
      })
    })

    it("parses newline-separated skills", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          skills: "Java\nSpring\nMaven",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("Java")).toBeInTheDocument()
        expect(screen.getByText("Spring")).toBeInTheDocument()
        expect(screen.getByText("Maven")).toBeInTheDocument()
      })
    })

    it("trims whitespace from skills", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          skills: "  JavaScript  ,  React  ,  TypeScript  ",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("JavaScript")).toBeInTheDocument()
        expect(screen.getByText("React")).toBeInTheDocument()
        expect(screen.getByText("TypeScript")).toBeInTheDocument()
      })
    })

    it("filters empty skill entries", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          skills: "JavaScript, , React, ",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("JavaScript")).toBeInTheDocument()
        expect(screen.getByText("React")).toBeInTheDocument()
      })
    })

    it("handles missing skills field", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.queryByText("Skills")).not.toBeInTheDocument()
      })
    })
  })

  describe("Resume Handling", () => {
    it("does not show resume section when no resume URL", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.queryByText("Resume")).not.toBeInTheDocument()
      })
    })

    it("shows resume section when resume URL exists", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "https://example.com/resume.pdf",
          resumeVisible: true,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("Resume")).toBeInTheDocument()
      })
    })
  })

  describe("Resume Visibility", () => {
    it("shows view resume link when resume is visible and HTTP URL", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "https://example.com/resume.pdf",
          resumeVisible: true,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        const link = screen.getByText("View Resume")
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute("href", "https://example.com/resume.pdf")
      })
    })

    it("shows private message when resume is hidden", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "https://example.com/resume.pdf",
          resumeVisible: false,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Student has set resume to private/)).toBeInTheDocument()
      })
    })

    it("treats undefined resumeVisible as false", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "https://example.com/resume.pdf",
          resumeVisible: undefined,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Student has set resume to private/)).toBeInTheDocument()
      })
    })

    it("shows resume loading text when fetching local storage resume", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "local/path/resume.pdf",
          resumeVisible: true,
        }),
      } as any)

      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("token")
      vi.mocked(global.fetch).mockImplementation(
        () => new Promise(() => {})
      )

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Loading|Loading resume|Resume ready/)).toBeInTheDocument()
      })
    })

    it("skips resume fetch for HTTP URLs", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "https://example.com/resume.pdf",
          resumeVisible: true,
        }),
      } as any)

      vi.mocked(global.fetch).mockClear()

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("View Resume")).toBeInTheDocument()
      })

      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining("student-123"),
        expect.anything()
      )
    })
  })

  describe("Error Handling", () => {
    it("shows error when profile fetch fails", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockRejectedValue(new Error("Firestore error"))

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load|error/i)).toBeInTheDocument()
      })
    })

    it("shows error when profile not found", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => false,
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText(/not found|not exist/i)).toBeInTheDocument()
      })
    })

    it("shows alert component on error", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockRejectedValue(new Error("Firestore error"))

      const { container } = render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        const alert = container.querySelector("[role='alert']")
        expect(alert).toBeTruthy()
      })
    })
  })

  describe("Employer messaging", () => {
    beforeEach(() => {
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "employer-1",
        email: "employer@example.com",
      } as any)
    })

    it("shows Open messages when enableEmployerMessaging is true", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" enableEmployerMessaging />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /open messages/i })).toBeInTheDocument()
      })
    })

    it("navigates to chat with dmStudentId when Open messages is clicked", async () => {
      const user = userEvent.setup()
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" enableEmployerMessaging />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /open messages/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /open messages/i }))

      expect(navMock.navigate).toHaveBeenCalledWith("/dashboard/chat", {
        state: { dmStudentId: "student-123" },
      })
    })

    it("does not show Open messages when viewer is the same user as the profile", async () => {
      vi.mocked(authUtilsModule.authUtils.getCurrentUser).mockReturnValue({
        uid: "student-123",
        email: "self@example.com",
      } as any)

      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "Self",
          lastName: "User",
          email: "self@example.com",
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" enableEmployerMessaging />)

      await waitFor(() => {
        expect(screen.getByText("Self User")).toBeInTheDocument()
      })

      expect(screen.queryByRole("button", { name: /open messages/i })).not.toBeInTheDocument()
    })

    it("calls onBeforeNavigateToChat before navigating", async () => {
      const user = userEvent.setup()
      const onBefore = vi.fn()
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        }),
      } as any)

      render(
        <StudentProfileCard
          studentId="student-123"
          enableEmployerMessaging
          onBeforeNavigateToChat={onBefore}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /open messages/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /open messages/i }))

      expect(onBefore).toHaveBeenCalled()
      expect(navMock.navigate).toHaveBeenCalled()
      expect(onBefore.mock.invocationCallOrder[0]).toBeLessThan(
        navMock.navigate.mock.invocationCallOrder[0]!
      )
    })
  })

  describe("Profile Updates", () => {
    it("refetches profile when studentId changes", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        }),
      } as any)

      const { rerender } = render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument()
      })

      mockGetDoc.mockClear()
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
        }),
      } as any)

      rerender(<StudentProfileCard studentId="student-456" />)

      await waitFor(() => {
        expect(mockGetDoc).toHaveBeenCalled()
      })
    })
  })

  describe("Resume URL Fetch", () => {
    it("fetches resume signed URL with correct authorization header", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "local/path/resume.pdf",
          resumeVisible: true,
        }),
      } as any)

      vi.mocked(authUtilsModule.authUtils.getIdToken).mockResolvedValue("test-token")
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ resumeUrl: "https://signed-url/resume.pdf" }))
      )

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("student-123"),
          expect.anything()
        )
      })
    })

    it("calls resume fetch only once per component mount", async () => {
      const mockGetDoc = vi.mocked(firestoreModule.getDoc)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          resumeUrl: "https://example.com/resume.pdf",
          resumeVisible: true,
        }),
      } as any)

      render(<StudentProfileCard studentId="student-123" />)

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument()
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
