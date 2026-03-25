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

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
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
})
