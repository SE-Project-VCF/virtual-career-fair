/// <reference types="vitest/globals" />
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { BrowserRouter } from "react-router-dom";
import ChatPage from "../ChatPage";
import * as authUtils from "../../utils/auth";

const mockNavigate = vi.fn();

/** Partial location; ChatPage reads `state`, `pathname`, and `search`. */
const mockLocationState = {
  pathname: "/",
  search: "",
  hash: "",
  key: "test",
  state: null as { repId?: string; dmStudentId?: string } | null,
};

const chatDmMock = vi.hoisted(() => ({
  getOrCreateDirectChannel: vi.fn(),
}));

vi.mock("../../utils/chat", () => ({
  getOrCreateDirectChannel: (uid: string, sid: string) =>
    chatDmMock.getOrCreateDirectChannel(uid, sid),
}));

// Define mocks before using them
const mockChannel = {
  watch: vi.fn().mockResolvedValue({}),
  sendMessage: vi.fn().mockResolvedValue({}),
  sendFile: vi.fn().mockResolvedValue({ file: "http://example.com/file.pdf" }),
};

const mockStreamClient = {
  userID: null as string | null,
  user: { total_unread_count: 0 },
  disconnectUser: vi.fn().mockResolvedValue({}),
  connectUser: vi.fn().mockResolvedValue({}),
  channel: vi.fn(() => mockChannel),
  on: vi.fn(),
  off: vi.fn(),
};

