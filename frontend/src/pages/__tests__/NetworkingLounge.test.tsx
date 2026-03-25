/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
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

vi.mock("../../utils/streamClient", () => ({
  streamClient: null, // will be overridden per test
}))

import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"
import * as streamClientModule from "../../utils/streamClient"

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
    // Override streamClient to be non-null but never resolve
    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    // fetch for stream-token never resolves
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    await renderNetworkingLounge()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()

    // Restore
    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("shows error state when stream init fails", async () => {
    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText(/failed to connect to chat/i)).toBeInTheDocument()
    })

    // Shows Back to Fair button
    expect(screen.getByRole("button", { name: /back to fair/i })).toBeInTheDocument()

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("navigates back to fair when Back to Fair is clicked in error state", async () => {
    const user = userEvent.setup()

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back to fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /back to fair/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1")

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("renders chat UI when connected and channel joined", async () => {
    mockStreamClient.userID = "user-1"

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

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

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("sends message on Enter key and clears input", async () => {
    mockStreamClient.userID = "user-1"

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

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

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("adds newline on Alt+Enter", async () => {
    mockStreamClient.userID = "user-1"

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/chat with other students/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/chat with other students/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "line1" } })
    fireEvent.keyDown(textarea, { key: "Enter", altKey: true })

    // sendMessage should NOT have been called
    expect(mockChannel.sendMessage).not.toHaveBeenCalled()

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("navigates back to booths when Back to Booths is clicked", async () => {
    const user = userEvent.setup()
    mockStreamClient.userID = "user-1"

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

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

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("shows fair name in page title when fair is loaded", async () => {
    mockStreamClient.userID = "user-1"

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText("Spring Fair Lounge")).toBeInTheDocument()
    })

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
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

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channelId: "lounge-f1" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText("Career Fair Lounge")).toBeInTheDocument()
    })

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("shows error when joining lounge fails", async () => {
    mockStreamClient.userID = "user-1"

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Not authorized" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(screen.getByText("Not authorized")).toBeInTheDocument()
    })

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })

  it("disconnects and reconnects when user changes", async () => {
    mockStreamClient.userID = "other-user"

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => mockStreamClient,
      configurable: true,
    })

    // Token fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "stream-token-123" }),
    })

    await renderNetworkingLounge()

    await waitFor(() => {
      expect(mockStreamClient.disconnectUser).toHaveBeenCalled()
    })

    Object.defineProperty(streamClientModule, "streamClient", {
      get: () => null,
      configurable: true,
    })
  })
})
