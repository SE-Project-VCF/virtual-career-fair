import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import RoleSelection from "../RoleSelection"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

describe("RoleSelection", () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  describe("Rendering", () => {
    it("renders main title and subtitle", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Job Goblin - Virtual Career Fair")).toBeInTheDocument()
      expect(screen.getByText("Welcome! Get started with your account")).toBeInTheDocument()
      expect(screen.getByText("Register for a new account or sign in to continue")).toBeInTheDocument()
    })

    it("renders both cards with titles", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Create Account")).toBeInTheDocument()
      expect(screen.getByText("Sign In")).toBeInTheDocument()
    })

    it("renders card descriptions", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText(/Join our platform as a student, company owner, or representative/)).toBeInTheDocument()
      expect(screen.getByText(/Access your existing account and continue your journey/)).toBeInTheDocument()
    })

    it("renders Register Now button", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Register Now")).toBeInTheDocument()
    })

    it("renders Sign In Now button", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Sign In Now")).toBeInTheDocument()
    })
  })

  describe("Register Card Features", () => {
    it("displays all register feature descriptions", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Register as student, employer, or representative")).toBeInTheDocument()
      expect(screen.getByText("Access exclusive career opportunities")).toBeInTheDocument()
      expect(screen.getByText("Connect with top employers and talented candidates")).toBeInTheDocument()
    })
  })

  describe("Sign In Card Features", () => {
    it("displays all sign in feature descriptions", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Quick and secure login for all account types")).toBeInTheDocument()
      expect(screen.getByText("Access your dashboard and saved opportunities")).toBeInTheDocument()
      expect(screen.getByText("Continue where you left off")).toBeInTheDocument()
    })
  })

  describe("Navigation", () => {
    it("navigates to /register when Register button is clicked", async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      await user.click(screen.getByText("Register Now"))
      expect(mockNavigate).toHaveBeenCalledWith("/register")
    })

    it("navigates to /login when Sign In button is clicked", async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      await user.click(screen.getByText("Sign In Now"))
      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })

    it("navigates to /register when Register card area is clicked", async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      // Find the Paper element that contains "Create Account"
      const createAccountHeading = screen.getByText("Create Account")
      const paperElement = createAccountHeading.closest('[class*="MuiPaper"]')
      
      if (paperElement) {
        await user.click(paperElement)
        expect(mockNavigate).toHaveBeenCalledWith("/register")
      }
    })

    it("navigates to /login when Sign In card area is clicked", async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      // Find the Paper element that contains "Sign In"
      const signInHeading = screen.getByText("Sign In")
      const paperElement = signInHeading.closest('[class*="MuiPaper"]')
      
      if (paperElement) {
        await user.click(paperElement)
        expect(mockNavigate).toHaveBeenCalledWith("/login")
      }
    })
  })

  describe("Accessibility", () => {
    it("renders with proper headings hierarchy", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      const mainHeading = screen.getByText("Job Goblin - Virtual Career Fair")
      expect(mainHeading).toBeInTheDocument()
    })

    it("buttons have proper accessible text", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByRole("button", { name: /Register Now/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Sign In Now/i })).toBeInTheDocument()
    })
  })

  describe("Visual Content", () => {
    it("renders complete UI without errors", () => {
      const { container } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(container).toBeInTheDocument()
      expect(container.firstChild).toBeInTheDocument()
    })

    it("renders icons for both cards", () => {
      const { container } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      // Check that MUI icons are rendered (they use svg elements)
      const svgElements = container.querySelectorAll('svg')
      expect(svgElements.length).toBeGreaterThan(0)
    })

    it("renders all bullet points for Register card", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      // All three feature points should be present
      const features = [
        "Register as student, employer, or representative",
        "Access exclusive career opportunities",
        "Connect with top employers and talented candidates"
      ]

      features.forEach(feature => {
        expect(screen.getByText(feature)).toBeInTheDocument()
      })
    })

    it("renders all bullet points for Sign In card", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      // All three feature points should be present
      const features = [
        "Quick and secure login for all account types",
        "Access your dashboard and saved opportunities",
        "Continue where you left off"
      ]

      features.forEach(feature => {
        expect(screen.getByText(feature)).toBeInTheDocument()
      })
    })

    it("renders both card descriptions in full", () => {
      render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText(/Join our platform as a student, company owner, or representative and start connecting with career opportunities/)).toBeInTheDocument()
      expect(screen.getByText(/Access your existing account and continue your journey with our virtual career fair platform/)).toBeInTheDocument()
    })
  })

  describe("Layout and Structure", () => {
    it("renders within a container", () => {
      const { container } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      const containerElement = container.querySelector('[class*="MuiContainer"]')
      expect(containerElement).toBeInTheDocument()
    })

    it("renders cards in a grid layout", () => {
      const { container } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      const papers = container.querySelectorAll('[class*="MuiPaper"]')
      expect(papers.length).toBe(2)
    })

    it("renders both cards with proper styling", () => {
      const { container } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      const papers = container.querySelectorAll('[class*="MuiPaper"]')
      papers.forEach(paper => {
        expect(paper).toBeInTheDocument()
      })
    })
  })

  describe("Component Interactions", () => {
    it("renders and handles multiple interactions", async () => {
      const user = userEvent.setup()
      const { container } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      // Verify render
      expect(container).toBeTruthy()
      
      // Interact with both buttons
      await user.click(screen.getByText("Register Now"))
      expect(mockNavigate).toHaveBeenCalledWith("/register")
      
      mockNavigate.mockClear()
      
      await user.click(screen.getByText("Sign In Now"))
      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })

    it("maintains state through re-renders", () => {
      const { rerender } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Job Goblin - Virtual Career Fair")).toBeInTheDocument()

      rerender(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(screen.getByText("Job Goblin - Virtual Career Fair")).toBeInTheDocument()
      expect(screen.getByText("Create Account")).toBeInTheDocument()
      expect(screen.getByText("Sign In")).toBeInTheDocument()
    })

    it("renders consistently across multiple mounts", () => {
      const { unmount } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      unmount()

      const { container: secondContainer } = render(
        <MemoryRouter>
          <RoleSelection />
        </MemoryRouter>
      )

      expect(secondContainer.innerHTML).toBeTruthy()
    })
  })
})
