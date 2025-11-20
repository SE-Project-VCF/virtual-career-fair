import { useState, useEffect } from "react"
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
} from "@mui/material"
import EventIcon from "@mui/icons-material/Event"
import AccessTimeIcon from "@mui/icons-material/AccessTime"

interface FairSchedule {
  id: string
  name: string | null
  startTime: number | null
  endTime: number | null
  description: string | null
}

export default function EventList() {
  const [schedules, setSchedules] = useState<FairSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await fetch("http://localhost:5000/api/public/fair-schedules")
        if (response.ok) {
          const data = await response.json()
          const now = Date.now()
          // Filter out events that have already ended
          const upcomingSchedules = (data.schedules || []).filter((schedule: FairSchedule) => {
            // Only show events that haven't ended yet
            return schedule.endTime && schedule.endTime > now
          })
          setSchedules(upcomingSchedules)
        } else {
          setError("Failed to load events")
        }
      } catch (err) {
        console.error("Error fetching schedules:", err)
        setError("Failed to load events")
      } finally {
        setLoading(false)
      }
    }

    fetchSchedules()
  }, [])

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
    <Card sx={{ border: "1px solid rgba(176, 58, 108, 0.3)", mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
          <EventIcon sx={{ fontSize: 32, color: "#b03a6c" }} />
          <Typography variant="h5" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
            Upcoming Career Fairs
          </Typography>
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
                  border: "1px solid rgba(0,0,0,0.1)",
                  bgcolor: status?.type === "active" ? "rgba(56, 133, 96, 0.05)" : "transparent",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                    {schedule.name || "Career Fair"}
                  </Typography>
                  {status && (
                    <Chip
                      label={status.label}
                      size="small"
                      color={status.color}
                    />
                  )}
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
  )
}

