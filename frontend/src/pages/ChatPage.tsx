import { useEffect, useState } from "react";
import type React from "react";
import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import AddCommentIcon from "@mui/icons-material/AddComment";
import { useNavigate, useLocation } from "react-router-dom";
import { API_URL } from "../config";
import type { Channel as StreamChannel } from "stream-chat";

import {
  Chat,
  Channel,
  Window,
  MessageList,
} from "stream-chat-react";

import "stream-chat-react/dist/css/v2/index.css";

import ChatSidebar from "../components/chat/ChatSidebar";
import NewChatDialog from "../components/chat/NewChatDialog";
import BaseLayout from "../components/BaseLayout";

import { authUtils } from "../utils/auth";
import { auth } from "../firebase";
import { streamClient } from "../utils/streamClient";
import { getOrCreateDirectChannel } from "../utils/chat";
import "./ChatPage.css";

const CHAT_SHELL_SX = {
  minHeight: "calc(100vh - var(--base-layout-header-height, 88px))",
  display: "flex",
  flexDirection: "column" as const,
};

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const repIdFromBooth = location.state?.repId || null;
  const dmStudentId =
    typeof location.state?.dmStudentId === "string" ? location.state.dmStudentId : null;

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

    let removeNotificationListeners: (() => void) | undefined;

    const init = async () => {
      try {
        // If Stream is connected as someone else → disconnect
        if (client.userID && client.userID !== user.uid) {
          await client.disconnectUser();
        }

        // If not connected → connect
        if (!client.userID) {
          const idToken = await auth.currentUser?.getIdToken();
          const res = await fetch(
            `${API_URL}/api/stream-token`,
            {
              headers: { Authorization: `Bearer ${idToken}` },
            }
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

        removeNotificationListeners = () => {
          client.off("notification.message_new", updateUnread);
          client.off("notification.mark_read", updateUnread);
        };
      } catch (err) {
        console.error("STREAM INIT ERROR", err);
      }
    };

    void init();
    return () => {
      removeNotificationListeners?.();
    };
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

  /*
  ============================================================
   OPEN DM FROM SHORTLIST / VISITOR PROFILE (stable channel id)
  ============================================================
  */
  useEffect(() => {
    if (!clientReady) return;
    if (!client?.userID) return;
    if (!dmStudentId) return;
    if (dmStudentId === client.userID) return;

    const openStudentDm = async () => {
      try {
        const channel = await getOrCreateDirectChannel(client.userID, dmStudentId);
        setActiveChannel(channel);
        navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
      } catch (err) {
        console.error("CHAT: open student DM failed", err);
      }
    };

    void openStudentDm();
  }, [clientReady, dmStudentId, client, navigate, location.pathname, location.search]);


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
      <BaseLayout pageTitle="Chat" showChat={false} onHeaderBack={() => navigate("/dashboard")}>
        <Box sx={CHAT_SHELL_SX}>
          <Box className="chat-center-container">
            <Box className="chat-center-content">
              <Typography variant="h6" className="chat-not-available">
                Chat Not Available
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Stream Chat API key is not configured. Please set VITE_STREAM_API_KEY in your environment variables.
              </Typography>
            </Box>
          </Box>
        </Box>
      </BaseLayout>
    );
  }

  // SAFE LOADING RETURN (NO HOOKS HERE)
  if (!clientReady || !client.userID) {
    return (
      <BaseLayout pageTitle="Chat" showChat={false} onHeaderBack={() => navigate("/dashboard")}>
        <Box sx={CHAT_SHELL_SX}>
          <Box className="chat-loading-container">
            <CircularProgress />
          </Box>
        </Box>
      </BaseLayout>
    );
  }

  // Main chat UI
  const titleSuffix = unreadCount ? ` (${unreadCount})` : "";
  return (
    <BaseLayout
      pageTitle={`Messages${titleSuffix}`}
      showChat={false}
      onHeaderBack={() => navigate("/dashboard")}
      headerActions={
        <Tooltip title="Start New Chat">
          <IconButton
            onClick={() => setDialogOpen(true)}
            aria-label="Start New Chat"
            sx={{
              color: "white",
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.3)",
              "&:hover": { background: "rgba(255,255,255,0.25)" },
            }}
          >
            <AddCommentIcon />
          </IconButton>
        </Tooltip>
      }
    >
      <Box sx={CHAT_SHELL_SX}>
        <Box className="chat-page">
          <Box className="chat-main-wrapper">
            <Chat client={client} theme="messaging light">
              <ChatSidebar
                client={client}
                onSelectChannel={handleSelectChannel}
                activeChannel={activeChannel}
              />

              <Box className="chat-messages-wrapper">
                {activeChannel ? (
                  <Channel channel={activeChannel}>
                    <Window>
                      <Box className="chat-messages-container">
                        {/* MESSAGE LIST */}
                        <Box className="chat-message-list">
                          <MessageList />
                        </Box>

                        {/* INPUT BAR */}
                        <Box className="chat-input-bar">
                          {/* FILE UPLOAD */}
                          <label className="chat-file-upload-label">
                            {"📎"}
                            <input
                              type="file"
                              multiple
                              className="chat-file-upload-input"
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
                            className="chat-textarea"
                          />
                        </Box>
                      </Box>
                    </Window>
                  </Channel>
                ) : (
                  <Box className="chat-empty-state">
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
      </Box>
    </BaseLayout>
  );
}
