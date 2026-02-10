import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NewChatDialog from "../chat/NewChatDialog";

describe("NewChatDialog", () => {
  const mockUser = {
    uid: "test-user-id",
    email: "test@example.com",
    displayName: "Test User",
  };

  const mockClient = {
    queryUsers: vi.fn(),
    queryChannels: vi.fn(),
    channel: vi.fn(),
    userID: "test-user-id",
  } as any;

  const mockOnClose = vi.fn();
  const mockOnSelectChannel = vi.fn();

  beforeEach(() => {
    mockClient.queryUsers.mockClear();
    mockClient.queryChannels.mockClear();
    mockClient.channel.mockClear();
    mockOnClose.mockClear();
    mockOnSelectChannel.mockClear();
  });

  it("renders dialog when open is true", () => {
    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );
    expect(screen.getByText("Start a New Chat")).toBeInTheDocument();
  });

  it("does not render dialog when open is false", () => {
    render(
      <NewChatDialog
        open={false}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );
    expect(screen.queryByText("Start a New Chat")).not.toBeInTheDocument();
  });

  it("renders search input field", () => {
    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );
    expect(screen.getByLabelText(/search users/i)).toBeInTheDocument();
  });

  it("calls onClose when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("searches for users when typing in search field", async () => {
    const user = userEvent.setup();
    mockClient.queryUsers.mockResolvedValue({
      users: [
        { id: "user-2", name: "John Doe", email: "john@example.com" },
      ],
    });

    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(mockClient.queryUsers).toHaveBeenCalled();
    });
  });

  it("displays search results", async () => {
    const user = userEvent.setup();
    mockClient.queryUsers.mockResolvedValue({
      users: [
        { id: "user-2", name: "John Doe", email: "john@example.com" },
      ],
    });

    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });

  it("updates recipient email when user is selected", async () => {
    const user = userEvent.setup();
    mockClient.queryUsers.mockResolvedValue({
      users: [
        { id: "user-2", name: "John Doe", email: "john@example.com" },
      ],
    });

    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const userResult = screen.getByText("John Doe");
    await user.click(userResult);

    const recipientEmail = screen.getByLabelText(/recipient email/i) as HTMLInputElement;
    expect(recipientEmail.value).toBe("john@example.com");
  });

  it("disables start chat button when no user is selected", () => {
    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );

    const startChatButton = screen.getByRole("button", { name: /start chat/i });
    expect(startChatButton).toBeDisabled();
  });

  it("enables start chat button when user is selected", async () => {
    const user = userEvent.setup();
    mockClient.queryUsers.mockResolvedValue({
      users: [
        { id: "user-2", name: "John Doe", email: "john@example.com" },
      ],
    });

    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const userResult = screen.getByText("John Doe");
    await user.click(userResult);

    const startChatButton = screen.getByRole("button", { name: /start chat/i });
    expect(startChatButton).not.toBeDisabled();
  });

  it("creates a chat when start chat is clicked", async () => {
    const user = userEvent.setup();
    const mockChannel = {
      watch: vi.fn(),
      create: vi.fn(),
    };

    mockClient.queryUsers.mockResolvedValue({
      users: [
        { id: "user-2", name: "John Doe", email: "john@example.com" },
      ],
    });

    mockClient.queryChannels.mockResolvedValue([]);
    mockClient.channel.mockReturnValue(mockChannel);

    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
        onSelectChannel={mockOnSelectChannel}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const userResult = screen.getByText("John Doe");
    await user.click(userResult);

    const startChatButton = screen.getByRole("button", { name: /start chat/i });
    await user.click(startChatButton);

    await waitFor(() => {
      expect(mockClient.channel).toHaveBeenCalled();
      expect(mockOnSelectChannel).toHaveBeenCalled();
    });
  });

  it("closes dialog after successful chat creation", async () => {
    const user = userEvent.setup();
    const mockChannel = {
      watch: vi.fn(),
      create: vi.fn(),
    };

    mockClient.queryUsers.mockResolvedValue({
      users: [
        { id: "user-2", name: "John Doe", email: "john@example.com" },
      ],
    });

    mockClient.queryChannels.mockResolvedValue([]);
    mockClient.channel.mockReturnValue(mockChannel);

    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
        onSelectChannel={mockOnSelectChannel}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const userResult = screen.getByText("John Doe");
    await user.click(userResult);

    const startChatButton = screen.getByRole("button", { name: /start chat/i });
    await user.click(startChatButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("shows error message when user selection fails", async () => {
    const user = userEvent.setup();
    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
      />
    );

    const startChatButton = screen.getByRole("button", { name: /start chat/i });
    await user.click(startChatButton);

    await waitFor(() => {
      expect(screen.getByText("Please select a user.")).toBeInTheDocument();
    });
  });

  it("does not call queryUsers when clientReady is false", async () => {
    const user = userEvent.setup();
    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={false}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    expect(mockClient.queryUsers).not.toHaveBeenCalled();
  });

  it("handles existing channel scenario", async () => {
    const user = userEvent.setup();
    const mockChannel = {
      watch: vi.fn(),
    };

    mockClient.queryUsers.mockResolvedValue({
      users: [
        { id: "user-2", name: "John Doe", email: "john@example.com" },
      ],
    });

    mockClient.queryChannels.mockResolvedValue([mockChannel]);
    mockClient.channel.mockReturnValue(mockChannel);

    render(
      <NewChatDialog
        open={true}
        onClose={mockOnClose}
        client={mockClient}
        currentUser={mockUser}
        clientReady={true}
        onSelectChannel={mockOnSelectChannel}
      />
    );

    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const userResult = screen.getByText("John Doe");
    await user.click(userResult);

    const startChatButton = screen.getByRole("button", { name: /start chat/i });
    await user.click(startChatButton);

    await waitFor(() => {
      expect(mockChannel.watch).toHaveBeenCalled();
      expect(mockOnSelectChannel).toHaveBeenCalled();
    });
  });
});
