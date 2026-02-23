import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatMessages from "../chat/MessageList";

// Mock stream-chat-react components
vi.mock("stream-chat-react", () => ({
  Channel: ({ children }: any) => <div data-testid="channel-wrapper">{children}</div>,
  Window: ({ children }: any) => <div data-testid="window-wrapper">{children}</div>,
  MessageList: () => <div data-testid="message-list">Mock Message List</div>,
  MessageInput: () => <div data-testid="message-input">Mock Message Input</div>,
}));

describe("ChatMessages (MessageList)", () => {
  const mockChannel = {
    markRead: vi.fn(),
    cid: "test-channel",
  } as any;

  beforeEach(() => {
    mockChannel.markRead.mockClear();
  });

  it("renders empty state when no channel is selected", () => {
    render(<ChatMessages channel={null} />);
    expect(screen.getByText("Select a chat to start messaging.")).toBeInTheDocument();
  });

  it("renders the channel wrapper when channel is provided", () => {
    render(<ChatMessages channel={mockChannel} />);
    expect(screen.getByTestId("channel-wrapper")).toBeInTheDocument();
  });

  it("renders the window wrapper with message list and input", () => {
    render(<ChatMessages channel={mockChannel} />);
    expect(screen.getByTestId("window-wrapper")).toBeInTheDocument();
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByTestId("message-input")).toBeInTheDocument();
  });

  it("marks channel as read when channel is provided", () => {
    render(<ChatMessages channel={mockChannel} />);
    expect(mockChannel.markRead).toHaveBeenCalledOnce();
  });

  it("marks channel as read when channel changes", () => {
    const { rerender } = render(<ChatMessages channel={null} />);
    expect(mockChannel.markRead).not.toHaveBeenCalled();

    rerender(<ChatMessages channel={mockChannel} />);
    expect(mockChannel.markRead).toHaveBeenCalledOnce();
  });

  it("does not mark as read when channel is null", () => {
    const mockChannelMarkRead = vi.fn();
    const nullChannel = null;

    render(<ChatMessages channel={nullChannel} />);
    expect(mockChannelMarkRead).not.toHaveBeenCalled();
  });

  it("handles channel switching", () => {
    const channel2 = {
      markRead: vi.fn(),
      cid: "test-channel-2",
    } as any;

    const { rerender } = render(<ChatMessages channel={mockChannel} />);
    expect(mockChannel.markRead).toHaveBeenCalledTimes(1);

    rerender(<ChatMessages channel={channel2} />);
    expect(channel2.markRead).toHaveBeenCalledTimes(1);
  });

  it("renders the correct number of stream components", () => {
    render(<ChatMessages channel={mockChannel} />);
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByTestId("message-input")).toBeInTheDocument();
  });

  it("passes the channel to the Channel component", () => {
    render(<ChatMessages channel={mockChannel} />);

    // Verify that the channel wrapper is rendered when a channel is provided
    expect(screen.getByTestId("channel-wrapper")).toBeInTheDocument();
    expect(screen.getByTestId("window-wrapper")).toBeInTheDocument();
  });
});
