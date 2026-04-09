/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import FairyJobmotherAssistant from "../FairyJobmotherAssistant"
import { JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY } from "../../../constants/jobmother"
import { authUtils } from "../../../utils/auth"

vi.mock("../../../utils/auth", () => ({
  authUtils: {
    getIdToken: vi.fn(),
    getCurrentUser: vi.fn(() => ({
      uid: "u1",
      email: "u@test.com",
      role: "student" as const,
    })),
  },
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/fair/:fairId/booths" element={<FairyJobmotherAssistant />} />
        <Route path="*" element={<FairyJobmotherAssistant />} />
      </Routes>
    </MemoryRouter>
  )
}

describe("FairyJobmotherAssistant", () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY)
    globalThis.localStorage?.removeItem("jobmother-teaser-dismissed")
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token")
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        reply: "Try this page.",
        links: [{ path: "/fairs", label: "Browse Fairs" }],
        tips: [],
        needsClarification: false,
      }),
    }) as unknown as typeof fetch
  })

  it("opens the panel and focuses input when the launcher is clicked", async () => {
    const user = userEvent.setup()
    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument()
  })

  it("closes on Escape", async () => {
    const user = userEvent.setup()
    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("calls navigate API with token, pathname, and optional fairId", async () => {
    const user = userEvent.setup()
    renderAt("/fair/my-fair/booths")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    const field = screen.getByPlaceholderText(/Type a message/i)
    await user.type(field, "Where are booths?")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(url).toContain("/api/jobmother/navigate")
    expect(init?.method).toBe("POST")
    const body = JSON.parse((init?.body as string) || "{}")
    expect(body.message).toBe("Where are booths?")
    expect(body.pathname).toBe("/fair/my-fair/booths")
    expect(body.fairId).toBe("my-fair")
    expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer mock-token")
  })

  it("renders assistant reply and link buttons after a successful send", async () => {
    const user = userEvent.setup()
    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    const field = screen.getByPlaceholderText(/Type a message/i)
    await user.type(field, "Hello fairy")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    expect(screen.getByText("Hello fairy")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("Try this page.")).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /Browse Fairs/i })).toBeInTheDocument()
  })

  it("sends on Enter without Shift", async () => {
    const user = userEvent.setup()
    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    const field = screen.getByPlaceholderText(/Type a message/i)
    await user.type(field, "Hi")
    await user.keyboard("{Enter}")

    await waitFor(() => {
      expect(screen.getByText("Try this page.")).toBeInTheDocument()
    })
  })

  it("shows API error text when response is not ok", async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server busy" }),
    } as Response)

    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    await user.type(screen.getByPlaceholderText(/Type a message/i), "x")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    await waitFor(() => {
      expect(screen.getByText("Server busy")).toBeInTheDocument()
    })
  })

  it("shows network error when fetch throws", async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("offline"))

    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    await user.type(screen.getByPlaceholderText(/Type a message/i), "x")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/Network error\. Check your connection and try again\./i)
      ).toBeInTheDocument()
    })
  })

  it("prompts to sign in when getIdToken returns null", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.getIdToken).mockResolvedValueOnce(null)

    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    await user.type(screen.getByPlaceholderText(/Type a message/i), "x")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    await waitFor(() => {
      expect(screen.getByText(/Please sign in again/i)).toBeInTheDocument()
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("dismissing the welcome hides only the speech bubble; full-body launcher remains", async () => {
    const user = userEvent.setup()
    renderAt("/dashboard")

    expect(screen.getByText(/Hi! I'm your Fairy Jobmother!/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Dismiss welcome message/i }))

    expect(screen.queryByText(/Hi! I'm your Fairy Jobmother!/i)).not.toBeInTheDocument()
    const launcher = screen.getByRole("button", { name: /Open Fairy Jobmother help/i })
    expect(launcher).toBeInTheDocument()
    expect(launcher.querySelector('img[src="/assets/mascot/fairy-jobmother-cartoon-full.png"]')).not.toBeNull()
  })

  it("opens chat from the speech bubble", async () => {
    const user = userEvent.setup()
    renderAt("/dashboard")

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother assistant/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("renders tips from the API under the assistant reply", async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        reply: "Here you go.",
        links: [],
        tips: ["Bring water.", "Smile."],
        needsClarification: false,
      }),
    } as Response)

    renderAt("/dashboard")
    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    await user.type(screen.getByPlaceholderText(/Type a message/i), "tips please")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    await waitFor(() => {
      expect(screen.getByText("Bring water.")).toBeInTheDocument()
    })
    expect(screen.getByText("Smile.")).toBeInTheDocument()
  })

  it("shows clarify chips when needsClarification is true and sends chip text on click", async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          reply: "What would you like?",
          links: [],
          tips: [],
          needsClarification: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          reply: "Ok.",
          links: [{ path: "/dashboard", label: "Dashboard" }],
          tips: [],
          needsClarification: false,
        }),
      } as Response)

    renderAt("/dashboard")
    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    await user.type(screen.getByPlaceholderText(/Type a message/i), "hm")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    await waitFor(() => {
      expect(screen.getByText("What would you like?")).toBeInTheDocument()
    })
    const chip = screen.getByRole("button", { name: /Take me to my dashboard/i })
    expect(chip).toBeInTheDocument()
    await user.click(chip)

    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThanOrEqual(2)
    })
    const secondBody = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[1]?.[1] as { body?: string })?.body || "{}"
    )
    expect(secondBody.message).toBe("Take me to my dashboard")
  })
})
