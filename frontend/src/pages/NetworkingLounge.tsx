import { useEffect, useState } from "react"
import type React from "react"
import { useNavigate } from "react-router-dom"
import { Box, CircularProgress, Typography, Button } from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import type { Channel as StreamChannel } from "stream-chat"

import {
  Chat,
  Channel,
  Window,
  MessageList,
} from "stream-chat-react"
import "stream-chat-react/dist/css/v2/index.css"

import BaseLayout from "../components/BaseLayout"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import { streamClient } from "../utils/streamClient"
import { API_URL } from "../config"

export default function NetworkingLounge() {
  const navigate = useNavigate()
  const { fair, fairId } = useFair()
  const user = authUtils.getCurrentUser()
  const client = streamClient

  const [clientReady, setClientReady] = useState(false)
  const [channel, setChannel] = useState<StreamChannel | null>(null)
  const [error, setError] = useState("")
  const [draftMessage, setDraftMessage] = useState("")

  // Redirect if not logged in
  useEffect(() => {
    if (!user) navigate("/")
  }, [user, navigate])

  // Connect to Stream
  useEffect(() => {
    if (!user || !client) return

    const init = async () => {
      try {
        if (client.userID && client.userID !== user.uid) {
          await client.disconnectUser()
        }

        if (!client.userID) {
          const idToken = await auth.currentUser?.getIdToken()
          const res = await fetch(`${API_URL}/api/stream-token`, {
            headers: { Authorization: `Bearer ${idToken}` },
          })
          if (!res.ok) throw new Error("Failed to fetch Stream token")

          const { token } = await res.json()
          const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email

          await client.connectUser(
            {
              id: user.uid,
              name: fullName,
              email: user.email,
              username: user.email.split("@")[0],
            } as any,
            token
          )
        }

        setClientReady(true)
      } catch (err) {
        console.error("Stream init error:", err)
        setError("Failed to connect to chat")
      }
    }

    void init()
  }, [user, client])

  // Join lounge channel
  useEffect(() => {
    if (!clientReady || !client?.userID || !fairId) return

    const joinLounge = async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken()
        const joinRes = await fetch(`${API_URL}/api/fairs/${fairId}/lounge/join`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        })

        if (!joinRes.ok) {
          const data = await joinRes.json()
          throw new Error(data.error || "Failed to join lounge")
        }

        const { channelId } = await joinRes.json()
        const loungeChannel = client.channel("messaging", channelId)
        await loungeChannel.watch({ messages: { limit: 20 } })
        setChannel(loungeChannel)
      } catch (err: any) {
        console.error("Lounge join error:", err)
        setError(err.message || "Failed to join networking lounge")
      }
    }

    void joinLounge()
  }, [clientReady, client, fairId])

  // Send message
  const sendMessage = async () => {
    if (!channel) return
    const text = draftMessage.trim()
    if (!text) return
    await channel.sendMessage({ text })
    setDraftMessage("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault()
      void sendMessage()
      return
    }
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault()
      setDraftMessage((prev) => prev + "\n")
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = "auto"
    el.style.height = el.scrollHeight + "px"
  }

  if (!client) {
    return (
      <BaseLayout pageTitle="Networking Lounge">
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
          <Typography color="text.secondary">Chat is not available. Stream API key is not configured.</Typography>
        </Box>
      </BaseLayout>
    )
  }

  if (error) {
    return (
      <BaseLayout pageTitle="Networking Lounge">
        <Box sx={{ p: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/fair/${fairId}`)}>
            Back to Fair
          </Button>
          <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>
        </Box>
      </BaseLayout>
    )
  }

  if (!clientReady || !channel) {
    return (
      <BaseLayout pageTitle="Networking Lounge">
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
          <CircularProgress />
        </Box>
      </BaseLayout>
    )
  }

  const fairName = fair?.name || "Career Fair"

  return (
    <BaseLayout pageTitle={`${fairName} Lounge`}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
        <Box sx={{ p: 1, borderBottom: "1px solid #e0e0e0" }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/fair/${fairId}/booths`)} size="small">
            Back to Booths
          </Button>
        </Box>

        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Chat client={client} theme="messaging light">
            <Channel channel={channel}>
              <Window>
                <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                  <Box sx={{ flex: 1, overflowY: "auto" }}>
                    <MessageList />
                  </Box>

                  <Box sx={{ borderTop: "1px solid #e0e0e0", p: 2, backgroundColor: "#fff" }}>
                    <textarea
                      placeholder="Chat with other students..."
                      value={draftMessage}
                      onChange={(e) => setDraftMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onInput={handleInput}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        fontFamily: "inherit",
                        resize: "vertical",
                      }}
                    />
                  </Box>
                </Box>
              </Window>
            </Channel>
          </Chat>
        </Box>
      </Box>
    </BaseLayout>
  )
}
