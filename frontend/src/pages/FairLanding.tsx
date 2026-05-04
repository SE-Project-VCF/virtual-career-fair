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
  FormGroup,
  Checkbox,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Stack,
  Divider,
} from "@mui/material"
import { alpha } from "@mui/material/styles"
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

const ACCENT_GREEN = "#388560"
const ACCENT_BURGUNDY = "#b03a6c"

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
  const [companyBooths, setCompanyBooths] = useState<{ id: string; boothName?: string }[]>([])
  const [selectedBoothIds, setSelectedBoothIds] = useState<string[]>([])
  const [loadingBooths, setLoadingBooths] = useState(false)

  const isCompanyUser = user?.role === "companyOwner" || user?.role === "representative"

  const toggleBoothSelection = (boothId: string) => {
    setSelectedBoothIds((prev) =>
      prev.includes(boothId)
        ? prev.filter((id) => id !== boothId)
        : [...prev, boothId]
    )
  }

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
    if (!joinDialogOpen || !user?.companyId) return
    const fetchBooths = async () => {
      setLoadingBooths(true)
      try {
        const firebaseUser = await waitForFirebaseUser()
        const token = await firebaseUser?.getIdToken()
        const res = await fetch(`${API_URL}/api/booths?companyId=${user.companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const booths = data.booths || []
          setCompanyBooths(booths)
          setSelectedBoothIds(booths.map((b: { id: string }) => b.id))
        }
      } catch (err) {
        console.error("Error fetching booths:", err)
      } finally {
        setLoadingBooths(false)
      }
    }
    fetchBooths()
  }, [joinDialogOpen, user?.companyId])

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
        body: JSON.stringify({
          ...body,
          ...(selectedBoothIds.length > 0 && { boothIds: selectedBoothIds }),
        }),
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
      if (navCompanyId || user?.companyId) {
        navigate(`/company/${navCompanyId || user?.companyId}`)
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
        <Stack spacing={3}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/fairs")}>
              Back to Fairs
            </Button>
            {user?.role === "student" && isLive && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ForumIcon />}
                onClick={() => navigate(`/fair/${fairId}/lounge`)}
                sx={{
                  borderColor: ACCENT_GREEN,
                  color: ACCENT_GREEN,
                  "&:hover": {
                    borderColor: ACCENT_GREEN,
                    bgcolor: alpha(ACCENT_GREEN, 0.06),
                  },
                }}
              >
                Networking Lounge
              </Button>
            )}
          </Stack>

          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              background: `linear-gradient(135deg, ${alpha(ACCENT_GREEN, 0.08)} 0%, ${alpha(ACCENT_BURGUNDY, 0.06)} 100%)`,
            }}
          >
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1.5}>
                <Typography variant="h3" component="h1" fontWeight="bold">
                  {fair.name}
                </Typography>
                <Chip
                  label={isLive ? "Live Now" : "Not Live"}
                  color={isLive ? "success" : "default"}
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              </Stack>

              {fair.description && (
                <Typography variant="body1" color="text.secondary">
                  {fair.description}
                </Typography>
              )}

              <Stack direction="row" flexWrap="wrap" alignItems="center" gap={2} useFlexGap>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "text.secondary" }}>
                  <EventIcon fontSize="small" sx={{ color: ACCENT_GREEN }} />
                  <Typography variant="body2">
                    {formatDate(fair.startTime)} – {formatDate(fair.endTime)}
                  </Typography>
                </Stack>
                {(fair.venueCity || fair.venueState || fair.venueZip) && (
                  <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ color: "text.secondary" }}>
                    <LocationOnIcon fontSize="small" sx={{ mt: 0.15, color: ACCENT_BURGUNDY }} />
                    <Typography variant="body2" fontWeight={600}>
                      {[fair.venueCity, fair.venueState].filter(Boolean).join(", ")}
                      {fair.venueZip ? ` ${fair.venueZip}` : ""}
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Paper>

          {joinSuccess && (
            <Alert severity="success">
              Successfully joined the fair! You can now set up your booth.
            </Alert>
          )}

          {leaveSuccess && (
            <Alert severity="success">
              You have left this fair.
            </Alert>
          )}

          {isCompanyUser && (
            <>
              <Divider sx={{ borderColor: "divider" }} />
              <Stack direction="row" flexWrap="wrap" gap={2}>
                <Button
                  variant="outlined"
                  size="large"
                  color={isEnrolled ? "error" : "primary"}
                  onClick={() => (isEnrolled ? setLeaveDialogOpen(true) : setJoinDialogOpen(true))}
                  disabled={enrollmentLoading}
                  sx={isEnrolled ? undefined : { borderColor: ACCENT_GREEN, color: ACCENT_GREEN, "&:hover": { borderColor: ACCENT_GREEN, bgcolor: alpha(ACCENT_GREEN, 0.06) } }}
                >
                  {isEnrolled ? "Leave Fair" : "Join This Fair"}
                </Button>
              </Stack>
            </>
          )}

          <FairBoothGridSection sectionTitle="Booths" />
        </Stack>
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
            slotProps={{ htmlInput: { maxLength: 20 } }}
          />
          {joinError && <Alert severity="error" sx={{ mt: 2 }}>{joinError}</Alert>}
          {companyBooths.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Select booths to bring to this fair:
              </Typography>
              <FormGroup>
                {companyBooths.map((booth) => (
                  <FormControlLabel
                    key={booth.id}
                    control={
                      <Checkbox
                        checked={selectedBoothIds.includes(booth.id)}
                        onChange={() => toggleBoothSelection(booth.id)}
                      />
                    }
                    label={booth.boothName || "Untitled Booth"}
                  />
                ))}
              </FormGroup>
            </Box>
          )}
          {companyBooths.length === 0 && !loadingBooths && joinDialogOpen && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No booths found. Create a booth on your company dashboard first.
            </Typography>
          )}
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
