import { Channel, Window, MessageList, MessageInput } from "stream-chat-react";
import { useEffect } from "react";
import type { Channel as StreamChannel } from "stream-chat";

interface MessageListProps {
  channel: StreamChannel | null;
}

export default function ChatMessages({ channel }: Readonly<MessageListProps>) {
  useEffect(() => {
    if (channel) {
      // ✅ Mark as read when opening
      channel.markRead();
    }
  }, [channel]);

  if (!channel) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#555" }}>
        Select a chat to start messaging.
      </div>
    );
  }

  return (
    <Channel channel={channel}>
      <Window>
        <MessageList />
        <MessageInput focus />
      </Window>
    </Channel>
  );
}
