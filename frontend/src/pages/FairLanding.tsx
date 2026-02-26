import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
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
import PageHeader from "../components/PageHeader"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import { API_URL } from "../config"

function formatDate(ms: number | null): string {
  if (!ms) return "TBD"
  return new Date(ms).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })
}

export default function FairLanding() {
  const navigate = useNavigate()
  const { fair, isLive, loading, fairId } = useFair()
  const user = authUtils.getCurrentUser()
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [enrollmentLoading, setEnrollmentLoading] = useState(false)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState("")
  const [leaveSuccess, setLeaveSuccess] = useState(false)

  const isCompanyUser = user?.role === "companyOwner" || user?.role === "representative"

  useEffect(() => {
    if (!isCompanyUser || !fairId) return

    async function loadEnrollment() {
      setEnrollmentLoading(true)
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return
        const res = await fetch(`${API_URL}/api/fairs/my-enrollments`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load enrollments")

        const entry = (data.enrollments || []).find((e: { fairId: string }) => e.fairId === fairId)
        setIsEnrolled(!!entry)
      } catch (err) {
        console.error("Error loading enrollment:", err)
      } finally {
        setEnrollmentLoading(false)
      }
    }

    loadEnrollment()
  }, [fairId, isCompanyUser])

  const handleJoinFair = async () => {
    if (!inviteCode.trim()) return
    setJoining(true)
    setJoinError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to join fair")
      setJoinSuccess(true)
      setLeaveSuccess(false)
      setIsEnrolled(true)
      setJoinDialogOpen(false)
      // Navigate to the fair-scoped booth editor using the resolved fairId from the response
      if (data.boothId && user?.companyId) {
        navigate(`/fair/${data.fairId || fairId}/company/${user.companyId}/booth`)
      }
    } catch (err: any) {
      setJoinError(err.message)
    } finally {
      setJoining(false)
    }
  }

  const handleLeaveFair = async () => {
    if (!fairId) return
    setLeaving(true)
    setLeaveError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/leave`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to leave fair")

      setIsEnrolled(false)
      setLeaveSuccess(true)
      setJoinSuccess(false)
      setLeaveDialogOpen(false)
    } catch (err: any) {
      setLeaveError(err.message)
    } finally {
      setLeaving(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!fair) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
        <Alert severity="error">Career fair not found</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate("/fairs")}>Back to Fairs</Button>
      </Container>
    )
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <PageHeader />

      <Container maxWidth="md" sx={{ py: 6 }}>
        <Button variant="text" onClick={() => navigate("/fairs")} sx={{ mb: 3 }}>
          ← All Fairs
        </Button>

        <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="h3" fontWeight="bold">
            {fair.name}
          </Typography>
          <Chip
            label={isLive ? "Live Now" : "Not Live"}
            color={isLive ? "success" : "default"}
          />
        </Box>

        {fair.description && (
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {fair.description}
          </Typography>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", mb: 4 }}>
          <EventIcon />
          <Typography>
            {formatDate(fair.startTime)} – {formatDate(fair.endTime)}
          </Typography>
        </Box>

        {joinSuccess && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Successfully joined the fair! You can now set up your booth.
          </Alert>
        )}

        {leaveSuccess && (
          <Alert severity="success" sx={{ mb: 3 }}>
            You have left this fair.
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            size="large"
            endIcon={<ArrowForwardIcon />}
            onClick={() => navigate(`/fair/${fairId}/booths`)}
            disabled={!isLive}
          >
            {isLive ? "Browse Booths" : "Fair Not Live Yet"}
          </Button>

          {isCompanyUser && (
            <Button
              variant="outlined"
              size="large"
              color={isEnrolled ? "error" : "primary"}
              onClick={() => (isEnrolled ? setLeaveDialogOpen(true) : setJoinDialogOpen(true))}
              disabled={enrollmentLoading}
            >
              {isEnrolled ? "Leave Fair" : "Join This Fair"}
            </Button>
          )}
        </Box>
      </Container>

      <Dialog open={joinDialogOpen} onClose={() => setJoinDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Join Career Fair</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Enter the fair invite code provided by the event organizer.
          </Typography>
          <TextField
            label="Fair Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 8 } }}
          />
          {joinError && <Alert severity="error" sx={{ mt: 2 }}>{joinError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleJoinFair} disabled={joining || !inviteCode.trim()}>
            {joining ? "Joining..." : "Join Fair"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={leaveDialogOpen} onClose={() => setLeaveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Leave Career Fair?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Your company will be unenrolled from this fair. Booth and job listings for this fair will be removed.
          </Typography>
          {leaveError && <Alert severity="error" sx={{ mt: 2 }}>{leaveError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleLeaveFair} disabled={leaving}>
            {leaving ? "Leaving..." : "Leave Fair"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
