"use client"

import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  TextField,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
} from "@mui/material"
import { authUtils } from "../utils/auth"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import EventIcon from "@mui/icons-material/Event"
import ScheduleIcon from "@mui/icons-material/Schedule"
import EditIcon from "@mui/icons-material/Edit"
import DeleteIcon from "@mui/icons-material/Delete"
import AddIcon from "@mui/icons-material/Add"
import ProfileMenu from "./ProfileMenu"

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [schedules, setSchedules] = useState<any[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    description: "",
    startTime: "",
    endTime: "",
  })
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleName, setScheduleName] = useState<string | null>(null)
  const [scheduleDescription, setScheduleDescription] = useState<string | null>(null)

  // Helper: Convert local datetime-local string to UTC ISO string
  const localToUTC = (localDateTime: string): string => {
    if (!localDateTime) return ""
    // datetime-local format is "YYYY-MM-DDTHH:mm" (local time, no timezone)
    // Create a Date object treating it as local time, then convert to UTC ISO string
    const localDate = new Date(localDateTime)
    // Check if date is valid
    if (isNaN(localDate.getTime())) {
      throw new Error(`Invalid date: ${localDateTime}`)
    }
    return localDate.toISOString()
  }

  // Helper: Convert UTC timestamp to local datetime-local string
  const utcToLocal = (utcTimestamp: number): string => {
    const date = new Date(utcTimestamp)
    // Get local date components
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const fetchFairStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const response = await fetch("http://localhost:5000/api/fair-status")
      if (response.ok) {
        const data = await response.json()
        setIsLive(data.isLive || false)
        setScheduleName(data.scheduleName || null)
        setScheduleDescription(data.scheduleDescription || null)
      } else {
        setError("Failed to fetch fair status")
      }
    } catch (err) {
      console.error("Error fetching fair status:", err)
      setError("Failed to fetch fair status")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSchedules = useCallback(async () => {
    if (!user?.uid) return

    try {
      setLoadingSchedules(true)
      const response = await fetch(`http://localhost:5000/api/fair-schedules?userId=${user.uid}`)
      if (response.ok) {
        const data = await response.json()
        setSchedules(data.schedules || [])
      } else {
        console.error("Failed to fetch schedules")
      }
    } catch (err) {
      console.error("Error fetching schedules:", err)
    } finally {
      setLoadingSchedules(false)
    }
  }, [user?.uid])

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }

    if (user?.role !== "administrator") {
      navigate("/dashboard")
      return
    }

    fetchFairStatus()
    fetchSchedules()
  }, [navigate, user?.role, user?.uid, fetchFairStatus, fetchSchedules])

  const handleToggleLiveStatus = async () => {
    if (!user?.uid) {
      setError("User not found")
      return
    }

    try {
      setToggling(true)
      setError("")
      setSuccess("")

      const response = await fetch("http://localhost:5000/api/toggle-fair-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.uid }),
      })

      if (response.ok) {
        const data = await response.json()
        setIsLive(data.isLive)
        setSuccess(
          data.isLive
            ? "Career fair is now LIVE! All users can see all booths."
            : "Career fair is now offline. Only company owners and representatives can see their own booths."
        )
        setTimeout(() => setSuccess(""), 5000)
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Failed to toggle fair status")
      }
    } catch (err) {
      console.error("Error toggling fair status:", err)
      setError("Failed to toggle fair status")
    } finally {
      setToggling(false)
    }
  }

  const handleOpenScheduleDialog = (schedule?: any) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setScheduleForm({
        name: schedule.name || "",
        description: schedule.description || "",
        startTime: schedule.startTime ? utcToLocal(schedule.startTime) : "",
        endTime: schedule.endTime ? utcToLocal(schedule.endTime) : "",
      })
    } else {
      setEditingSchedule(null)
      setScheduleForm({
        name: "",
        description: "",
        startTime: "",
        endTime: "",
      })
    }
    setScheduleDialogOpen(true)
  }

  const handleCloseScheduleDialog = () => {
    setScheduleDialogOpen(false)
    setEditingSchedule(null)
    setScheduleForm({
      name: "",
      description: "",
      startTime: "",
      endTime: "",
    })
  }

  const handleSaveSchedule = async () => {
    if (!user?.uid) {
      setError("User not found")
      return
    }

    if (!scheduleForm.startTime || !scheduleForm.endTime) {
      setError("Please provide both start and end times")
      return
    }

    try {
      setSavingSchedule(true)
      setError("")
      setSuccess("")

      // Convert local datetime to UTC before sending
      const startTimeUTC = localToUTC(scheduleForm.startTime)
      const endTimeUTC = localToUTC(scheduleForm.endTime)

      const url = editingSchedule
        ? `http://localhost:5000/api/fair-schedules/${editingSchedule.id}`
        : "http://localhost:5000/api/fair-schedules"
      const method = editingSchedule ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          name: scheduleForm.name || null,
          description: scheduleForm.description || null,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
        }),
      })

      if (response.ok) {
        setSuccess(
          editingSchedule
            ? "Career fair schedule updated successfully!"
            : "Career fair scheduled successfully!"
        )
        setTimeout(() => setSuccess(""), 5000)
        handleCloseScheduleDialog()
        fetchSchedules()
        fetchFairStatus()
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Failed to save career fair schedule")
      }
    } catch (err) {
      console.error("Error saving schedule:", err)
      setError("Failed to save career fair schedule")
    } finally {
      setSavingSchedule(false)
    }
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!user?.uid) {
      setError("User not found")
      return
    }

    if (!window.confirm("Are you sure you want to delete this career fair schedule?")) {
      return
    }

    try {
      setError("")
      const response = await fetch(
        `http://localhost:5000/api/fair-schedules/${scheduleId}?userId=${user.uid}`,
        {
          method: "DELETE",
        }
      )

      if (response.ok) {
        setSuccess("Career fair schedule deleted successfully!")
        setTimeout(() => setSuccess(""), 5000)
        fetchSchedules()
        fetchFairStatus()
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Failed to delete career fair schedule")
      }
    } catch (err) {
      console.error("Error deleting schedule:", err)
      setError("Failed to delete career fair schedule")
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

  const getScheduleStatus = (schedule: any) => {
    if (!schedule.startTime || !schedule.endTime) {
      return null
    }

    const now = Date.now()
    if (now < schedule.startTime) {
      return { type: "upcoming", label: "Upcoming" }
    } else if (now >= schedule.startTime && now <= schedule.endTime) {
      return { type: "active", label: "Active" }
    } else {
      return { type: "ended", label: "Ended" }
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 3,
          px: 4,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <AdminPanelSettingsIcon sx={{ fontSize: 32, color: "white" }} />
              <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
                Administrator Dashboard
              </Typography>
            </Box>
            <ProfileMenu />
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
            {success}
          </Alert>
        )}

        {/* Fair Name and Description Banner - Show when active */}
        {isLive && (scheduleName || scheduleDescription) && (
          <Alert 
            severity="success" 
            sx={{ 
              mb: 3, 
              borderRadius: 2,
              bgcolor: "rgba(56, 133, 96, 0.1)",
              border: "1px solid rgba(56, 133, 96, 0.3)",
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              {scheduleName || "Career Fair is LIVE"}
            </Typography>
            {scheduleDescription && (
              <Typography variant="body1" sx={{ mb: 1 }}>
                {scheduleDescription}
              </Typography>
            )}
            <Typography variant="body2">
              The career fair is currently active and visible to all users.
            </Typography>
          </Alert>
        )}

        <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", mb: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <EventIcon sx={{ fontSize: 40, color: isLive ? "#388560" : "#ccc" }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                  Career Fair Status
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Control when the career fair is live and visible to all users
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                p: 3,
                bgcolor: isLive ? "rgba(56, 133, 96, 0.05)" : "rgba(0, 0, 0, 0.02)",
                borderRadius: 2,
                border: `1px solid ${isLive ? "rgba(56, 133, 96, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
                mb: 3,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={isLive}
                    onChange={handleToggleLiveStatus}
                    disabled={toggling}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": {
                        color: "#388560",
                      },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                        backgroundColor: "#388560",
                      },
                    }}
                  />
                }
                label={
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: isLive ? "#388560" : "#666" }}>
                      {isLive ? "Career Fair is LIVE" : "Career Fair is OFFLINE"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {isLive
                        ? "All users can see all booths at the career fair."
                        : "Only company owners and representatives can see and edit their own booths."}
                    </Typography>
                  </Box>
                }
              />
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <strong>When LIVE:</strong> All users (students, company owners, representatives) can browse and view all booths.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>When OFFLINE:</strong> Only company owners and representatives can see and edit their own booths. Students cannot see any booths.
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ border: "1px solid rgba(176, 58, 108, 0.3)", mb: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <ScheduleIcon sx={{ fontSize: 40, color: "#b03a6c" }} />
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                    Scheduled Career Fairs
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Schedule when career fairs will automatically go live
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenScheduleDialog()}
                sx={{
                  background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                  },
                }}
              >
                Schedule Career Fair
              </Button>
            </Box>

            {loadingSchedules ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress />
              </Box>
            ) : schedules.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                  No career fairs scheduled yet. Schedule your first career fair to get started.
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenScheduleDialog()}
                  sx={{
                    borderColor: "#b03a6c",
                    color: "#b03a6c",
                    "&:hover": {
                      borderColor: "#8a2d54",
                      bgcolor: "rgba(176, 58, 108, 0.05)",
                    },
                  }}
                >
                  Schedule Career Fair
                </Button>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Start Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>End Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schedules.map((schedule) => {
                      const status = getScheduleStatus(schedule)
                      return (
                        <TableRow key={schedule.id}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {schedule.name || "Unnamed Career Fair"}
                            </Typography>
                            {schedule.description && (
                              <Typography variant="caption" color="text.secondary">
                                {schedule.description}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>{formatDateTime(schedule.startTime)}</TableCell>
                          <TableCell>{formatDateTime(schedule.endTime)}</TableCell>
                          <TableCell>
                            {status ? (
                              <Chip
                                label={status.label}
                                size="small"
                                color={
                                  status.type === "active"
                                    ? "success"
                                    : status.type === "upcoming"
                                    ? "primary"
                                    : "default"
                                }
                              />
                            ) : (
                              <Chip label="No Status" size="small" color="default" />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenScheduleDialog(schedule)}
                              sx={{ color: "#b03a6c" }}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteSchedule(schedule.id)}
                              sx={{ color: "#d32f2f" }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Note:</strong> The career fair will be live when ANY scheduled career fair is active. Manual toggle takes precedence over scheduled fairs.
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Schedule Dialog */}
        <Dialog open={scheduleDialogOpen} onClose={handleCloseScheduleDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            {editingSchedule ? "Edit Career Fair Schedule" : "Schedule Career Fair"}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 2 }}>
              <TextField
                fullWidth
                label="Career Fair Name (Optional)"
                value={scheduleForm.name}
                onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                sx={{ mb: 3 }}
                placeholder="e.g., Spring Career Fair 2024"
              />
              <TextField
                fullWidth
                label="Description (Optional)"
                value={scheduleForm.description}
                onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })}
                sx={{ mb: 3 }}
                multiline
                rows={2}
                placeholder="Additional details about this career fair"
              />
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Start Time"
                    type="datetime-local"
                    value={scheduleForm.startTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                    InputLabelProps={{
                      shrink: true,
                    }}
                    inputProps={{
                      min: new Date().toISOString().slice(0, 16),
                    }}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="End Time"
                    type="datetime-local"
                    value={scheduleForm.endTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                    InputLabelProps={{
                      shrink: true,
                    }}
                    inputProps={{
                      min: scheduleForm.startTime || new Date().toISOString().slice(0, 16),
                    }}
                    required
                  />
                </Grid>
              </Grid>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseScheduleDialog}>Cancel</Button>
            <Button
              onClick={handleSaveSchedule}
              variant="contained"
              disabled={savingSchedule || !scheduleForm.startTime || !scheduleForm.endTime}
              sx={{
                background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                },
              }}
            >
              {savingSchedule ? "Saving..." : editingSchedule ? "Update Schedule" : "Schedule Career Fair"}
            </Button>
          </DialogActions>
        </Dialog>

        <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#1a1a1a" }}>
              Quick Actions
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                onClick={() => navigate("/booths")}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": {
                    borderColor: "#2d6b4d",
                    bgcolor: "rgba(56, 133, 96, 0.05)",
                  },
                }}
              >
                View All Booths
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate("/dashboard")}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": {
                    borderColor: "#2d6b4d",
                    bgcolor: "rgba(56, 133, 96, 0.05)",
                  },
                }}
              >
                Go to Dashboard
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}

