import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material"
import EventIcon from "@mui/icons-material/Event"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import ProfileMenu from "./ProfileMenu"
import NotificationBell from "../components/NotificationBell"
import { API_URL } from "../config"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"

interface Fair {
  id: string
  name: string
  description: string | null
  isLive: boolean
  startTime: number | null
  endTime: number | null
}

function getFairStatus(fair: Fair): { label: string; color: "success" | "primary" | "warning" | "default" } {
  const now = Date.now()
  if (fair.isLive) return { label: "Live Now", color: "success" }
  if (fair.startTime && now < fair.startTime) return { label: "Upcoming", color: "primary" }
  if (fair.endTime && now > fair.endTime) return { label: "Ended", color: "default" }
  return { label: "Scheduled", color: "warning" }
}

function formatDate(ms: number | null): string {
  if (!ms) return "TBD"
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function FairList() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const isCompanyUser = user?.role === "companyOwner" || user?.role === "representative"

  const [fairs, setFairs] = useState<Fair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // enrolledMap: fairId → boothId (null if enrolled but no booth yet)
  const [enrolledMap, setEnrolledMap] = useState<Record<string, string | null>>({})

  // Join dialog state
  const [joinDialogFairId, setJoinDialogFairId] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")

  useEffect(() => {
    async function loadFairs() {
      try {
        const res = await fetch(`${API_URL}/api/fairs`)
        if (!res.ok) throw new Error("Failed to load fairs")
        const data = await res.json()
        setFairs(data.fairs || [])
      } catch (err) {
        console.error(err)
        setError("Failed to load career fairs")
      } finally {
        setLoading(false)
      }
    }
    loadFairs()
  }, [])

  // Load enrollment status for company users
  useEffect(() => {
    if (!isCompanyUser) return
    async function loadEnrollments() {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return
        const res = await fetch(`${API_URL}/api/fairs/my-enrollments`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const map: Record<string, string | null> = {}
        for (const e of data.enrollments || []) {
          map[e.fairId] = e.boothId
        }
        setEnrolledMap(map)
      } catch (err) {
        console.error("Error loading enrollments:", err)
      }
    }
    loadEnrollments()
  }, [isCompanyUser])

  const handleOpenJoinDialog = (fairId: string) => {
    setJoinDialogFairId(fairId)
    setInviteCode("")
    setJoinError("")
  }

  const handleCloseJoinDialog = () => {
    setJoinDialogFairId(null)
    setInviteCode("")
    setJoinError("")
  }

  const handleJoinFair = async () => {
    if (!inviteCode.trim() || !joinDialogFairId) return
    setJoining(true)
    setJoinError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${joinDialogFairId}/enroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to join fair")

      // Update local enrollment state
      setEnrolledMap((prev) => ({ ...prev, [joinDialogFairId]: data.boothId || null }))
      handleCloseJoinDialog()

      // Navigate directly to the fair-scoped booth editor
      if (data.boothId && user?.companyId) {
        navigate(`/fair/${data.fairId || joinDialogFairId}/company/${user.companyId}/booth`)
      }
    } catch (err: any) {
      setJoinError(err.message)
    } finally {
      setJoining(false)
    }
  }

  const joinDialogFair = fairs.find((f) => f.id === joinDialogFairId)

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          bgcolor: "primary.main",
          color: "white",
          py: 2,
          px: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" fontWeight="bold">
          Virtual Career Fair
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <NotificationBell />
          <ProfileMenu />
        </Box>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Career Fairs
          </Typography>
          <Typography color="text.secondary">
            Browse and join available virtual career fairs
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {!loading && !error && fairs.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <EventIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No career fairs available
            </Typography>
            <Typography color="text.secondary" mt={1}>
              Check back soon for upcoming events
            </Typography>
          </Box>
        )}

        <Grid container spacing={3}>
          {fairs.map((fair) => {
            const status = getFairStatus(fair)
            const isEnded = fair.endTime !== null && Date.now() > fair.endTime
            const isEnrolled = fair.id in enrolledMap
            const boothId = enrolledMap[fair.id]

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={fair.id}>
                <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1, gap: 1 }}>
                      <Typography variant="h6" fontWeight="bold">
                        {fair.name}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                        {isEnrolled && (
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Enrolled"
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                        )}
                        <Chip label={status.label} color={status.color} size="small" />
                      </Box>
                    </Box>

                    {fair.description && (
                      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                        {fair.description}
                      </Typography>
                    )}

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
                      <EventIcon fontSize="small" />
                      <Typography variant="body2">
                        {fair.startTime ? formatDate(fair.startTime) : "Date TBD"}
                        {fair.endTime ? ` – ${formatDate(fair.endTime)}` : ""}
                      </Typography>
                    </Box>
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0, flexWrap: "wrap", gap: 1 }}>
                    <Button
                      variant={isEnrolled ? "outlined" : "contained"}
                      endIcon={<ArrowForwardIcon />}
                      onClick={() => navigate(`/fair/${fair.id}`)}
                      fullWidth={!isCompanyUser || isEnded}
                      sx={{ flexGrow: 1 }}
                    >
                      View Fair
                    </Button>

                    {isCompanyUser && !isEnded && (
                      isEnrolled ? (
                        <Button
                          variant="contained"
                          color="success"
                          onClick={() =>
                            navigate(
                              boothId && user?.companyId
                                ? `/fair/${fair.id}/company/${user.companyId}/booth`
                                : `/fair/${fair.id}`
                            )
                          }
                          sx={{ flexGrow: 1 }}
                        >
                          Edit Booth
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          onClick={() => handleOpenJoinDialog(fair.id)}
                          sx={{ flexGrow: 1 }}
                        >
                          Join Fair
                        </Button>
                      )
                    )}
                  </CardActions>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      </Container>

      {/* Join Fair dialog */}
      <Dialog
        open={joinDialogFairId !== null}
        onClose={handleCloseJoinDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Join {joinDialogFair?.name ?? "Fair"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the invite code provided by the event organizer.
          </Typography>
          <TextField
            label="Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 8))}
            fullWidth
            autoFocus
            slotProps={{ htmlInput: { maxLength: 8, style: { textTransform: "uppercase", letterSpacing: 2 } } }}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoinFair() }}
          />
          {joinError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {joinError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseJoinDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleJoinFair}
            disabled={joining || !inviteCode.trim()}
          >
            {joining ? "Joining..." : "Join Fair"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
