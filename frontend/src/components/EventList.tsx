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
import { API_URL } from "../config"

interface Fair {
  id: string
  name: string
  description: string | null
  isLive: boolean
  startTime: number | null
  endTime: number | null
}

export default function EventList({ enrolledFairIds = [] }: Readonly<{ enrolledFairIds?: string[] }>) {
  const [fairs, setFairs] = useState<Fair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchFairs = async () => {
      try {
        setLoading(true)
        setError("")
        const res = await fetch(`${API_URL}/api/fairs`)
        if (!res.ok) throw new Error("Failed to load fairs")
        const data = await res.json()
        const now = Date.now()
        // Only show fairs that haven't ended
        const upcoming = (data.fairs || []).filter((f: Fair) => !f.endTime || f.endTime > now)
        upcoming.sort((a: Fair, b: Fair) => {
          if (!a.startTime && !b.startTime) return 0
          if (!a.startTime) return 1
          if (!b.startTime) return -1
          return a.startTime - b.startTime
        })
        setFairs(upcoming)
      } catch (err) {
        console.error("Error fetching fairs:", err)
        setError("Failed to load events")
      } finally {
        setLoading(false)
      }
    }

    fetchFairs()
  }, [])

  const formatDateTime = (timestamp: number | null) => {
    if (!timestamp) return "Not set"
    return new Date(timestamp).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getFairStatus = (fair: Fair) => {
    const now = Date.now()
    if (fair.isLive) return { label: "Live Now", color: "success" as const }
    if (fair.startTime && now < fair.startTime) return { label: "Upcoming", color: "primary" as const }
    return null
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

  if (fairs.length === 0) return null

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
          {fairs.map((fair) => {
            const status = getFairStatus(fair)
            const isEnrolled = enrolledFairIds.includes(fair.id)
            let bgcolor = "transparent"
            if (isEnrolled) bgcolor = "rgba(46, 125, 50, 0.04)"
            else if (fair.isLive) bgcolor = "rgba(56, 133, 96, 0.05)"
            return (
              <Box
                key={fair.id}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: isEnrolled ? "1px solid rgba(46, 125, 50, 0.5)" : "1px solid rgba(0,0,0,0.1)",
                  bgcolor,
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                    {fair.name || "Career Fair"}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    {isEnrolled && <Chip label="Enrolled" size="small" color="success" />}
                    {status && <Chip label={status.label} size="small" color={status.color} />}
                  </Box>
                </Box>

                {fair.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {fair.description}
                  </Typography>
                )}

                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <AccessTimeIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                    <Typography variant="body2" color="text.secondary">
                      <strong>Start:</strong> {formatDateTime(fair.startTime)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <AccessTimeIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                    <Typography variant="body2" color="text.secondary">
                      <strong>End:</strong> {formatDateTime(fair.endTime)}
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
