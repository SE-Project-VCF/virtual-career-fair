import { useEffect, useState } from "react"
import type React from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  CircularProgress,
  Typography,
  Button,
  Tabs,
  Tab,
  Card,
  CardContent,
  Chip,
  Avatar,
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ChatIcon from "@mui/icons-material/Chat"
import PeopleIcon from "@mui/icons-material/People"
import LinkedInIcon from "@mui/icons-material/LinkedIn"
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

interface Attendee {
  uid: string
  firstName: string
  lastName: string
  email: string
  major: string
  expectedGradYear: number | null
  skills: string
  linkedinUrl: string | null
}

function AttendeeCard({
  attendee,
  currentUid,
  onMessage,
}: Readonly<{
  attendee: Attendee
  currentUid: string
  onMessage: (attendee: Attendee) => void
}>) {
  const skills = attendee.skills
    ? attendee.skills.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    : []

  const initials =
    `${attendee.firstName?.[0] ?? ""}${attendee.lastName?.[0] ?? ""}`.toUpperCase() ||
    attendee.email[0].toUpperCase()

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        <Avatar sx={{ bgcolor: "#388560", width: 44, height: 44, flexShrink: 0 }}>
          {initials}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {attendee.firstName} {attendee.lastName}
          </Typography>

          {(attendee.major || attendee.expectedGradYear) && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
              {attendee.major && (
                <Chip
                  label={attendee.major}
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: "#388560", color: "#388560" }}
                />
              )}
              {attendee.expectedGradYear && (
                <Chip
                  label={`Class of ${attendee.expectedGradYear}`}
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: "#388560", color: "#388560" }}
                />
              )}
            </Box>
          )}

          {skills.length > 0 && (
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
              {skills.map((skill) => (
                <Chip
                  key={skill}
                  label={skill}
                  size="small"
                  sx={{ bgcolor: "rgba(56,133,96,0.1)", color: "#388560" }}
                />
              ))}
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
            {attendee.linkedinUrl && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<LinkedInIcon />}
                href={attendee.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ borderColor: "#0a66c2", color: "#0a66c2" }}
              >
                LinkedIn
              </Button>
            )}
            {attendee.uid !== currentUid && (
              <Button
                size="small"
                variant="contained"
                startIcon={<ChatIcon />}
                onClick={() => onMessage(attendee)}
                sx={{ bgcolor: "#388560" }}
              >
                Message
              </Button>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function NetworkingLounge() {
  const navigate = useNavigate()
  const { fair, fairId } = useFair()
  const user = authUtils.getCurrentUser()
  const client = streamClient

  const [clientReady, setClientReady] = useState(false)
  const [channel, setChannel] = useState<StreamChannel | null>(null)
  const [error, setError] = useState("")
  const [draftMessage, setDraftMessage] = useState("")
  const [activeTab, setActiveTab] = useState(0)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loadingAttendees, setLoadingAttendees] = useState(false)

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
          // Wait for Firebase auth to hydrate if currentUser isn't available yet
          const firebaseUser = auth.currentUser ?? await new Promise<import("firebase/auth").User | null>(
            (resolve) => {
              const unsub = auth.onAuthStateChanged((u) => { unsub(); resolve(u) })
            }
          )
          if (!firebaseUser) throw new Error("Not authenticated")

          const idToken = await firebaseUser.getIdToken()
          const res = await fetch(`${API_URL}/api/stream-token`, {
            headers: { Authorization: `Bearer ${idToken}` },
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || `Stream token request failed (${res.status})`)
          }

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

  // Load attendees when switching to that tab
  useEffect(() => {
    if (activeTab !== 1 || !fairId || attendees.length > 0) return

    const fetchAttendees = async () => {
      try {
        setLoadingAttendees(true)
        const idToken = await auth.currentUser?.getIdToken()
        const res = await fetch(`${API_URL}/api/fairs/${fairId}/lounge/attendees`, {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        if (!res.ok) throw new Error("Failed to fetch attendees")
        const data = await res.json()
        setAttendees(data.attendees || [])
      } catch (err) {
        console.error("Attendees fetch error:", err)
      } finally {
        setLoadingAttendees(false)
      }
    }

    void fetchAttendees()
  }, [activeTab, fairId, attendees.length])

  const handleMessageAttendee = async (attendee: Attendee) => {
    if (!client || !user) return
    try {
      const sorted = [user.uid, attendee.uid].sort((a, b) => a.localeCompare(b))
      const channelId = `dm-${sorted[0]}-${sorted[1]}`

      const existing = await client.queryChannels(
        { type: "messaging", cid: `messaging:${channelId}` },
        {},
        { limit: 1 }
      )

      let dmChannel
      if (existing.length > 0) {
        dmChannel = existing[0]
        await dmChannel.watch()
      } else {
        dmChannel = client.channel("messaging", channelId, { members: sorted })
        await dmChannel.create()
        await dmChannel.watch()
      }

      navigate("/dashboard/chat")
    } catch (err) {
      console.error("Error opening DM:", err)
    }
  }

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
        <Box sx={{ p: 1, borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center" }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/fair/${fairId}/booths`)} size="small">
            Back to Booths
          </Button>
        </Box>

        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ borderBottom: "1px solid #e0e0e0", px: 2 }}
        >
          <Tab icon={<ChatIcon fontSize="small" />} iconPosition="start" label="Group Chat" />
          <Tab icon={<PeopleIcon fontSize="small" />} iconPosition="start" label="Attendees" />
        </Tabs>

        {/* Group Chat Tab */}
        {activeTab === 0 && (
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
        )}

        {/* Attendees Tab */}
        {activeTab === 1 && (
          <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
            {loadingAttendees && (
              <Box sx={{ display: "flex", justifyContent: "center", pt: 4 }}>
                <CircularProgress />
              </Box>
            )}
            {!loadingAttendees && attendees.length === 0 && (
              <Typography color="text.secondary" sx={{ pt: 2 }}>
                No other students in the lounge yet.
              </Typography>
            )}
            {!loadingAttendees && attendees.length > 0 && attendees.map((a) => (
              <AttendeeCard
                key={a.uid}
                attendee={a}
                currentUid={user?.uid ?? ""}
                onMessage={handleMessageAttendee}
              />
            ))}
          </Box>
        )}
      </Box>
    </BaseLayout>
  )
}
