"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import type { Channel as StreamChannel } from "stream-chat";

import {
  Chat,
  Channel,
  Window,
  MessageList,
} from "stream-chat-react";

import "stream-chat-react/dist/css/v2/index.css";

import ChatHeader from "../components/chat/ChatHeader";
import ChatSidebar from "../components/chat/ChatSidebar";
import NewChatDialog from "../components/chat/NewChatDialog";

import { authUtils } from "../utils/auth";
import { streamClient } from "../utils/streamClient";

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const repIdFromBooth = location.state?.repId || null;

  const [clientReady, setClientReady] = useState(false);
  const [activeChannel, setActiveChannel] = useState<StreamChannel | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draftMessage, setDraftMessage] = useState("");

  const user = authUtils.getCurrentUser();

  // Stream client instance (non-null is already enforced in streamClient file)
  const client = streamClient;

  /* Redirect if not logged in */
  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);

  /*
  ============================================================
   STEP 1 — CORRECT STREAM USER SESSION HANDLING
  ============================================================
  */
  useEffect(() => {
    if (!user || !client) {
      if (!client) {
        console.log("Stream client not initialized");
      } else if (!user) {
        console.log("No Firebase user, disconnecting Stream");
        if (client.userID) {
          client.disconnectUser();
        }
      }
      return;
    }

    const init = async () => {
      try {
        // If Stream is connected as someone else → disconnect
        if (client.userID && client.userID !== user.uid) {
          await client.disconnectUser();
        }

        // If not connected → connect
        if (!client.userID) {
          const res = await fetch(
            `http://localhost:5000/api/stream-token?userId=${user.uid}`
          );

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to fetch Stream token");
          }

          const { token } = await res.json();

          const fullName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.email;

          await client.connectUser(
            {
              id: user.uid,
              name: fullName,
              email: user.email,
              username: user.email.split("@")[0],
            } as any,
            token
          );

        }

        setClientReady(true);

        // Unread count tracking
        const updateUnread = () => {
          const count = (client.user as any)?.total_unread_count ?? 0;
          setUnreadCount(count);
        };

        updateUnread();
        client.on("notification.message_new", updateUnread);
        client.on("notification.mark_read", updateUnread);

        return () => {
          client.off("notification.message_new", updateUnread);
          client.off("notification.mark_read", updateUnread);
        };
      } catch (err) {
        console.error("STREAM INIT ERROR");
      }
    };

    void init();
  }, [user, client]);

  /*
  ============================================================
   STEP 2 — AUTO-CREATE DM WHEN COMING FROM A BOOTH
  ============================================================
  */
  useEffect(() => {
    // Requirements before running
    if (!clientReady) return;
    if (!repIdFromBooth) return;
    if (!client?.userID) return;

    const startDM = async () => {
        try {
            const channel = client.channel("messaging", {
                members: [client.userID, repIdFromBooth],
            });

            await channel.watch();     // initialize and create if needed
            setActiveChannel(channel); // open it

        } catch (err) {
            console.error("CHAT: auto-DM failed", err);
        }
    };

    startDM();
}, [clientReady, repIdFromBooth, client]);


  /* Select a channel */
  const handleSelectChannel = async (channel: StreamChannel) => {
    await channel.watch();
    setActiveChannel(channel);
    setDraftMessage("");
  };

  /* Send text message */
  const sendMessage = async () => {
    if (!activeChannel) return;
    const text = draftMessage.trim();
    if (!text) return;

    await activeChannel.sendMessage({ text });
    setDraftMessage("");
  };

  /* Send files */
  const sendFiles = async (files: FileList) => {
    if (!activeChannel) return;
    if (!files.length) return;

    const attachments = [];

    for (const file of Array.from(files)) {
      const response = await activeChannel.sendFile(file);

      attachments.push({
        type: "file",
        asset_url: response.file,
        name: file.name,
        file_size: file.size,
        mime_type: file.type,
      });
    }

    await activeChannel.sendMessage({
      text: draftMessage.trim(),
      attachments,
    });

    setDraftMessage("");
  };

  /* Enter vs Alt+Enter */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      void sendMessage();
      return;
    }

    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      setDraftMessage((prev) => prev + "\n");
    }
  };

  /* Auto-grow textarea */
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  // If streamClient is missing entirely
  if (!client) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Chat Not Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Stream Chat API key is not configured. Please set VITE_STREAM_API_KEY in your environment variables.
          </Typography>
        </Box>
      </Box>
    );
  }

  // SAFE LOADING RETURN (NO HOOKS HERE)
  if (!clientReady || !client.userID) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Main chat UI
  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ChatHeader
        title={`Messages${unreadCount ? ` (${unreadCount})` : ""}`}
        onNewChat={() => setDialogOpen(true)}
        onBack={() => navigate("/dashboard")}
      />

      <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Chat client={client} theme="messaging light">
          <ChatSidebar
            client={client}
            onSelectChannel={handleSelectChannel}
            activeChannel={activeChannel}
          />

          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: "#fff",
              overflow: "hidden",
            }}
          >
            {activeChannel ? (
              <Channel channel={activeChannel}>
                <Window>
                  <Box
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* MESSAGE LIST */}
                    <Box
                      sx={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                      }}
                    >
                      <MessageList />
                    </Box>

                    {/* INPUT BAR */}
                    <Box
                      sx={{
                        borderTop: "1px solid #ddd",
                        background: "#fafafa",
                        padding: "12px 16px",
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-end",
                      }}
                    >
                      {/* FILE UPLOAD */}
                      <label
                        style={{
                          cursor: "pointer",
                          fontSize: "22px",
                          color: "#666",
                          paddingBottom: "4px",
                        }}
                      >
                        📎
                        <input
                          type="file"
                          multiple
                          style={{ display: "none" }}
                          onChange={(e) => {
                            if (e.target.files) {
                              void sendFiles(e.target.files);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>

                      {/* TEXTAREA */}
                      <textarea
                        placeholder="Begin typing to send a message..."
                        value={draftMessage}
                        onChange={(e) => setDraftMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        style={{
                          width: "100%",
                          minHeight: "42px",
                          maxHeight: "200px",
                          padding: "12px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                          fontSize: "15px",
                          resize: "none",
                          overflow: "hidden",
                          outline: "none",
                          background: "#fff",
                          flex: 1,
                        }}
                      />
                    </Box>
                  </Box>
                </Window>
              </Channel>
            ) : (
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#666",
                  fontSize: "1.2rem",
                }}
              >
                Select a chat or start a new one
              </Box>
            )}
          </Box>
        </Chat>
      </Box>

      <NewChatDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        client={client}
        currentUser={user}
        clientReady={clientReady}
        onSelectChannel={handleSelectChannel}
      />
    </Box>
  );
}