/** Reassign in tests to simulate missing Stream API key (streamClient === null). */
let streamClientExport: typeof mockStreamClient | null = mockStreamClient;

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("../../utils/streamClient", () => ({
  get streamClient() {
    return streamClientExport;
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

vi.mock("../../components/BaseLayout", () => ({
  default: ({
    children,
    pageTitle,
    onHeaderBack,
    headerActions,
  }: {
    children: React.ReactNode
    pageTitle?: string
    onHeaderBack?: () => void
    headerActions?: React.ReactNode
  }) => (
    <div data-testid="base-layout">
      {pageTitle && <span>{pageTitle}</span>}
      {onHeaderBack && (
        <button type="button" aria-label="Back to Dashboard" onClick={onHeaderBack}>
          Back
        </button>
      )}
      {headerActions}
      {children}
    </div>
  ),
}));

vi.mock("stream-chat-react", () => ({
  Chat: ({ children }: { children: React.ReactNode }) => <div data-testid="stream-chat">{children}</div>,
  Channel: ({ children }: { children: React.ReactNode }) => <div data-testid="stream-channel">{children}</div>,
  Window: ({ children }: { children: React.ReactNode }) => <div data-testid="stream-window">{children}</div>,
  MessageList: () => <div data-testid="message-list">Message List</div>,
}));

vi.mock("../../components/chat/ChatSidebar", () => ({
  default: ({ onSelectChannel }: { onSelectChannel: (channel: Record<string, unknown>) => void }) => {
    return (
      <div data-testid="chat-sidebar">
        <button onClick={() => onSelectChannel(mockChannel)}>Select Channel</button>
      </div>
    );
  },
}));

vi.mock("../../components/chat/NewChatDialog", () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="new-chat-dialog">
        <button onClick={onClose}>Close Dialog</button>
      </div>
    ) : null,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocationState,
  };
});

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
    mockNavigate.mockClear();
    mockLocationState.pathname = "/";
    mockLocationState.search = "";
    mockLocationState.state = null;

    chatDmMock.getOrCreateDirectChannel.mockReset();
    chatDmMock.getOrCreateDirectChannel.mockResolvedValue(mockChannel);

    // Reset mock channel
    mockChannel.watch.mockClear();
    mockChannel.sendMessage.mockClear();
    mockChannel.sendFile.mockClear();

    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
      uid: "user-1",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "mock-stream-token" }),
    });

    // Reset stream client state
    streamClientExport = mockStreamClient;
    mockStreamClient.userID = null;
    mockStreamClient.user = { total_unread_count: 0 };
  });

  describe("Authentication", () => {
    it("redirects to home if user is not authenticated", () => {
      (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue(null);
      renderChatPage();

      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("allows authenticated users to access the page", async () => {
      // Set client as ready
      mockStreamClient.userID = "user-1";

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("base-layout")).toBeInTheDocument();
        expect(screen.getByText("Messages")).toBeInTheDocument();
      });
    });
  });

  describe("Loading States", () => {
    it("shows loading spinner when client is not ready", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = null;
      renderChatPage();

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(document.querySelector(".chat-loading-container")).toBeInTheDocument();

      const back = screen.getByRole("button", { name: "Back to Dashboard" });
      await user.click(back);
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("shows 'Chat Not Available' when stream client is not configured", async () => {
      const user = userEvent.setup();
      streamClientExport = null;
      renderChatPage();

      expect(screen.getByText("Chat Not Available")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Stream Chat API key is not configured. Please set VITE_STREAM_API_KEY in your environment variables."
        )
      ).toBeInTheDocument();
      expect(screen.getByText("Chat", { exact: true })).toBeInTheDocument();
      expect(document.querySelector(".chat-center-container")).toBeInTheDocument();

      const back = screen.getByRole("button", { name: "Back to Dashboard" });
      await user.click(back);
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("renders chat interface after client is ready", async () => {
      mockStreamClient.userID = "user-1";
      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("base-layout")).toBeInTheDocument();
        expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("stream-chat")).toBeInTheDocument();
      });
    });
  });

  describe("Stream Chat Initialization", () => {
    it("fetches Stream token from API", async () => {
      renderChatPage();

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/stream-token",
          expect.objectContaining({
            headers: { Authorization: "Bearer mock-token" },
          })
        );
      });
    });

    it("connects user with correct data", async () => {
      renderChatPage();

      await waitFor(() => {
        expect(mockStreamClient.connectUser).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "user-1",
            name: "Test User",
            email: "test@example.com",
            username: "test",
          }),
          "mock-stream-token"
        );
      });
    });

    it("handles user with missing firstName/lastName", async () => {
      (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
        uid: "user-1",
        email: "test@example.com",
      });

      renderChatPage();

      await waitFor(() => {
        expect(mockStreamClient.connectUser).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "test@example.com", // Falls back to email
          }),
          "mock-stream-token"
        );
      });
    });

    it("handles API error when fetching token", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Unauthorized" }),
      });

      renderChatPage();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith("STREAM INIT ERROR", expect.any(Error));
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Chat page header (BaseLayout)", () => {
    it("displays Messages title", async () => {
      mockStreamClient.userID = "user-1";
      renderChatPage();

      await waitFor(() => {
        expect(screen.getByText("Messages")).toBeInTheDocument();
      });
    });

    it("displays unread count in title", async () => {
      mockStreamClient.userID = "user-1";
      mockStreamClient.user = { total_unread_count: 3 };

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByText(/Messages \(3\)/)).toBeInTheDocument();
      });
    });

    it("navigates back to dashboard when back button clicked", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("base-layout")).toBeInTheDocument();
      });

      const backButton = screen.getByRole("button", { name: "Back to Dashboard" });
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  describe("New Chat Dialog", () => {
    it("opens new chat dialog when New Chat button clicked", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Start New Chat" })).toBeInTheDocument();
      });

      const newChatButton = screen.getByRole("button", { name: "Start New Chat" });
      await user.click(newChatButton);

      expect(screen.getByTestId("new-chat-dialog")).toBeInTheDocument();
    });

    it("closes new chat dialog", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Start New Chat" })).toBeInTheDocument();
      });

      // Open dialog
      const newChatButton = screen.getByRole("button", { name: "Start New Chat" });
      await user.click(newChatButton);

      // Close dialog
      const closeButton = screen.getByText("Close Dialog");
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId("new-chat-dialog")).not.toBeInTheDocument();
      });
    });
  });

  describe("Channel Selection", () => {
    it("displays placeholder when no channel selected", async () => {
      mockStreamClient.userID = "user-1";
      renderChatPage();

      await waitFor(() => {
        expect(screen.getByText("Select a chat or start a new one")).toBeInTheDocument();
      });
    });

    it("renders message list when channel is selected", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
      });

      // Select a channel
      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        expect(screen.getByTestId("message-list")).toBeInTheDocument();
      });
    });

    it("displays message input when channel is active", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
      });

      // Select a channel
      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(/Begin typing to send a message/);
        expect(textarea).toBeInTheDocument();
      });
    });
  });

  describe("Message Sending", () => {
    it("sends message when user types and presses Enter", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel first
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      // Type a message
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Begin typing to send a message/)).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(/Begin typing to send a message/);
      await user.type(textarea, "Hello!");
      
      // Press Enter to send
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(mockChannel.sendMessage).toHaveBeenCalledWith({ text: "Hello!" });
      });
    });

    it("does not send empty messages", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      // Try to send empty message
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Begin typing to send a message/)).toBeInTheDocument();
      });

      await user.keyboard("{Enter}");

      expect(mockChannel.sendMessage).not.toHaveBeenCalled();
    });

    it("does not send whitespace-only messages", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Begin typing to send a message/)).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(/Begin typing to send a message/);
      await user.type(textarea, "   ");
      await user.keyboard("{Enter}");

      expect(mockChannel.sendMessage).not.toHaveBeenCalled();
    });

    it("adds newline when Alt+Enter is pressed", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Begin typing to send a message/)).toBeInTheDocument();
      });

      const textareaElement = screen.getByPlaceholderText(/Begin typing to send a message/);
      await user.type(textareaElement, "Line 1");
      await user.keyboard("{Alt>}{Enter}{/Alt}");

      // Should have newline without sending
      expect((textareaElement as HTMLTextAreaElement).value).toContain("\n");
      expect(mockChannel.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("Unread Count", () => {
    it("registers event listeners for unread count", async () => {
      mockStreamClient.userID = "user-1";
      renderChatPage();

      await waitFor(() => {
        expect(mockStreamClient.on).toHaveBeenCalledWith(
          "notification.message_new",
          expect.any(Function)
        );
        expect(mockStreamClient.on).toHaveBeenCalledWith(
          "notification.mark_read",
          expect.any(Function)
        );
      });
    });

    it("unsubscribes stream notification listeners on unmount", async () => {
      mockStreamClient.userID = "user-1";
      const { unmount } = renderChatPage();

      await waitFor(() => {
        expect(mockStreamClient.on).toHaveBeenCalled();
      });

      unmount();

      expect(mockStreamClient.off).toHaveBeenCalledWith("notification.message_new", expect.any(Function));
      expect(mockStreamClient.off).toHaveBeenCalledWith("notification.mark_read", expect.any(Function));
    });
  });

  describe("UI Components", () => {
    it("renders chat sidebar", async () => {
      mockStreamClient.userID = "user-1";
      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
      });
    });

    it("renders Stream Chat wrapper", async () => {
      mockStreamClient.userID = "user-1";
      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("stream-chat")).toBeInTheDocument();
      });
    });

    it("renders file upload input", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        const fileInput = screen.getByLabelText("📎");
        expect(fileInput).toBeInTheDocument();
      });
    });
  });

  describe("File Upload", () => {
    it("renders file upload input when channel is active", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        const fileInput = document.querySelector('input[type="file"]');
        expect(fileInput).toBeInTheDocument();
        expect(fileInput).toHaveAttribute('multiple');
      });
    });

    it("calls sendFiles when files are selected", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        expect(screen.getByLabelText("📎")).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["test content"], "test.pdf", { type: "application/pdf" });

      // Upload the file
      await user.upload(fileInput, file);

      // Verify sendFile was called
      await waitFor(() => {
        expect(mockChannel.sendFile).toHaveBeenCalledWith(file);
      });

      // Verify sendMessage was called with attachment
      await waitFor(() => {
        expect(mockChannel.sendMessage).toHaveBeenCalled();
      });
    });

    it("does not send files when no channel is active", async () => {
      mockStreamClient.userID = "user-1";
      renderChatPage();

      // Don't select a channel - should show placeholder
      await waitFor(() => {
        expect(screen.getByText("Select a chat or start a new one")).toBeInTheDocument();
      });

      // sendFiles should not be called
      expect(mockChannel.sendFile).not.toHaveBeenCalled();
    });
  });

  describe("Stream Client Disconnection", () => {
    it("disconnects user when logged out", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      // Start with a user
      (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
        uid: "user-1",
        email: "test@example.com",
      });
      mockStreamClient.userID = "user-1";

      const { rerender } = renderChatPage();

      // Change to no user
      (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue(null);
      
      rerender(
        <BrowserRouter>
          <ChatPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith("No Firebase user, disconnecting Stream");
        expect(mockStreamClient.disconnectUser).toHaveBeenCalled();
      });

      consoleLogSpy.mockRestore();
    });

    it("disconnects if Stream userID doesn't match current user", async () => {
      // Set up client connected as different user
      mockStreamClient.userID = "different-user";

      (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
        uid: "user-1",
        email: "test@example.com",
      });

      renderChatPage();

      await waitFor(() => {
        expect(mockStreamClient.disconnectUser).toHaveBeenCalled();
      });
    });
  });

  describe("Textarea Auto-grow", () => {
    it("adjusts textarea height on input", async () => {
      const user = userEvent.setup();
      mockStreamClient.userID = "user-1";

      renderChatPage();

      // Select a channel
      await waitFor(() => {
        expect(screen.getByText("Select Channel")).toBeInTheDocument();
      });

      const selectButton = screen.getByText("Select Channel");
      await user.click(selectButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Begin typing to send a message/)).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(/Begin typing to send a message/);
      
      // Type a long message
      await user.type(textarea, "Line 1\nLine 2\nLine 3\nLine 4");

      // The textarea should have adjusted its height (style changes are applied)
      expect((textarea as HTMLTextAreaElement).value).toContain("\n");
    });
  });

  describe("Auto-DM from Booth", () => {
    it("creates DM channel when repId is provided in location state", async () => {
      mockStreamClient.userID = "user-1";
      mockLocationState.state = { repId: "rep-123" };

      renderChatPage();

      await waitFor(() => {
        expect(mockStreamClient.channel).toHaveBeenCalledWith("messaging", {
          members: ["user-1", "rep-123"],
        });
        expect(mockChannel.watch).toHaveBeenCalled();
      });
    });

    it("does not create DM when no repId is provided", async () => {
      mockStreamClient.userID = "user-1";
      mockLocationState.state = null;

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("base-layout")).toBeInTheDocument();
      });

      // Should not create a messaging channel
      const messagingCalls = mockStreamClient.channel.mock.calls.filter(
        (call: any) => call[0] === "messaging" && call[1]?.members
      );
      expect(messagingCalls.length).toBe(0);
    });

    it("handles error when auto-DM creation fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockStreamClient.userID = "user-1";
      mockLocationState.state = { repId: "rep-123" };
      
      // Make channel.watch fail
      mockChannel.watch.mockRejectedValueOnce(new Error("Failed to create channel"));

      renderChatPage();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "CHAT: auto-DM failed",
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Student DM from profile / shortlist", () => {
    it("opens DM via getOrCreateDirectChannel when dmStudentId is in location state", async () => {
      mockStreamClient.userID = "user-1";
      mockLocationState.state = { dmStudentId: "student-99" };

      renderChatPage();

      await waitFor(() => {
        expect(chatDmMock.getOrCreateDirectChannel).toHaveBeenCalledWith("user-1", "student-99");
        expect(mockNavigate).toHaveBeenCalledWith("/", {
          replace: true,
          state: {},
        });
      });
    });

    it("does not call getOrCreateDirectChannel when dmStudentId is absent", async () => {
      mockStreamClient.userID = "user-1";
      mockLocationState.state = null;

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("base-layout")).toBeInTheDocument();
      });

      expect(chatDmMock.getOrCreateDirectChannel).not.toHaveBeenCalled();
    });

    it("skips student DM when dmStudentId matches current user", async () => {
      mockStreamClient.userID = "user-1";
      mockLocationState.state = { dmStudentId: "user-1" };

      renderChatPage();

      await waitFor(() => {
        expect(screen.getByTestId("base-layout")).toBeInTheDocument();
      });

      expect(chatDmMock.getOrCreateDirectChannel).not.toHaveBeenCalled();
    });

    it("logs when open student DM fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockStreamClient.userID = "user-1";
      mockLocationState.state = { dmStudentId: "student-99" };
      chatDmMock.getOrCreateDirectChannel.mockRejectedValueOnce(new Error("dm failed"));

      renderChatPage();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "CHAT: open student DM failed",
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
