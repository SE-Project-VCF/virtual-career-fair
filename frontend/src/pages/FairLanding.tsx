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
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material"
import EventIcon from "@mui/icons-material/Event"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ForumIcon from "@mui/icons-material/Forum"
import BaseLayout from "../components/BaseLayout"
import FairBoothGridSection from "../components/FairBoothGridSection"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { waitForFirebaseUser } from "../firebase"
import { API_URL } from "../config"
import { fetchOwnedCompaniesForUser, type OwnedCompanySummary } from "../utils/ownedCompanies"

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
  /** Which company is enrolled in the current fair (for owners with multiple companies). */
  const [enrolledCompanyId, setEnrolledCompanyId] = useState<string | null>(null)
  const [ownedCompanies, setOwnedCompanies] = useState<OwnedCompanySummary[]>([])
  const [joinCompanyId, setJoinCompanyId] = useState("")
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
        const firebaseUser = await waitForFirebaseUser()
        if (!firebaseUser) return
        const token = await firebaseUser.getIdToken()
        if (!token) return
        const res = await fetch(`${API_URL}/api/fairs/my-enrollments`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load enrollments")

        const entry = (data.enrollments || []).find((e: { fairId: string }) => e.fairId === fairId) as
          | { fairId: string; companyId?: string }
          | undefined
        setIsEnrolled(!!entry)
        setEnrolledCompanyId(entry?.companyId ?? null)
      } catch (err) {
        console.error("Error loading enrollment:", err)
      } finally {
        setEnrollmentLoading(false)
      }
    }

    loadEnrollment()
  }, [fairId, isCompanyUser])

  useEffect(() => {
    if (!joinDialogOpen || user?.role !== "companyOwner" || !user?.uid) return
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchOwnedCompaniesForUser(user.uid)
        if (cancelled) return
        setOwnedCompanies(list)
        if (list.length === 1) setJoinCompanyId(list[0].id)
        else setJoinCompanyId("")
      } catch {
        if (!cancelled) setOwnedCompanies([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [joinDialogOpen, user?.role, user?.uid])

  const handleJoinFair = async () => {
    if (!inviteCode.trim()) return
    if (user?.role === "companyOwner" && ownedCompanies.length > 1 && !joinCompanyId) {
      setJoinError("Select which company is joining this fair.")
      return
    }
    setJoining(true)
    setJoinError("")
    try {
      const firebaseUser = await waitForFirebaseUser()
      if (!firebaseUser) throw new Error("Not signed in.")
      const token = await firebaseUser.getIdToken()
      const body: { inviteCode: string; companyId?: string } = {
        inviteCode: inviteCode.trim().toUpperCase(),
      }
      if (user?.role === "companyOwner") {
        if (ownedCompanies.length > 1) body.companyId = joinCompanyId
        else if (ownedCompanies.length === 1) body.companyId = ownedCompanies[0].id
      }
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to join fair")
      const navCompanyId =
        user?.role === "companyOwner"
          ? body.companyId || ownedCompanies[0]?.id || user?.companyId
          : user?.companyId || undefined
      setJoinSuccess(true)
      setLeaveSuccess(false)
      setIsEnrolled(true)
      setEnrolledCompanyId(navCompanyId ?? null)
      setJoinDialogOpen(false)
      if (data.boothId && navCompanyId) {
        navigate(`/fair/${data.fairId || fairId}/company/${navCompanyId}/booth`)
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
      const firebaseUser = await waitForFirebaseUser()
      if (!firebaseUser) throw new Error("Not signed in.")
      const token = await firebaseUser.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/leave`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(enrolledCompanyId ? { companyId: enrolledCompanyId } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to leave fair")

      setIsEnrolled(false)
      setEnrolledCompanyId(null)
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
    <BaseLayout pageTitle={fair.name}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/fairs")}>
            Back to Fairs
          </Button>
          {user?.role === "student" && isLive && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ForumIcon />}
              onClick={() => navigate(`/fair/${fairId}/lounge`)}
            >
              Networking Lounge
            </Button>
          )}
        </Box>

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

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", mb: 2 }}>
          <EventIcon />
          <Typography>
            {formatDate(fair.startTime)} – {formatDate(fair.endTime)}
          </Typography>
        </Box>

        {(fair.venueCity || fair.venueState || fair.venueZip) && (
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, color: "text.secondary", mb: 4 }}>
            <LocationOnIcon sx={{ mt: 0.25 }} />
            <Typography fontWeight={600}>
              {[fair.venueCity, fair.venueState].filter(Boolean).join(", ")}
              {fair.venueZip ? ` ${fair.venueZip}` : ""}
            </Typography>
          </Box>
        )}

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

        {isCompanyUser && (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 0 }}>
            <Button
              variant="outlined"
              size="large"
              color={isEnrolled ? "error" : "primary"}
              onClick={() => (isEnrolled ? setLeaveDialogOpen(true) : setJoinDialogOpen(true))}
              disabled={enrollmentLoading}
            >
              {isEnrolled ? "Leave Fair" : "Join This Fair"}
            </Button>
          </Box>
        )}

        <FairBoothGridSection sectionTitle="Booths" />
      </Container>

      <Dialog
        open={joinDialogOpen}
        onClose={() => {
          setJoinDialogOpen(false)
          setJoinCompanyId("")
          setOwnedCompanies([])
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Join Career Fair</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Enter the fair invite code provided by the event organizer.
          </Typography>
          {user?.role === "companyOwner" && ownedCompanies.length > 1 && (
            <FormControl sx={{ mb: 2 }} component="fieldset" variant="standard" fullWidth>
              <FormLabel component="legend">Company enrolling in this fair</FormLabel>
              <RadioGroup
                value={joinCompanyId}
                onChange={(e) => setJoinCompanyId(e.target.value)}
              >
                {ownedCompanies.map((c) => (
                  <FormControlLabel key={c.id} value={c.id} control={<Radio />} label={c.companyName} />
                ))}
              </RadioGroup>
            </FormControl>
          )}
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
          <Button
            onClick={() => {
              setJoinDialogOpen(false)
              setJoinCompanyId("")
              setOwnedCompanies([])
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleJoinFair}
            disabled={
              joining ||
              !inviteCode.trim() ||
              (user?.role === "companyOwner" && ownedCompanies.length > 1 && !joinCompanyId)
            }
          >
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
    </BaseLayout>
  )
}
