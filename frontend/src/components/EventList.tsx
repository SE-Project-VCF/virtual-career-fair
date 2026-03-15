import { useState, useEffect, useCallback } from "react"
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from "@mui/material"
import EventIcon from "@mui/icons-material/Event"
import AccessTimeIcon from "@mui/icons-material/AccessTime"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import { collection, getDocs, Timestamp, query, where, doc, getDoc } from "firebase/firestore"
import { db, auth } from "../firebase"
import { authUtils } from "../utils/auth"
import { API_URL } from "../config"

interface FairSchedule {
  id: string
  name: string | null
  startTime: number | null
  endTime: number | null
  description: string | null
  enrolled: boolean
}

export default function EventList() {
  const [schedules, setSchedules] = useState<FairSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const user = authUtils.getCurrentUser()
  const isCompanyUser = user?.role === "companyOwner" || user?.role === "representative"

  // Join fair dialog state
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joinSuccess, setJoinSuccess] = useState("")
  const [joining, setJoining] = useState(false)

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true)
      setError("")

      // Look up the user's boothId if they are a company owner or rep
      let userBoothId: string | null = null
      if (isCompanyUser && user?.uid) {
        // Check as owner first
        const ownerSnapshot = await getDocs(
          query(collection(db, "companies"), where("ownerId", "==", user.uid))
        )
        if (!ownerSnapshot.empty) {
          userBoothId = ownerSnapshot.docs[0].data().boothId || null
        }

        // Fall back to representative
        if (!userBoothId && user.companyId) {
          const companyDoc = await getDoc(doc(db, "companies", user.companyId))
          if (companyDoc.exists()) {
            userBoothId = companyDoc.data().boothId || null
          }
        }
      }

      const schedulesSnapshot = await getDocs(collection(db, "fairSchedules"))
      const now = Date.now()

      const schedulesList: FairSchedule[] = []
      schedulesSnapshot.forEach((docSnap) => {
        const data = docSnap.data()
        const startTime = data.startTime instanceof Timestamp
          ? data.startTime.toMillis()
          : data.startTime
        const endTime = data.endTime instanceof Timestamp
          ? data.endTime.toMillis()
          : data.endTime

        // Only include events that haven't ended yet
        if (endTime && endTime > now) {
          const registeredBoothIds: string[] = data.registeredBoothIds || []
          const enrolled = userBoothId ? registeredBoothIds.includes(userBoothId) : false

          schedulesList.push({
            id: docSnap.id,
            name: data.name || null,
            startTime,
            endTime,
            description: data.description || null,
            enrolled,
          })
        }
      })

      // Sort: enrolled first, then by start time
      schedulesList.sort((a, b) => {
        // Enrolled fairs come first
        if (a.enrolled && !b.enrolled) return -1
        if (!a.enrolled && b.enrolled) return 1
        // Then sort by start time
        if (!a.startTime && !b.startTime) return 0
        if (!a.startTime) return 1
        if (!b.startTime) return -1
        return a.startTime - b.startTime
      })

      setSchedules(schedulesList)
    } catch (err) {
      console.error("Error fetching schedules:", err)
      setError("Failed to load events")
    } finally {
      setLoading(false)
    }
  }, [isCompanyUser, user?.uid, user?.companyId])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  const handleJoinFair = async () => {
    setJoinError("")
    setJoinSuccess("")
    if (!joinCode.trim()) {
      setJoinError("Please enter an invite code")
      return
    }
    if (!auth.currentUser) {
      setJoinError("You must be logged in to join a fair")
      return
    }
    setJoining(true)
    try {
      const token = await auth.currentUser.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setJoinError(data.error || "Failed to join fair")
      } else {
        setJoinSuccess(`Joined "${data.fairName || "fair"}" successfully!`)
        setJoinCode("")
        // Refresh the list to show updated enrollment status
        fetchSchedules()
        setTimeout(() => {
          setJoinDialogOpen(false)
          setJoinSuccess("")
        }, 1500)
      }
    } catch {
      setJoinError("Network error. Please try again.")
    } finally {
      setJoining(false)
    }
  }

  const formatDateTime = (timestamp: number | null) => {
    if (!timestamp) return "Not set"
    const date = new Date(timestamp)
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getScheduleStatus = (schedule: FairSchedule) => {
    if (!schedule.startTime || !schedule.endTime) {
      return null
    }

    const now = Date.now()
    if (now < schedule.startTime) {
      return { type: "upcoming", label: "Upcoming", color: "primary" as const }
    } else if (now >= schedule.startTime && now <= schedule.endTime) {
      return { type: "active", label: "Live Now", color: "success" as const }
    } else {
      return { type: "ended", label: "Ended", color: "default" as const }
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Card sx={{ border: "1px solid rgba(176, 58, 108, 0.3)", mb: 3 }}>
        <CardContent>
          <Typography color="error">{error}</Typography>
        </CardContent>
      </Card>
    )
  }

  if (schedules.length === 0) {
    return null // Don't show anything if no schedules
  }

  return (
    <>
      <Card sx={{ border: "1px solid rgba(176, 58, 108, 0.3)", mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <EventIcon sx={{ fontSize: 32, color: "#b03a6c" }} />
              <Typography variant="h5" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                Upcoming Career Fairs
              </Typography>
            </Box>
            {isCompanyUser && (
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setJoinCode("")
                  setJoinError("")
                  setJoinSuccess("")
                  setJoinDialogOpen(true)
                }}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  textTransform: "none",
                  fontWeight: 600,
                  "&:hover": {
                    background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                  },
                }}
              >
                Join a Fair
              </Button>
            )}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {schedules.map((schedule) => {
              const status = getScheduleStatus(schedule)
              return (
                <Box
                  key={schedule.id}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: schedule.enrolled
                      ? "1px solid rgba(56, 133, 96, 0.4)"
                      : "1px solid rgba(0,0,0,0.1)",
                    bgcolor: schedule.enrolled
                      ? "rgba(56, 133, 96, 0.05)"
                      : status?.type === "active"
                        ? "rgba(56, 133, 96, 0.03)"
                        : "transparent",
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                      {schedule.name || "Career Fair"}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      {schedule.enrolled && (
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Enrolled"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      )}
                      {status && (
                        <Chip
                          label={status.label}
                          size="small"
                          color={status.color}
                        />
                      )}
                    </Box>
                  </Box>

                  {schedule.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {schedule.description}
                    </Typography>
                  )}

                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <AccessTimeIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                      <Typography variant="body2" color="text.secondary">
                        <strong>Start:</strong> {formatDateTime(schedule.startTime)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <AccessTimeIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                      <Typography variant="body2" color="text.secondary">
                        <strong>End:</strong> {formatDateTime(schedule.endTime)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </CardContent>
      </Card>

      {/* Join Fair Dialog */}
      <Dialog
        open={joinDialogOpen}
        onClose={() => {
          if (!joining) {
            setJoinDialogOpen(false)
            setJoinCode("")
            setJoinError("")
            setJoinSuccess("")
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Join a Career Fair</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the invite code provided by the fair organizer to register your booth for this career fair.
          </Typography>
          {joinError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {joinError}
            </Alert>
          )}
          {joinSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {joinSuccess}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Fair Invite Code"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase())
              setJoinError("")
            }}
            placeholder="Enter invite code"
            disabled={joining || !!joinSuccess}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setJoinDialogOpen(false)
              setJoinCode("")
              setJoinError("")
              setJoinSuccess("")
            }}
            disabled={joining}
          >
            Cancel
          </Button>
          <Button
            onClick={handleJoinFair}
            variant="contained"
            disabled={joining || !joinCode.trim() || !!joinSuccess}
            sx={{
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            {joining ? "Joining..." : "Join Fair"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
