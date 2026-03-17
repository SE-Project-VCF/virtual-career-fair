import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import BoothView from "../pages/BoothView"
import { getDoc, getDocs, collection, query, where } from "firebase/firestore"

// Mock Firebase
vi.mock("firebase/firestore")
vi.mock("../firebase", () => ({ db: {} }))
vi.mock("../utils/boothHistory", () => ({
  trackBoothView: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ boothId: "booth-123" }),
  }
})

vi.mock("../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(() => ({ uid: "user-123", role: "student" })),
    isAuthenticated: vi.fn(() => true),
    getIdToken: vi.fn(async () => "token-123"),
  },
}))

describe("BoothView - Integration Tests", () => {
  const mockBoothData = {
    id: "booth-123",
    companyName: "TechCorp",
    industry: "software",
    companySize: "500+",
    location: "San Francisco, CA",
    description: "Leading technology company",
    logoUrl: "https://example.com/logo.png",
    openPositions: 2,
    website: "https://techcorp.com",
    careersPage: "https://techcorp.com/careers",
    contactName: "John Doe",
    contactEmail: "john@techcorp.com",
    contactPhone: "555-1234",
  }

  const mockJobs = [
    {
      id: "job-1",
      companyId: "booth-123",
      name: "Software Engineer",
      description: "Build great software",
      majorsAssociated: "Computer Science, Engineering",
      applicationLink: "https://techcorp.com/apply/job-1",
      createdAt: Date.now(),
      applicationForm: null,
    },
    {
      id: "job-2",
      companyId: "booth-123",
      name: "Product Manager",
      description: "Lead product strategy",
      majorsAssociated: "Business, Engineering",
      applicationLink: null,
      createdAt: Date.now(),
      applicationForm: { status: "published" },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    global.fetch = vi.fn((url: string) => {
      // Mock fair is live response
      if (url.includes("/api/fairs")) {
        return Promise.resolve(
          new Response(JSON.stringify({ fairs: [{ isLive: true }] }), {
            status: 200,
          })
        )
      }
      // Default response
      return Promise.resolve(new Response("{}"))
    })

    // Mock getDocs for jobs
    ;(getDocs as any).mockResolvedValue({
      docs: mockJobs.map((job) => ({
        id: job.id,
        data: () => job,
      })),
    })

    // Mock getDoc for booth
    ;(getDoc as any).mockResolvedValue({
      exists: () => true,
      id: "booth-123",
      data: () => mockBoothData,
    })
  })

  describe("Booth Display", () => {
    it("displays company logo when available", async () => {
      render(
        <BrowserRouter>
          <BoothView />
        </BrowserRouter>
      )

      await waitFor(
        () => {
          expect(screen.getByAltText("TechCorp logo")).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })
  })

  describe("Contact Information", () => {
    it("displays contact information section", async () => {
      render(
        <BrowserRouter>
          <BoothView />
        </BrowserRouter>
      )

      await waitFor(
        () => {
          expect(
            screen.getByText("Contact Information")
          ).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it("displays contact person name", async () => {
      render(
        <BrowserRouter>
          <BoothView />
        </BrowserRouter>
      )

      await waitFor(
        () => {
          expect(screen.getByText("John Doe")).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it("displays contact phone", async () => {
      render(
        <BrowserRouter>
          <BoothView />
        </BrowserRouter>
      )

      await waitFor(
        () => {
          expect(screen.getByText("555-1234")).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })
  })

  describe("Message Button", () => {
    it("displays message representative button", async () => {
      render(
        <BrowserRouter>
          <BoothView />
        </BrowserRouter>
      )

      await waitFor(
        () => {
          const buttons = screen.getAllByRole("button")
          expect(buttons.length).toBeGreaterThan(0)
        },
        { timeout: 5000 }
      )
    })
  })
})
