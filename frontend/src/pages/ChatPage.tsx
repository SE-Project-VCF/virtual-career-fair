"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { Box, CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";
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

  const [clientReady, setClientReady] = useState(false);
  const [activeChannel, setActiveChannel] = useState<StreamChannel | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draftMessage, setDraftMessage] = useState("");

  const user = authUtils.getCurrentUser();

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
    if (!user) {
      console.log("STREAM DEBUG: No Firebase user, disconnecting Stream...");
      if (streamClient.userID) {
        streamClient.disconnectUser();
      }
      return;
    }

    const init = async () => {
      try {
        console.log("STREAM DEBUG: Firebase user =", user.uid);
        console.log("STREAM DEBUG: Current Stream userID =", streamClient.userID);

        // If Stream is connected as someone else → disconnect
        if (streamClient.userID && streamClient.userID !== user.uid) {
          console.log("STREAM DEBUG: Disconnecting old Stream user...");
          await streamClient.disconnectUser();
        }

        // If not connected → connect
        if (!streamClient.userID) {
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

          console.log("STREAM DEBUG: Connecting Stream as", user.uid);

          await streamClient.connectUser(
            {
              id: user.uid,
              name: fullName,
              email: user.email,
              username: user.email.split("@")[0],
            } as any,
            token
          );

          console.log("STREAM DEBUG: Stream connected as", user.uid);
        }

        setClientReady(true);

        // Unread count tracking
        const updateUnread = () => {
          const count = (streamClient.user as any)?.total_unread_count ?? 0;
          setUnreadCount(count);
        };

        updateUnread();
        streamClient.on("notification.message_new", updateUnread);
        streamClient.on("notification.mark_read", updateUnread);

        return () => {
          streamClient.off("notification.message_new", updateUnread);
          streamClient.off("notification.mark_read", updateUnread);
        };
      } catch (err) {
        console.error("STREAM INIT ERROR:", err);
      }
    };

    init();
  }, [user]);

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

  if (!clientReady || !streamClient.userID) {
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

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ChatHeader
        title={`Messages${unreadCount ? ` (${unreadCount})` : ""}`}
        onNewChat={() => setDialogOpen(true)}
        onBack={() => navigate("/dashboard")}
      />

      <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Chat client={streamClient} theme="messaging light">
          <ChatSidebar client={streamClient} onSelectChannel={handleSelectChannel} />

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
        client={streamClient}
        currentUser={user}
        clientReady={clientReady}
      />
    </Box>
  );
}
