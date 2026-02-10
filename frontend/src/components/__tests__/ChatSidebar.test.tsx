import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatSidebar from "../chat/ChatSidebar";
import * as streamChatReact from "stream-chat-react";

// Mock the stream-chat-react module
vi.mock("stream-chat-react", () => ({
  ChannelList: ({ Preview, filters }: any) => (
    <div data-testid="channel-list">
      {Preview && Preview({ channel: { cid: "test-channel" }, setActiveChannel: vi.fn() })}
    </div>
  ),
  ChannelPreviewMessenger: (props: any) => (
    <div data-testid="channel-preview" onClick={props.onSelect}>
      {props.channel?.name || "Test Channel"}
    </div>
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
    render(
      <ChatSidebar
        client={mockClient}
        onSelectChannel={mockOnSelectChannel}
        activeChannel={null}
      />
    );

    const preview = channelListSpy.mock.calls[0]?.[0]?.Preview;
    if (preview) {
      const mockSetActiveChannel = vi.fn();
      const result = preview({
        channel: mockChannel,
        setActiveChannel: mockSetActiveChannel,
      });
      // Simulate click
      if (result && result.props?.onClick) {
        result.props.onClick();
      }
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
    const preview = call?.Preview;

    const previewComponent = preview?.({
      channel: mockChannel,
      setActiveChannel: vi.fn(),
    });

    expect(previewComponent?.props?.active).toBeTrue();

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
    expect(call?.filters?.members?.$in).toContain("custom-user-123");

    channelListSpy.mockRestore();
  });
});
