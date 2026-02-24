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
} from "@mui/material"
import EventIcon from "@mui/icons-material/Event"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import ProfileMenu from "./ProfileMenu"
import NotificationBell from "../components/NotificationBell"
import { API_URL } from "../config"

interface Fair {
  id: string
  name: string
  description: string | null
  isLive: boolean
  startTime: number | null
  endTime: number | null
}

function getFairStatus(fair: Fair): { label: string; color: "success" | "warning" | "default" } {
  const now = Date.now()
  if (fair.isLive) return { label: "Live Now", color: "success" }
  if (fair.startTime && now < fair.startTime) return { label: "Upcoming", color: "warning" }
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
  const [fairs, setFairs] = useState<Fair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadFairs() {
      try {
        const res = await fetch(`${API_URL}/api/fairs`)
        if (!res.ok) throw new Error("Failed to load fairs")
        const data = await res.json()
        // Filter out ended fairs for students; show all to admins
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
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={fair.id}>
                <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Typography variant="h6" fontWeight="bold">
                        {fair.name}
                      </Typography>
                      <Chip label={status.label} color={status.color} size="small" />
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

                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Button
                      variant="contained"
                      endIcon={<ArrowForwardIcon />}
                      onClick={() => navigate(`/fair/${fair.id}/booths`)}
                      disabled={status.label === "Ended"}
                      fullWidth
                    >
                      Browse Booths
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      </Container>
    </Box>
  )
}
