import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Rating,
} from "@mui/material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { auth } from "../firebase"
import { API_URL } from "../config"
import { authUtils } from "../utils/auth"

type ReviewEntry = {
  studentId: string
  rating: number
  comment: string | null
  createdAt: number | null
}

type BoothEntry = {
  boothId: string
  companyName: string
  averageRating: number | null
  totalRatings: number
  ratings: ReviewEntry[]
}

type FairData = {
  fairName: string
  startTime: number | null
  endTime: number | null
  booths: BoothEntry[]
}

export default function FairBoothsPage() {
  const { fairId } = useParams<{ fairId: string }>()
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [fairData, setFairData] = useState<FairData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!authUtils.isAuthenticated() || user?.role !== "administrator") {
      navigate("/admin")
      return
    }
    if (!fairId) return
    const fetchFairBooths = async () => {
      try {
        setLoading(true)
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch(`${API_URL}/api/fairs/${fairId}/booths`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Failed to load fair data")
          return
        }
        setFairData(data)
      } catch {
        setError("Failed to load fair data")
      } finally {
        setLoading(false)
      }
    }
    fetchFairBooths()
  }, [fairId, navigate, user?.role])

  const formatDate = (ms: number | null) =>
    ms ? new Date(ms).toLocaleString() : "—"

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#f8f9fa", py: 4 }}>
      <Container maxWidth="md">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/admin")}
          sx={{ mb: 3, textTransform: "none" }}
        >
          Back to Admin Dashboard
        </Button>

        {loading && <CircularProgress />}
        {error && <Alert severity="error">{error}</Alert>}

        {fairData && (
          <>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              {fairData.fairName || "Career Fair"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {formatDate(fairData.startTime)} – {formatDate(fairData.endTime)}
            </Typography>

            {fairData.booths.length === 0 && (
              <Typography color="text.secondary">No booths found for this fair.</Typography>
            )}

            {fairData.booths.map((booth) => (
              <Accordion key={booth.boothId} sx={{ mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
                    <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>
                      {booth.companyName}
                    </Typography>
                    {booth.totalRatings > 0 ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Rating value={booth.averageRating} readOnly precision={0.1} size="small" />
                        <Typography variant="body2" color="text.secondary">
                          {booth.averageRating?.toFixed(1)} ({booth.totalRatings})
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">No reviews</Typography>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {booth.ratings.length === 0 ? (
                    <Typography color="text.secondary">No reviews for this fair period.</Typography>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      {booth.ratings.map((review) => (
                        <Box
                          key={`${review.studentId}-${review.createdAt ?? "na"}-${review.rating}-${review.comment ?? ""}`}
                          sx={{ p: 1.5, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 2 }}
                        >
                          <Rating value={review.rating} readOnly size="small" />
                          {review.comment && (
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {review.comment}
                            </Typography>
                          )}
                          {review.createdAt && (
                            <Typography variant="caption" color="text.secondary">
                              {new Date(review.createdAt).toLocaleDateString()}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}
      </Container>
    </Box>
  )
}
