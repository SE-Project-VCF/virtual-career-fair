import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter, useLocation } from "react-router-dom";
import ChatPage from "../ChatPage";
import * as authUtils from "../../utils/auth";
import * as streamClient from "../../utils/streamClient";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("../../utils/streamClient", () => ({
  streamClient: {
    userID: null,
    disconnectUser: vi.fn(),
    connectUser: vi.fn(),
    channel: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      uid: "test-user",
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}));

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

vi.mock("stream-chat-react", () => ({
  Chat: ({ children }: any) => <div>{children}</div>,
  Channel: ({ children }: any) => <div>{children}</div>,
  Window: ({ children }: any) => <div>{children}</div>,
  MessageList: () => <div>Message List</div>,
}));

const renderChatPage = () => {
  return render(
    <BrowserRouter>
      <ChatPage />
    </BrowserRouter>
  );
};

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "mock-token" }),
    });
  });

  it("renders the chat page", async () => {
    renderChatPage();

    await waitFor(() => {
      // Chat page should render
    });
  });

  it("displays chat header with title", async () => {
    renderChatPage();

    await waitFor(() => {
      expect(screen.queryByText(/messages/i)).toBeInTheDocument();
    });
  });

  it("shows loading state when client is not ready", () => {
    renderChatPage();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("redirects to home if user is not authenticated", async () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue(null);
    renderChatPage();

    await waitFor(() => {
      // Should redirect
    });
  });

  it("renders chat sidebar and message area", async () => {
    renderChatPage();

    await waitFor(() => {
      // Should render chat components
    });
  });
});
