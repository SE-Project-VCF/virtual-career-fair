import { describe, it, expect, vi } from "vitest"
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
  it("renders title and both cards", () => {
    render(
      <MemoryRouter>
        <RoleSelection />
      </MemoryRouter>
    )

    expect(screen.getByText("Job Goblin - Virtual Career Fair")).toBeInTheDocument()
    expect(screen.getByText("Create Account")).toBeInTheDocument()
    expect(screen.getByText("Sign In")).toBeInTheDocument()
  })

  it("navigates to /register when Register card is clicked", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <RoleSelection />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Register Now"))
    expect(mockNavigate).toHaveBeenCalledWith("/register")
  })

  it("navigates to /login when Sign In card is clicked", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <RoleSelection />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign In Now"))
    expect(mockNavigate).toHaveBeenCalledWith("/login")
  })

  it("displays feature descriptions", () => {
    render(
      <MemoryRouter>
        <RoleSelection />
      </MemoryRouter>
    )

    expect(screen.getByText(/Register as student, employer, or representative/)).toBeInTheDocument()
    expect(screen.getByText(/Quick and secure login/)).toBeInTheDocument()
  })
})
