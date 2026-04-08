import { render, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { MemoryRouter } from "react-router-dom"
import CallInvitationsPage from "../CallInvitationsPage"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

import { authUtils } from "../../utils/auth"

describe("CallInvitationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("redirects students to /dashboard/1x1-calls", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "s1",
      role: "student",
      email: "s@test.com",
    } as ReturnType<typeof authUtils.getCurrentUser>)

    render(
      <MemoryRouter>
        <CallInvitationsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/1x1-calls", { replace: true })
    })
  })

  it("redirects non-students to /dashboard", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "e1",
      role: "representative",
      email: "e@test.com",
    } as ReturnType<typeof authUtils.getCurrentUser>)

    render(
      <MemoryRouter>
        <CallInvitationsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true })
    })
  })
})
