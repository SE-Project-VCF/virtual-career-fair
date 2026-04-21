/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { BrowserRouter } from "react-router-dom"

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
  FairProvider: ({ children }: any) => <>{children}</>,
}))

const firebaseAuthRef: {
  currentUser: { getIdToken: ReturnType<typeof vi.fn> } | null
  onAuthStateChanged: (cb: (u: unknown) => void) => () => void
} = {
  currentUser: {
    getIdToken: vi.fn().mockResolvedValue("mock-token"),
  },
  onAuthStateChanged: (cb: (u: unknown) => void) => {
    queueMicrotask(() => cb({ getIdToken: () => Promise.resolve("mock-token") }))
    return () => {}
  },
}

vi.mock("../../firebase", () => ({
  auth: {
    get currentUser() {
      return firebaseAuthRef.currentUser
    },
    onAuthStateChanged: (cb: (u: unknown) => void) => firebaseAuthRef.onAuthStateChanged(cb),
  },
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: any) => (
    <div data-testid="base-layout">
      {pageTitle && <h6>{pageTitle}</h6>}
      {children}
    </div>
  ),
}))

// Mock stream-chat-react components
vi.mock("stream-chat-react", () => ({
  Chat: ({ children }: any) => <div data-testid="stream-chat">{children}</div>,
  Channel: ({ children }: any) => <div data-testid="stream-channel">{children}</div>,
  Window: ({ children }: any) => <div data-testid="stream-window">{children}</div>,
  MessageList: () => <div data-testid="message-list">Messages</div>,
}))

// We control streamClient via this variable
const mockChannel = {
  watch: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
}

const mockStreamClient = {
  userID: null as string | null,
  connectUser: vi.fn().mockResolvedValue(undefined),
  disconnectUser: vi.fn().mockResolvedValue(undefined),
  channel: vi.fn().mockReturnValue(mockChannel),
}

// Mutable ref that the mock module returns — lets tests swap between null and mockStreamClient
const streamRef: { current: typeof mockStreamClient | null } = { current: null }

vi.mock("../../utils/streamClient", () => ({
  get streamClient() {
    return streamRef.current
  },
}))

import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"

const setStreamClient = (client: typeof mockStreamClient | null) => {
  streamRef.current = client
}

const renderNetworkingLounge = async () => {
  const NetworkingLounge = (await import("../NetworkingLounge")).default
  return render(
    <BrowserRouter>
      <NetworkingLounge />
    </BrowserRouter>
  )
}

