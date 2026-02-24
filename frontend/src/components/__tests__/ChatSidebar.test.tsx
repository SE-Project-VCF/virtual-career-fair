import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatSidebar from "../chat/ChatSidebar";
import * as streamChatReact from "stream-chat-react";

// Mock the stream-chat-react module
vi.mock("stream-chat-react", () => ({
  ChannelList: ({ Preview }: any) => (
    <div data-testid="channel-list">
      {Preview?.({ channel: { cid: "test-channel" }, setActiveChannel: vi.fn() })}
    </div>
  ),
  ChannelPreviewMessenger: (props: any) => (
    <button 
      data-testid="channel-preview" 
      onClick={props.onSelect}
    >
      {props.channel?.name || "Test Channel"}
    </button>
  ),
}));

describe("ChatSidebar", () => {
  const mockClient = {
    userID: "test-user-id",
  } as any;

  const mockChannel = {
    cid: "test-channel",
    name: "Test Channel",
  } as any;

  const mockOnSelectChannel = vi.fn();

  beforeEach(() => {
    mockOnSelectChannel.mockClear();
  });

  it("renders the sidebar container", () => {
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={null}
      />
    );
    expect(screen.getByText("Chats")).toBeInTheDocument();
  });

  it("renders the ChannelList component", () => {
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={null}
      />
    );
    expect(screen.getByTestId("channel-list")).toBeInTheDocument();
  });

  it("passes correct filters to ChannelList", () => {
    const channelListSpy = vi.spyOn(streamChatReact, "ChannelList");
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={null}
      />
    );

    const call = channelListSpy.mock.calls[0]?.[0];
    expect(call?.filters).toEqual({
      type: "messaging",
      members: { $in: ["test-user-id"] },
    });
    expect(call?.sort).toEqual({ last_message_at: -1 });

    channelListSpy.mockRestore();
  });

  it("calls onSelectChannel when a channel is selected", () => {
    const channelListSpy = vi.spyOn(streamChatReact, "ChannelList");
    const mockSetActiveChannel = vi.fn();
    
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={null}
      />
    );

    const preview = channelListSpy.mock.calls[0]?.[0]?.Preview as any;
    if (preview) {
      const result = preview({
        channel: mockChannel,
        setActiveChannel: mockSetActiveChannel,
        latestMessagePreview: { text: "Latest message" },
        Avatar: () => null,
      });
      
      // Get the onSelect callback from ChannelPreviewMessenger props
      const onSelect = result?.props?.onSelect;
      if (onSelect) {
        onSelect();
      }
      
      // Verify both callbacks are called
      expect(mockSetActiveChannel).toHaveBeenCalledWith(mockChannel);
      expect(mockOnSelectChannel).toHaveBeenCalledWith(mockChannel);
    }

    channelListSpy.mockRestore();
  });

  it("highlights active channel", () => {
    const channelListSpy = vi.spyOn(streamChatReact, "ChannelList");
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={mockChannel}
      />
    );

    const call = channelListSpy.mock.calls[0]?.[0];
    const preview = call?.Preview as any;

    if (preview) {
      const previewComponent = preview({
        channel: mockChannel,
        setActiveChannel: vi.fn(),
      });
      expect(previewComponent?.props?.active).toBe(true);
    }

    channelListSpy.mockRestore();
  });

  it("renders with custom client user ID", () => {
    const customClient = {
      userID: "custom-user-123",
    } as any;

    const channelListSpy = vi.spyOn(streamChatReact, "ChannelList");
    render(
      <ChatSidebar
        client={customClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={null}
      />
    );

    const call = channelListSpy.mock.calls[0]?.[0];
    const filters = call?.filters as any;
    expect(filters?.members?.$in).toContain("custom-user-123");

    channelListSpy.mockRestore();
  });

  it("passes all required props to ChannelPreviewMessenger", () => {
    const channelListSpy = vi.spyOn(streamChatReact, "ChannelList");
    const mockLatestMessage = { text: "Hello world" };
    const mockAvatar = () => null;
    const mockSetActiveChannel = vi.fn();
    
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={null}
      />
    );

    const preview = channelListSpy.mock.calls[0]?.[0]?.Preview as any;
    if (preview) {
      const result = preview({
        channel: mockChannel,
        setActiveChannel: mockSetActiveChannel,
        latestMessagePreview: mockLatestMessage,
        Avatar: mockAvatar,
      });
      
      expect(result?.props?.channel).toBe(mockChannel);
      expect(result?.props?.latestMessagePreview).toBe(mockLatestMessage);
      expect(result?.props?.Avatar).toBe(mockAvatar);
      expect(result?.props?.active).toBe(false);
    }

    channelListSpy.mockRestore();
  });

  it("shows inactive state for non-matching channel", () => {
    const differentChannel = {
      cid: "different-channel",
      name: "Different Channel",
    } as any;
    
    const channelListSpy = vi.spyOn(streamChatReact, "ChannelList");
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={differentChannel}
      />
    );

    const preview = channelListSpy.mock.calls[0]?.[0]?.Preview as any;
    if (preview) {
      const result = preview({
        channel: mockChannel,
        setActiveChannel: vi.fn(),
      });
      
      expect(result?.props?.active).toBe(false);
    }

    channelListSpy.mockRestore();
  });
});
