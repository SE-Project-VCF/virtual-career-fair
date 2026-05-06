/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import type { ReactNode } from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAdminDashboard from "../FairAdminDashboard"
import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
  FairProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => ({ options: [], loading: false }),
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

const renderFairAdminDashboard = () =>
  render(
    <BrowserRouter>
      <FairAdminDashboard />
    </BrowserRouter>,
  )

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

function mockFetchResponse(data: {
  ok: boolean
  status?: number
  json: () => Promise<unknown>
}): Promise<Response> {
  return Promise.resolve(data as unknown as Response)
}

function parseFetchCallJsonBody(call: unknown): Record<string, unknown> {
  expect(call).toBeDefined()
  if (!Array.isArray(call) || call.length < 2) throw new Error("expected fetch call tuple")
  const init = call[1] as RequestInit | undefined
  const body = init?.body
  if (typeof body !== "string") throw new Error("expected fetch call with JSON body")
  return JSON.parse(body) as Record<string, unknown>
}

const baseAnn = {
  fairId: "f1",
  fairName: "Spring Fair",
  fairStartTime: null as number | null,
  fairEndTime: null as number | null,
  publishedAt: null as number | null,
  createdAt: 1000,
  updatedAt: 1000,
  createdBy: "admin-1",
}

describe("FairAdminDashboard — fair announcements (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: "Desc",
        isLive: false,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [] }) })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })
  })

  it("shows empty state when there are no announcements", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /fair announcements/i })).toBeInTheDocument()
    })
    expect(screen.getByText("No announcements yet.")).toBeInTheDocument()
  })

  it("lists announcements with draft and published rows", async () => {
    const announcements = [
      {
        id: "a1",
        ...baseAnn,
        title: "Parking",
        description: "Use lot B",
        published: false,
      },
      {
        id: "a2",
        ...baseAnn,
        title: "Lunch",
        description: "",
        published: true,
      },
    ]

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements }) })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Parking")).toBeInTheDocument()
    })
    expect(screen.getByText("Lunch")).toBeInTheDocument()
    expect(screen.getByText("Use lot B")).toBeInTheDocument()
    expect(screen.getAllByText("Published").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Draft")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeInTheDocument()
  })

  it("requires a title before save draft", async () => {
    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new announcement/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new announcement/i }))

    await waitFor(() => expect(screen.getByRole("dialog", { name: /new announcement/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /save draft/i }))

    expect(await screen.findByText("Title is required")).toBeInTheDocument()
  })

  it("creates a draft via POST with published false", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "POST") {
        return mockFetchResponse({
          ok: true,
          json: async () => ({
            id: "new-1",
            ...baseAnn,
            title: "Hi",
            description: "",
            published: false,
          }),
        })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })
    globalThis.fetch = fetchMock

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new announcement/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new announcement/i }))
    await user.type(screen.getByLabelText(/^title/i), "Hi")
    await user.click(screen.getByRole("button", { name: /save draft/i }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => requestUrlString(c[0]).includes("/announcements") && c[1]?.method === "POST",
      )
      expect(parseFetchCallJsonBody(post)).toMatchObject({
        title: "Hi",
        published: false,
      })
    })

    await waitFor(() => {
      expect(screen.getByText("Announcement saved")).toBeInTheDocument()
    })
  })

  it("publishes a new announcement via POST with published true", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "POST") {
        return mockFetchResponse({
          ok: true,
          json: async () => ({
            id: "new-2",
            ...baseAnn,
            title: "Go",
            description: "Now",
            published: true,
          }),
        })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })
    globalThis.fetch = fetchMock

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new announcement/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new announcement/i }))
    await user.type(screen.getByLabelText(/^title/i), "Go")
    await user.type(screen.getByLabelText(/description/i), "Now")
    await user.click(screen.getByRole("button", { name: /^publish$/i }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => requestUrlString(c[0]).includes("/announcements") && c[1]?.method === "POST",
      )
      expect(parseFetchCallJsonBody(post)).toEqual({
        title: "Go",
        description: "Now",
        published: true,
      })
    })
  })

  it("updates an announcement via PUT from the edit dialog", async () => {
    const user = userEvent.setup()
    const draft = {
      id: "ann-edit",
      ...baseAnn,
      title: "Old",
      description: "Text",
      published: false,
    }

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [draft] }) })
      }
      if (u.includes(`/api/fairs/f1/announcements/${draft.id}`) && method === "PUT") {
        return mockFetchResponse({
          ok: true,
          json: async () => ({ ...draft, title: "New title" }),
        })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })
    globalThis.fetch = fetchMock

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Old")).toBeInTheDocument())
    const table = screen.getByRole("table")
    await user.click(within(table).getByTitle("Edit"))

    await waitFor(() => expect(screen.getByRole("dialog", { name: /edit announcement/i })).toBeInTheDocument())
    const titleField = screen.getByLabelText(/^title/i)
    await user.clear(titleField)
    await user.type(titleField, "New title")
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (c) =>
          requestUrlString(c[0]).includes(`/announcements/${draft.id}`) && c[1]?.method === "PUT",
      )
      expect(parseFetchCallJsonBody(put)).toMatchObject({
        title: "New title",
        published: false,
      })
    })

    await waitFor(() => {
      expect(screen.getByText("Announcement updated")).toBeInTheDocument()
    })
  })

  it("publishes a draft row using PUT from the table", async () => {
    const user = userEvent.setup()
    const draft = {
      id: "ann-pub",
      ...baseAnn,
      title: "Draft only",
      description: "",
      published: false,
    }

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [draft] }) })
      }
      if (u.includes(`/api/fairs/f1/announcements/${draft.id}`) && method === "PUT") {
        return mockFetchResponse({
          ok: true,
          json: async () => ({ ...draft, published: true }),
        })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })
    globalThis.fetch = fetchMock

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /^publish$/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^publish$/i }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (c) =>
          requestUrlString(c[0]).includes(`/announcements/${draft.id}`) && c[1]?.method === "PUT",
      )
      expect(parseFetchCallJsonBody(put)).toEqual({ published: true })
    })

    await waitFor(() => {
      expect(screen.getByText("Announcement published")).toBeInTheDocument()
    })
  })

  it("deletes an announcement when delete is confirmed", async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, "confirm").mockReturnValue(true)

    const row = {
      id: "ann-del",
      ...baseAnn,
      title: "Remove me",
      description: "",
      published: true,
    }

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [row] }) })
      }
      if (u.includes(`/api/fairs/f1/announcements/${row.id}`) && method === "DELETE") {
        return mockFetchResponse({ ok: true, json: async () => ({}) })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })
    globalThis.fetch = fetchMock

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Remove me")).toBeInTheDocument())
    const table = screen.getByRole("table")
    await user.click(within(table).getByTitle("Delete"))

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        (c) =>
          requestUrlString(c[0]).includes(`/announcements/${row.id}`) && c[1]?.method === "DELETE",
      )
      expect(del).toBeDefined()
    })

    await waitFor(() => {
      expect(screen.getByText("Announcement deleted")).toBeInTheDocument()
    })
  })

  it("does not delete when confirm is cancelled", async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, "confirm").mockReturnValue(false)

    const row = {
      id: "ann-nodelete",
      ...baseAnn,
      title: "Stay",
      description: "",
      published: true,
    }

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [row] }) })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Stay")).toBeInTheDocument())
    await user.click(within(screen.getByRole("table")).getByTitle("Delete"))

    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining(`/announcements/${row.id}`),
      expect.objectContaining({ method: "DELETE" }),
    )
  })

  it("shows an error when publish from the table fails", async () => {
    const user = userEvent.setup()
    const draft = {
      id: "ann-bad",
      ...baseAnn,
      title: "X",
      description: "",
      published: false,
    }

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [draft] }) })
      }
      if (u.includes(`/api/fairs/f1/announcements/${draft.id}`) && method === "PUT") {
        return mockFetchResponse({
          ok: false,
          json: async () => ({ error: "Cannot publish" }),
        })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /^publish$/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^publish$/i }))

    await waitFor(() => {
      expect(screen.getByText("Cannot publish")).toBeInTheDocument()
    })
  })

  it("shows dialog error when create fails", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "POST") {
        return mockFetchResponse({
          ok: false,
          json: async () => ({ error: "Bad title" }),
        })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new announcement/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new announcement/i }))
    await user.type(screen.getByLabelText(/^title/i), "Nope")
    await user.click(screen.getByRole("button", { name: /save draft/i }))

    expect(await screen.findByText("Bad title")).toBeInTheDocument()
  })

  it("toggles published switch in edit dialog and sends published true on save", async () => {
    const user = userEvent.setup()
    const draft = {
      id: "ann-switch",
      ...baseAnn,
      title: "Switch me",
      description: "",
      published: false,
    }

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [draft] }) })
      }
      if (u.includes(`/api/fairs/f1/announcements/${draft.id}`) && method === "PUT") {
        return mockFetchResponse({
          ok: true,
          json: async () => ({ ...draft, published: true }),
        })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })
    globalThis.fetch = fetchMock

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Switch me")).toBeInTheDocument())
    await user.click(within(screen.getByRole("table")).getByTitle("Edit"))

    const dlg = await screen.findByRole("dialog", { name: /edit announcement/i })
    expect(within(dlg).getByText("Draft")).toBeInTheDocument()

    const pubSwitch = within(dlg).getByRole("switch", { name: /^draft$/i })
    await user.click(pubSwitch)

    expect(within(dlg).getByText("Published")).toBeInTheDocument()

    await user.click(within(dlg).getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (c) =>
          requestUrlString(c[0]).includes(`/announcements/${draft.id}`) && c[1]?.method === "PUT",
      )
      expect(parseFetchCallJsonBody(put)).toMatchObject({
        title: "Switch me",
        published: true,
      })
    })
  })

  it("closes the announcement dialog on Escape when not saving", async () => {
    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new announcement/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new announcement/i }))

    await waitFor(() => expect(screen.getByRole("dialog", { name: /new announcement/i })).toBeInTheDocument())
    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /new announcement/i })).not.toBeInTheDocument()
    })
  })

  it("shows Publishing… on the row button while publish request is in flight", async () => {
    const user = userEvent.setup()
    const draft = {
      id: "ann-slow",
      ...baseAnn,
      title: "Slow pub",
      description: "",
      published: false,
    }

    let resolvePut!: (value: Response) => void
    const putPromise = new Promise<Response>((resolve) => {
      resolvePut = resolve
    })

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [draft] }) })
      }
      if (u.includes(`/api/fairs/f1/announcements/${draft.id}`) && method === "PUT") {
        return putPromise
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /^publish$/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^publish$/i }))

    expect(await screen.findByText("Publishing…")).toBeInTheDocument()

    void mockFetchResponse({
      ok: true,
      json: async () => ({ ...draft, published: true }),
    }).then((r) => resolvePut(r))

    await waitFor(() => {
      expect(screen.queryByText("Publishing…")).not.toBeInTheDocument()
    })
  })

  it("shows an error when delete fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, "confirm").mockReturnValue(true)

    const row = {
      id: "ann-fail-del",
      ...baseAnn,
      title: "Err",
      description: "",
      published: true,
    }

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = requestUrlString(input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/fairs/f1/enrollments") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      if (u.includes("/api/fairs/f1/enrollment-requests") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/api/fairs/f1/announcements") && method === "GET") {
        return mockFetchResponse({ ok: true, json: async () => ({ announcements: [row] }) })
      }
      if (u.includes(`/api/fairs/f1/announcements/${row.id}`) && method === "DELETE") {
        return mockFetchResponse({ ok: false, json: async () => ({}) })
      }
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Err")).toBeInTheDocument())
    await user.click(within(screen.getByRole("table")).getByTitle("Delete"))

    await waitFor(() => {
      expect(screen.getByText("Failed to delete")).toBeInTheDocument()
    })
  })
})