describe("NetworkingLounge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockStreamClient.userID = null
    setStreamClient(null)
    globalThis.fetch = vi.fn()
    firebaseAuthRef.currentUser = {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    }
    firebaseAuthRef.onAuthStateChanged = (cb) => {
      queueMicrotask(() => cb({ getIdToken: () => Promise.resolve("mock-token") }))
      return () => {}
    }
    localStorage.clear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
      firstName: "John",
      lastName: "Doe",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: true },
      isLive: true,
      fairId: "f1",
    })
  })

  afterEach(() => {
    setStreamClient(null)
  })

  it("shows 'not available' message when streamClient is null", async () => {
    // streamClient mock returns null by default
    await renderNetworkingLounge()

    expect(screen.getByText(/chat is not available/i)).toBeInTheDocument()
  })

  it("redirects to / when user is not logged in", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(null)

    await renderNetworkingLounge()

    expect(mockNavigate).toHaveBeenCalledWith("/")
  })

  it("shows loading spinner while client connects", async () => {
    setStreamClient(mockStreamClient)

    // fetch for stream-token never resolves
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    await renderNetworkingLounge()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows error state when stream init fails", async () => {
    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText(/failed to connect to chat/i)).toBeInTheDocument()
    })

    // Shows Back to Fair button
    expect(screen.getByRole("button", { name: /back to fair/i })).toBeInTheDocument()
  })

  it("navigates back to fair when Back to Fair is clicked in error state", async () => {
    const user = userEvent.setup()

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back to fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /back to fair/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1")
  })

  it("renders chat UI when connected and channel joined", async () => {
    mockStreamClient.userID = "user-1"

    setStreamClient(mockStreamClient)

    // First fetch: join lounge
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByTestId("stream-chat")).toBeInTheDocument()
    })

    expect(screen.getByTestId("message-list")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/chat with other students/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /back to booths/i })).toBeInTheDocument()
  })

  it("sends message on Enter key and clears input", async () => {
    mockStreamClient.userID = "user-1"

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/chat with other students/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/chat with other students/i)
    fireEvent.change(textarea, { target: { value: "Hello!" } })
    fireEvent.keyDown(textarea, { key: "Enter", altKey: false })

    await waitFor(() => {
      expect(mockChannel.sendMessage).toHaveBeenCalledWith({ text: "Hello!" })
    })
  })

  it("adds newline on Alt+Enter", async () => {
    mockStreamClient.userID = "user-1"

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/chat with other students/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/chat with other students/i)
    fireEvent.change(textarea, { target: { value: "line1" } })
    fireEvent.keyDown(textarea, { key: "Enter", altKey: true })

    // sendMessage should NOT have been called
    expect(mockChannel.sendMessage).not.toHaveBeenCalled()
  })

  it("navigates back to booths when Back to Booths is clicked", async () => {
    const user = userEvent.setup()
    mockStreamClient.userID = "user-1"

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back to booths/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /back to booths/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1/booths")
  })

  it("shows fair name in page title when fair is loaded", async () => {
    mockStreamClient.userID = "user-1"

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText("Spring Fair Lounge")).toBeInTheDocument()
    })
  })

  it("shows 'Career Fair Lounge' when fair name is not available", async () => {
    mockStreamClient.userID = "user-1"

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: null,
      isLive: false,
      fairId: "f1",
    })

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText("Career Fair Lounge")).toBeInTheDocument()
    })
  })

  it("shows error when joining lounge fails", async () => {
    mockStreamClient.userID = "user-1"

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Not authorized" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText("Not authorized")).toBeInTheDocument()
    })
  })

  it("disconnects and reconnects when user changes", async () => {
    mockStreamClient.userID = "other-user"

    setStreamClient(mockStreamClient)

    // Token fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "stream-token-123" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(mockStreamClient.disconnectUser).toHaveBeenCalled()
    })
  })

  it("connects user when client has no userID", async () => {
    mockStreamClient.userID = null

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "stream-token-abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ channelId: "lounge-f1" }),
      })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(mockStreamClient.connectUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "user-1",
          name: "John Doe",
          email: "student@example.com",
        }),
        "stream-token-abc"
      )
    })
  })

  it("does not send whitespace-only messages", async () => {
    mockStreamClient.userID = "user-1"

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/chat with other students/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/chat with other students/i)
    fireEvent.change(textarea, { target: { value: "   " } })
    fireEvent.keyDown(textarea, { key: "Enter", altKey: false })

    // sendMessage should NOT have been called for whitespace-only
    expect(mockChannel.sendMessage).not.toHaveBeenCalled()
  })

  it("uses email as fallback name when firstName/lastName are empty", async () => {
    mockStreamClient.userID = null

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-2",
      email: "noname@example.com",
      role: "student",
      firstName: "",
      lastName: "",
    })

    setStreamClient(mockStreamClient)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "stream-token-xyz" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ channelId: "lounge-f1" }),
      })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(mockStreamClient.connectUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "user-2",
          name: "noname@example.com",
        }),
        "stream-token-xyz"
      )
    })
  })

  it("does not join lounge when fairId is missing", async () => {
    mockStreamClient.userID = "user-1"

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: null,
      isLive: false,
      fairId: "",
    })

    setStreamClient(mockStreamClient)

    // Token fetch succeeds but no lounge join should happen
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "t" }),
    })

    await renderNetworkingLounge()

    // Should show loading since channel is never set
    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument()
    })

    // channel() should not have been called (no lounge join)
    expect(mockStreamClient.channel).not.toHaveBeenCalled()
  })

  describe("Attendees tab", () => {
    const setupConnected = () => {
      mockStreamClient.userID = "user-1"
      setStreamClient(mockStreamClient)
    }

    it("renders Group Chat and Attendees tabs when connected", async () => {
      setupConnected()

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ channelId: "lounge-f1" }),
      })

      await renderNetworkingLounge()

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /group chat/i })).toBeInTheDocument()
        expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument()
      })
    })

    it("shows attendee list when Attendees tab is clicked", async () => {
      const user = userEvent.setup()
      setupConnected()

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attendees: [
              {
                uid: "student-2",
                firstName: "Jane",
                lastName: "Smith",
                email: "jane@example.com",
                major: "Computer Science",
                expectedGradYear: 2025,
                skills: "React, Python",
                linkedinUrl: "https://linkedin.com/in/jane",
              },
            ],
          }),
        })

      await renderNetworkingLounge()

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => {
        expect(screen.getByText("Jane Smith")).toBeInTheDocument()
        expect(screen.getByText("Computer Science")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /linkedin/i })).toBeInTheDocument()
      })
    })

    it("shows Message button for other students but not for self", async () => {
      const user = userEvent.setup()
      setupConnected()

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attendees: [
              { uid: "student-2", firstName: "Jane", lastName: "Smith", email: "jane@example.com", major: "CS", expectedGradYear: 2025, skills: "", linkedinUrl: null },
              { uid: "user-1", firstName: "John", lastName: "Doe", email: "student@example.com", major: "CS", expectedGradYear: 2025, skills: "", linkedinUrl: null },
            ],
          }),
        })

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => {
        expect(screen.getByText("Jane Smith")).toBeInTheDocument()
      })

      // One Message button (for Jane), not two
      expect(screen.getAllByRole("button", { name: /message/i })).toHaveLength(1)
    })

    it("clicking Message navigates to /dashboard/chat with attendee uid as repId", async () => {
      const user = userEvent.setup()
      setupConnected()

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attendees: [
              { uid: "student-2", firstName: "Jane", lastName: "Smith", email: "jane@example.com", major: "CS", expectedGradYear: 2025, skills: "", linkedinUrl: null },
            ],
          }),
        })

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => expect(screen.getByText("Jane Smith")).toBeInTheDocument())

      await user.click(screen.getByRole("button", { name: /message/i }))

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/chat", {
        state: { repId: "student-2" },
      })
    })

    it("shows 'No other students' when attendees list is empty", async () => {
      const user = userEvent.setup()
      setupConnected()

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ attendees: [] }),
        })

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => {
        expect(screen.getByText(/no other students in the lounge yet/i)).toBeInTheDocument()
      })
    })

    it("does not show LinkedIn button when attendee has no LinkedIn URL", async () => {
      const user = userEvent.setup()
      setupConnected()

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attendees: [
              { uid: "student-2", firstName: "Jane", lastName: "Smith", email: "jane@example.com", major: "CS", expectedGradYear: null, skills: "", linkedinUrl: null },
            ],
          }),
        })

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => expect(screen.getByText("Jane Smith")).toBeInTheDocument())

      expect(screen.queryByRole("link", { name: /linkedin/i })).not.toBeInTheDocument()
    })

    it("shows Ghost Mode switch on Attendees tab", async () => {
      const user = userEvent.setup()
      setupConnected()

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ attendees: [] }),
        })

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => {
        expect(screen.getByRole("switch", { name: /ghost mode/i })).toBeInTheDocument()
      })
    })

    it("clicking Ghost Mode switch calls PATCH /api/users/me/ghost-mode", async () => {
      const user = userEvent.setup()
      setupConnected()

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ attendees: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ghostMode: true }),
        })

      globalThis.fetch = fetchMock

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => {
        expect(screen.getByRole("switch", { name: /ghost mode/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("switch", { name: /ghost mode/i }))

      await waitFor(() => {
        const ghostCall = fetchMock.mock.calls.find((call) =>
          typeof call[0] === "string" && call[0].includes("/api/users/me/ghost-mode")
        )
        expect(ghostCall).toBeDefined()
        expect(ghostCall![1]).toMatchObject({
          method: "PATCH",
          body: JSON.stringify({ ghostMode: true }),
        })
      })
    })

    it("shows error snackbar and reverts switch when Ghost Mode PATCH fails", async () => {
      const user = userEvent.setup()
      setupConnected()

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ attendees: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "server error" }),
        })

      globalThis.fetch = fetchMock

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => {
        expect(screen.getByRole("switch", { name: /ghost mode/i })).toBeInTheDocument()
      })

      const toggle = screen.getByRole("switch", { name: /ghost mode/i })
      await user.click(toggle)

      expect(await screen.findByText(/failed to update ghost mode/i)).toBeInTheDocument()
      expect(screen.getByRole("switch", { name: /ghost mode/i })).not.toBeChecked()
    })

    it("fetches attendees only once when tab is clicked multiple times", async () => {
      const user = userEvent.setup()
      setupConnected()

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ attendees: [] }),
        })

      globalThis.fetch = fetchMock

      await renderNetworkingLounge()

      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())

      await user.click(screen.getByRole("tab", { name: /attendees/i }))
      await waitFor(() => expect(screen.getByText(/no other students/i)).toBeInTheDocument())

      // Switch back to chat and then back to attendees
      await user.click(screen.getByRole("tab", { name: /group chat/i }))
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      // Attendees fetch should only have been called once (join + one attendees fetch)
      const attendeesFetches = fetchMock.mock.calls.filter((call) =>
        call[0].includes("/lounge/attendees")
      )
      expect(attendeesFetches).toHaveLength(1)
    })

    it("sorts the current user to the top of the attendees list", async () => {
      const user = userEvent.setup()
      mockStreamClient.userID = "user-1"
      setStreamClient(mockStreamClient)

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attendees: [
              { uid: "student-2", firstName: "Alice", lastName: "Z", email: "a@x.com", major: "", expectedGradYear: null, skills: "", linkedinUrl: null },
              { uid: "user-1", firstName: "John", lastName: "Doe", email: "student@example.com", major: "", expectedGradYear: null, skills: "", linkedinUrl: null },
              { uid: "student-3", firstName: "Bob", lastName: "Y", email: "b@x.com", major: "", expectedGradYear: null, skills: "", linkedinUrl: null },
            ],
          }),
        })

      await renderNetworkingLounge()
      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => expect(screen.getByText("John Doe")).toBeInTheDocument())

      const names = screen.getAllByRole("heading", { level: 6 }).map((el) => el.textContent)
      const johnIdx = names.findIndex((n) => n?.includes("John Doe"))
      const aliceIdx = names.findIndex((n) => n?.includes("Alice"))
      const bobIdx = names.findIndex((n) => n?.includes("Bob"))
      expect(johnIdx).toBeLessThan(aliceIdx)
      expect(johnIdx).toBeLessThan(bobIdx)
    })

    it("hides the signed-in user from attendees when ghost mode is enabled", async () => {
      const user = userEvent.setup()
      mockStreamClient.userID = "user-1"
      setStreamClient(mockStreamClient)

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attendees: [
              { uid: "user-1", firstName: "John", lastName: "Doe", email: "student@example.com", major: "", expectedGradYear: null, skills: "", linkedinUrl: null },
              { uid: "student-2", firstName: "Alice", lastName: "Z", email: "a@x.com", major: "", expectedGradYear: null, skills: "", linkedinUrl: null },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ghostMode: true }),
        })

      await renderNetworkingLounge()
      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => expect(screen.getByText("John Doe")).toBeInTheDocument())

      await user.click(screen.getByRole("switch", { name: /ghost mode/i }))

      await waitFor(() => {
        expect(screen.queryByText("John Doe")).not.toBeInTheDocument()
        expect(screen.getByText("Alice Z")).toBeInTheDocument()
      })
    })

    it("logs an error when the attendees fetch fails", async () => {
      const user = userEvent.setup()
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      mockStreamClient.userID = "user-1"
      setStreamClient(mockStreamClient)

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({ ok: false })

      await renderNetworkingLounge()
      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith("Attendees fetch error:", expect.any(Error))
      })
      consoleError.mockRestore()
    })

    it("persists ghostMode to localStorage on successful toggle", async () => {
      const user = userEvent.setup()
      localStorage.setItem(
        "currentUser",
        JSON.stringify({ uid: "user-1", email: "student@example.com", ghostMode: false })
      )
      mockStreamClient.userID = "user-1"
      setStreamClient(mockStreamClient)

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ attendees: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ghostMode: true }),
        })

      await renderNetworkingLounge()
      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => expect(screen.getByRole("switch", { name: /ghost mode/i })).toBeInTheDocument())
      await user.click(screen.getByRole("switch", { name: /ghost mode/i }))

      await waitFor(() => {
        const stored = localStorage.getItem("currentUser")
        expect(stored).not.toBeNull()
        expect(JSON.parse(stored!).ghostMode).toBe(true)
      })
    })

    it("closes the error snackbar when onClose is triggered", async () => {
      const user = userEvent.setup()
      mockStreamClient.userID = "user-1"
      setStreamClient(mockStreamClient)

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ attendees: [] }),
        })
        .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "nope" }) })

      globalThis.fetch = fetchMock

      await renderNetworkingLounge()
      await waitFor(() => expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument())
      await user.click(screen.getByRole("tab", { name: /attendees/i }))

      await waitFor(() => expect(screen.getByRole("switch", { name: /ghost mode/i })).toBeInTheDocument())
      await user.click(screen.getByRole("switch", { name: /ghost mode/i }))

      const alertCloseBtn = await screen.findByRole("button", { name: /close/i })
      await user.click(alertCloseBtn)

      await waitFor(() => {
        expect(screen.queryByText(/failed to update ghost mode/i)).not.toBeInTheDocument()
      })
    })
  })

  describe("Stream token flow", () => {
    it("waits for firebase user via onAuthStateChanged when currentUser is null", async () => {
      mockStreamClient.userID = null
      setStreamClient(mockStreamClient)

      firebaseAuthRef.currentUser = null
      firebaseAuthRef.onAuthStateChanged = (cb) => {
        queueMicrotask(() => cb({ getIdToken: () => Promise.resolve("late-token") }))
        return () => {}
      }

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "stream-token-late" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ channelId: "lounge-f1" }),
        })

      await renderNetworkingLounge()

      await waitFor(() => {
        expect(mockStreamClient.connectUser).toHaveBeenCalledWith(
          expect.objectContaining({ id: "user-1" }),
          "stream-token-late"
        )
      })
    })

    it("shows 'Failed to connect to chat' when firebase emits a null user", async () => {
      mockStreamClient.userID = null
      setStreamClient(mockStreamClient)

      firebaseAuthRef.currentUser = null
      firebaseAuthRef.onAuthStateChanged = (cb) => {
        queueMicrotask(() => cb(null))
        return () => {}
      }

      globalThis.fetch = vi.fn()

      await renderNetworkingLounge()

      await waitFor(() => {
        expect(screen.getByText(/failed to connect to chat/i)).toBeInTheDocument()
      })
    })

    it("surfaces the server error message when stream-token response has error body", async () => {
      mockStreamClient.userID = null
      setStreamClient(mockStreamClient)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "forbidden" }),
      })

      await renderNetworkingLounge()

      await waitFor(() => {
        expect(screen.getByText(/failed to connect to chat/i)).toBeInTheDocument()
      })
    })
  })

  describe("Textarea behavior", () => {
    it("resizes the textarea on input", async () => {
      mockStreamClient.userID = "user-1"
      setStreamClient(mockStreamClient)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ channelId: "lounge-f1" }),
      })

      await renderNetworkingLounge()

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/chat with other students/i)).toBeInTheDocument()
      })

      const textarea = screen.getByPlaceholderText(/chat with other students/i) as HTMLTextAreaElement
      Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 120 })

      fireEvent.input(textarea, { target: { value: "multi\nline\nmessage" } })

      expect(textarea.style.height).toBe("120px")
    })
  })
})
