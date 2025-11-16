import { Box, Typography } from "@mui/material";
import {
  ChannelList,
  ChannelPreviewMessenger,
} from "stream-chat-react";
import type { StreamChat, Channel } from "stream-chat";

interface ChatSidebarProps {
  client: StreamChat;
  onSelectChannel: (channel: Channel) => void;
}

export default function ChatSidebar({ client, onSelectChannel }: ChatSidebarProps) {
  return (
    <Box
      sx={{
        width: 300,
        borderRight: "1px solid rgba(0,0,0,0.1)",
        backgroundColor: "#fafafa",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography
        variant="subtitle1"
        sx={{
          px: 2,
          py: 1.5,
          fontWeight: 600,
          borderBottom: "1px solid rgba(0,0,0,0.1)",
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          color: "white",
        }}
      >
        Chats
      </Typography>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ChannelList
          filters={{
            type: "messaging",
            // ONLY show channels the current user is a member of
            members: { $in: [client.userID!] },
          }}
          sort={{ last_message_at: -1 as const }}
          options={{ state: true, watch: true, presence: true }}
          Preview={(props: any) => (
            <ChannelPreviewMessenger
              {...props}
              onSelect={() => {
                const channel = props.channel;
                props.setActiveChannel?.(channel);

                // pass channel object upwards
                onSelectChannel(channel);
              }}
            />
          )}
        />
      </Box>
    </Box>
  );
}
