/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAnnouncementsBanner from "../FairAnnouncementsBanner"
import * as firebase from "../../firebase"

vi.mock("../../firebase", () => ({
  waitForFirebaseUser: vi.fn(),
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

describe("FairAnnouncementsBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.localStorage.clear()
    globalThis.fetch = vi.fn()
    vi.mocked(firebase.waitForFirebaseUser).mockResolvedValue({
      getIdToken: vi.fn().mockResolvedValue("banner-token"),
    } as any)
  })

  const ownerUser = {
    uid: "uid-1",
    email: "o@example.com",
    role: "companyOwner" as const,
    companyId: "comp-1",
  }

  it("loads announcements from API and filters out dismissed ids (localStorage)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        announcements: [
          {
            id: "ann-1",
            fairId: "f1",
            fairName: "Fair A",
            title: "Hello",
            description: "Body",
            published: true,
            publishedAt: Date.now(),
          },
          {
            id: "ann-2",
            fairId: "f2",
            fairName: "Fair B",
            title: "Stay",
            description: "",
            published: true,
            publishedAt: Date.now(),
          },
        ],
      }),
    } as Response)

    globalThis.localStorage.setItem("fairAnnouncementDismissed:uid-1:ann-1", "1")

    render(
      <BrowserRouter>
        <FairAnnouncementsBanner user={ownerUser} />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText("Stay")).toBeInTheDocument()
    })
    expect(screen.queryByText("Hello")).not.toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:5000/api/fairs/my-announcements",
      expect.objectContaining({
        headers: { Authorization: "Bearer banner-token" },
      }),
    )
  })

  it("shows all items when localStorage getItem throws during filter", async () => {
    const spy = vi.spyOn(globalThis.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        announcements: [
          {
            id: "ann-x",
            fairId: "f1",
            fairName: "Fair",
            title: "Shown",
            description: "D",
            published: true,
            publishedAt: Date.now(),
          },
        ],
      }),
    } as Response)

    render(
      <BrowserRouter>
        <FairAnnouncementsBanner user={ownerUser} />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText("Shown")).toBeInTheDocument()
    })

    spy.mockRestore()
  })

  it("returns null when fetch is not ok", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response)

    const { container } = render(
      <BrowserRouter>
        <FairAnnouncementsBanner user={ownerUser} />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(container.querySelector(".MuiPaper-root")).toBeNull()
    })
  })

  it("dismisses an announcement and removes it from the list", async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        announcements: [
          {
            id: "ann-d",
            fairId: "f1",
            fairName: "Fair",
            title: "Dismiss me",
            description: "",
            published: true,
            publishedAt: Date.now(),
          },
        ],
      }),
    } as Response)

    render(
      <BrowserRouter>
        <FairAnnouncementsBanner user={ownerUser} />
      </BrowserRouter>,
    )

    await waitFor(() => expect(screen.getByText("Dismiss me")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /dismiss announcement/i }))

    await waitFor(() => {
      expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument()
    })
    expect(globalThis.localStorage.getItem("fairAnnouncementDismissed:uid-1:ann-d")).toBe("1")
  })
})
