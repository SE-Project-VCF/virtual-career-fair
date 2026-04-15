import { useEffect, useRef, useState } from "react"
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
  CardActions,
  Chip,
  Container,
  Grid,
  FormControlLabel,
  Switch,
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

function waitForFirebaseUser(): Promise<import("firebase/auth").User | null> {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => { unsub(); resolve(u) })
  })
}

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

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1, gap: 1 }}>
          <Typography variant="h6" fontWeight="bold">
            {attendee.firstName} {attendee.lastName}
          </Typography>
          {attendee.expectedGradYear && (
            <Chip label={`Class of ${attendee.expectedGradYear}`} size="small" sx={{ flexShrink: 0 }} />
          )}
        </Box>

        {attendee.major && (
          <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
            {attendee.major}
          </Typography>
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
      </CardContent>

      <CardActions sx={{ p: 2, pt: 0, flexWrap: "wrap", gap: 1 }}>
        {attendee.linkedinUrl && (
          <Button
            variant="outlined"
            startIcon={<LinkedInIcon />}
            href={attendee.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ borderColor: "#0a66c2", color: "#0a66c2", flexGrow: 1 }}
          >
            LinkedIn
          </Button>
        )}
        {attendee.uid !== currentUid && (
          <Button
            variant="contained"
            startIcon={<ChatIcon />}
            onClick={() => onMessage(attendee)}
            fullWidth={!attendee.linkedinUrl}
            sx={{ bgcolor: "#388560", flexGrow: 1 }}
          >
            Message
          </Button>
        )}
      </CardActions>
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
  const [ghostMode, setGhostMode] = useState<boolean>(
    Boolean((user as any)?.ghostMode)
  )
  const attendeesFetched = useRef(false)

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
          const firebaseUser = auth.currentUser ?? await waitForFirebaseUser()
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

  // Load attendees when switching to that tab (fetch only once)
  useEffect(() => {
    if (activeTab !== 1 || !fairId || attendeesFetched.current) return
    attendeesFetched.current = true

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
  }, [activeTab, fairId])

  const handleMessageAttendee = (attendee: Attendee) => {
    navigate("/dashboard/chat", { state: { repId: attendee.uid } })
  }

  const handleToggleGhostMode = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    const prev = ghostMode
    setGhostMode(next)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/users/me/ghost-mode`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ghostMode: next }),
      })
      if (!res.ok) throw new Error("Failed to update ghost mode")
      const stored = localStorage.getItem("currentUser")
      if (stored) {
        const parsed = JSON.parse(stored)
        parsed.ghostMode = next
        localStorage.setItem("currentUser", JSON.stringify(parsed))
      }
    } catch (err) {
      console.error(err)
      setGhostMode(prev)
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
          <Box sx={{ flex: 1, overflowY: "auto" }}>
            <Container maxWidth="lg" sx={{ py: 4 }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={ghostMode}
                      onChange={handleToggleGhostMode}
                      inputProps={{ "aria-label": "Ghost Mode" }}
                    />
                  }
                  label="Ghost Mode — hide my profile from other attendees"
                />
              </Box>
              {loadingAttendees && (
                <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                  <CircularProgress />
                </Box>
              )}
              {!loadingAttendees && attendees.length === 0 && (
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <PeopleIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
                  <Typography variant="h6" color="text.secondary">
                    No other students in the lounge yet
                  </Typography>
                  <Typography color="text.secondary" mt={1}>
                    Check back soon as more attendees join
                  </Typography>
                </Box>
              )}
              <Grid container spacing={3}>
                {!loadingAttendees && attendees.map((a) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={a.uid}>
                    <AttendeeCard
                      attendee={a}
                      currentUid={user?.uid ?? ""}
                      onMessage={handleMessageAttendee}
                    />
                  </Grid>
                ))}
              </Grid>
            </Container>
          </Box>
        )}
      </Box>
    </BaseLayout>
  )
}
