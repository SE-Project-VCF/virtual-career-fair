import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material"
import BusinessIcon from "@mui/icons-material/Business"
import PeopleIcon from "@mui/icons-material/People"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import ProfileMenu from "./ProfileMenu"
import NotificationBell from "../components/NotificationBell"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import { API_URL } from "../config"

interface Booth {
  id: string
  companyName: string
  industry: string | null
  companySize: string | null
  location: string | null
  description: string | null
  logoUrl?: string | null
  companyId: string
}

const INDUSTRY_LABELS: Record<string, string> = {
  software: "Software Development",
  data: "Data Science & Analytics",
  healthcare: "Healthcare Technology",
  finance: "Financial Services",
  energy: "Renewable Energy",
  education: "Education Technology",
  retail: "Retail & E-commerce",
  manufacturing: "Manufacturing",
  other: "Other",
}

export default function FairBooths() {
  const navigate = useNavigate()
  const { fair, isLive, loading: fairLoading, fairId } = useFair()
  const user = authUtils.getCurrentUser()
  const [booths, setBooths] = useState<Booth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (fairLoading || !fairId) return
    fetchBooths()
  }, [fairLoading, fairId])

  const fetchBooths = async () => {
    try {
      setLoading(true)
      setError("")

      const headers: Record<string, string> = {}
      const token = await auth.currentUser?.getIdToken()
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch(`${API_URL}/api/fairs/${fairId}/booths`, { headers })

      if (res.status === 403) {
        setError("The career fair is not currently live.")
        return
      }
      if (!res.ok) throw new Error("Failed to load booths")

      const data = await res.json()
      setBooths(data.booths || [])
    } catch (err) {
      console.error(err)
      setError("Failed to load booths")
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = user?.role === "administrator"

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <Button variant="text" onClick={() => navigate(`/fair/${fairId}`)}>
            ← Back
          </Button>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <Typography variant="h4" fontWeight="bold">
            {fair?.name ?? "Career Fair"} — Booths
          </Typography>
          {isLive && <Chip label="Live" color="success" />}
        </Box>

        {!fairLoading && !isLive && !isAdmin && (
          <Alert severity="info" sx={{ mb: 3 }}>
            This fair is not currently live. Booths will be visible when the fair begins.
          </Alert>
        )}

        {(loading || fairLoading) && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {!loading && !error && booths.length === 0 && (isLive || isAdmin) && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <BusinessIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No booths yet
            </Typography>
          </Box>
        )}

        <Grid container spacing={3}>
          {booths.map((booth) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={booth.id}>
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  cursor: "pointer",
                  "&:hover": { boxShadow: 4 },
                }}
                onClick={() => navigate(`/fair/${fairId}/booth/${booth.id}`)}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  {booth.logoUrl && (
                    <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}>
                      <img
                        src={booth.logoUrl}
                        alt={booth.companyName}
                        style={{ maxHeight: 60, objectFit: "contain" }}
                      />
                    </Box>
                  )}

                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    {booth.companyName}
                  </Typography>

                  {booth.industry && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary", mb: 0.5 }}>
                      <BusinessIcon fontSize="small" />
                      <Typography variant="body2">
                        {INDUSTRY_LABELS[booth.industry] ?? booth.industry}
                      </Typography>
                    </Box>
                  )}

                  {booth.companySize && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary", mb: 0.5 }}>
                      <PeopleIcon fontSize="small" />
                      <Typography variant="body2">{booth.companySize}</Typography>
                    </Box>
                  )}

                  {booth.location && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary", mb: 0.5 }}>
                      <LocationOnIcon fontSize="small" />
                      <Typography variant="body2">{booth.location}</Typography>
                    </Box>
                  )}
                </CardContent>

                <Box sx={{ p: 2, pt: 0 }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    endIcon={<ArrowForwardIcon />}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/fair/${fairId}/booth/${booth.id}`)
                    }}
                  >
                    View Booth
                  </Button>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  )
}
