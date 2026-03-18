import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
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
  Divider,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Rating,
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import BusinessIcon from "@mui/icons-material/Business"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import PeopleIcon from "@mui/icons-material/People"
import WorkIcon from "@mui/icons-material/Work"
import EmailIcon from "@mui/icons-material/Email"
import PhoneIcon from "@mui/icons-material/Phone"
import LanguageIcon from "@mui/icons-material/Language"
import LaunchIcon from "@mui/icons-material/Launch"
import BaseLayout from "../components/BaseLayout"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db, auth } from "../firebase"
import { trackBoothView } from "../utils/boothHistory"
import { API_URL } from "../config"

interface Booth {
  id: string
  companyName: string
  industry: string | null
  companySize: string | null
  location: string | null
  description: string | null
  logoUrl?: string | null
  hiringFor?: string | null
  website?: string | null
  careersPage?: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone?: string | null
  companyId: string
}

interface Job {
  id: string
  name: string
  description: string | null
  majorsAssociated: string | null
  applicationLink: string | null
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

export default function FairBoothView() {
  const navigate = useNavigate()
  const { boothId } = useParams<{ boothId: string }>()
  const { fair, loading: fairLoading, fairId } = useFair()
  const user = authUtils.getCurrentUser()
  const [booth, setBooth] = useState<Booth | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [startingChat, setStartingChat] = useState(false)
  const trackingBoothIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  // Rating state (keyed to the original/main booth ID)
  const [ratingBoothId, setRatingBoothId] = useState<string | null>(null)
  const [myRating, setMyRating] = useState<{ rating: number; comment: string | null; createdAt: number | null } | null | undefined>(undefined)
  const [ratingValue, setRatingValue] = useState<number | null>(null)
  const [ratingComment, setRatingComment] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)
  const [ratingError, setRatingError] = useState("")
  const [ratingSuccess, setRatingSuccess] = useState("")
  const [resubmitDialogOpen, setResubmitDialogOpen] = useState(false)
  const [resubmitValue, setResubmitValue] = useState<number | null>(null)
  const [resubmitComment, setResubmitComment] = useState("")

  const trackStudentBoothLeave = async () => {
    try {
      if (user?.uid && user.role === "student" && trackingBoothIdRef.current) {
        const token = await authUtils.getIdToken()
        if (token) {
          await fetch(`${API_URL}/api/booth/${trackingBoothIdRef.current}/track-leave`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          })
          console.log("[FAIR-BOOTH-VIEW] Tracked booth leave");
        }
      }
    } catch (err) {
      console.warn("Booth leave tracking failed:", err)
    }
  }

  useEffect(() => {
    return () => { 
      isMountedRef.current = false
      trackStudentBoothLeave()
    }
  }, [boothId, user?.uid])

  useEffect(() => {
    if (fairLoading || !fairId || !boothId) return
    fetchBooth()
  }, [fairLoading, fairId, boothId])

  const handleBoothResponse = (boothRes: Response): string | null => {
    if (boothRes.status === 403) {
      return "The career fair is not currently live."
    }
    if (boothRes.status === 404) {
      return "Booth not found."
    }
    if (!boothRes.ok) {
      throw new Error("Failed to load booth")
    }
    return null
  }

  const trackStudentBoothView = async (boothData: any) => {
    if (!user?.uid || user.role !== "student" || !boothId) return
    
    try {
      // Use the original booth ID for tracking if available, otherwise use fair-specific ID
      const originalOrFairBoothId = boothData.originalBoothId || boothId;
      trackingBoothIdRef.current = originalOrFairBoothId;
      
      // Track in local history
      await trackBoothView(user.uid, {
        boothId: originalOrFairBoothId,
        companyName: boothData.companyName,
        industry: boothData.industry,
        location: boothData.location,
        logoUrl: boothData.logoUrl,
      })
      
      // Track in backend for company analytics
      const token = await authUtils.getIdToken();
      if (token) {
        try {
          const url = `${API_URL}/api/booth/${originalOrFairBoothId}/track-view`
          await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          })
        } catch (err) {
          console.warn("Backend booth tracking failed:", err)
        }
      }
    } catch (err) {
      console.warn("History tracking failed:", err)
    }
  }

  const loadCompanyJobs = async (jobsRes: Response, companyId: string) => {
    if (!jobsRes.ok) return
    
    const jobsData = await jobsRes.json()
    const companyJobs = (jobsData.jobs || []).filter(
      (j: any) => j.companyId === companyId
    )
    if (isMountedRef.current) setJobs(companyJobs)
  }

  const fetchBooth = async () => {
    if (!fairId || !boothId) return
    try {
      setLoading(true)
      setError("")

      const headers: Record<string, string> = {}
      const token = await auth.currentUser?.getIdToken()
      if (token) headers.Authorization = `Bearer ${token}`

      const [boothRes, jobsRes] = await Promise.all([
        fetch(`${API_URL}/api/fairs/${fairId}/booths/${boothId}`, { headers }),
        fetch(`${API_URL}/api/fairs/${fairId}/jobs`, { headers }),
      ])

      const errorMessage = handleBoothResponse(boothRes)
      if (errorMessage) {
        setError(errorMessage)
        return
      }

      const boothData = await boothRes.json()
      if (!isMountedRef.current) return
      
      setBooth({ id: boothId, ...boothData })
      await trackStudentBoothView(boothData)
      await loadCompanyJobs(jobsRes, boothData.companyId)
      const mainBoothId = boothData.originalBoothId || null
      setRatingBoothId(mainBoothId)
      if (mainBoothId) {
        await fetchMyRating(mainBoothId)
      } else {
        setMyRating(null)
      }
    } catch (err) {
      console.error(err)
      if (isMountedRef.current) setError("Failed to load booth")
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }

  const fetchMyRating = async (mainBoothId: string) => {
    if (user?.role !== "student") return
    try {
      const token = await authUtils.getIdToken()
      const res = await fetch(`${API_URL}/api/booths/${mainBoothId}/ratings/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!isMountedRef.current) return
      if (res.ok) {
        const data = await res.json()
        setMyRating(data.rating)
      } else {
        setMyRating(null)
      }
    } catch {
      if (isMountedRef.current) setMyRating(null)
    }
  }

  const submitRating = async (value: number | null, comment: string, onSuccess: () => void) => {
    if (!ratingBoothId || !value) return
    setSubmittingRating(true)
    setRatingError("")
    try {
      const token = await authUtils.getIdToken()
      const res = await fetch(`${API_URL}/api/booths/${ratingBoothId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: value, comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json()
        setRatingError(data.error || "Failed to submit rating")
        return
      }
      setMyRating({ rating: value, comment: comment.trim() || null, createdAt: Date.now() })
      setRatingSuccess("Review submitted!")
      onSuccess()
    } catch {
      setRatingError("Failed to submit rating")
    } finally {
      setSubmittingRating(false)
    }
  }

  const handleStartChat = async () => {
    if (!booth || startingChat || !isMountedRef.current) return
    setStartingChat(true)
    try {
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("email", "==", booth.contactEmail))
      const snap = await getDocs(q)
      if (snap.empty) {
        console.warn("Representative not found")
        return
      }
      const repId = snap.docs[0].data().uid
      navigate("/dashboard/chat", { state: { repId } })
    } catch (err) {
      console.error("Chat init failed:", err)
    } finally {
      if (isMountedRef.current) setStartingChat(false)
    }
  }

  if (fairLoading || loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <BaseLayout pageTitle={booth?.companyName ?? "Booth"}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/fair/${fairId}/booths`)}
          sx={{ mb: 3 }}
        >
          Back to {fair?.name ?? "Fair"} Booths
        </Button>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {!error && booth && (
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 3, mb: 3 }}>
                    {booth.logoUrl && (
                      <img
                        src={booth.logoUrl}
                        alt={booth.companyName}
                        style={{ maxHeight: 80, objectFit: "contain" }}
                      />
                    )}
                    <Box>
                      <Typography variant="h4" fontWeight="bold">{booth.companyName}</Typography>
                      {booth.industry && (
                        <Chip
                          label={INDUSTRY_LABELS[booth.industry] ?? booth.industry}
                          size="small"
                          sx={{ mt: 1 }}
                        />
                      )}
                    </Box>
                  </Box>

                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    {booth.companySize && (
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
                          <PeopleIcon fontSize="small" />
                          <Typography variant="body2">{booth.companySize} employees</Typography>
                        </Box>
                      </Grid>
                    )}
                    {booth.location && (
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
                          <LocationOnIcon fontSize="small" />
                          <Typography variant="body2">{booth.location}</Typography>
                        </Box>
                      </Grid>
                    )}
                    {booth.hiringFor && (
                      <Grid size={{ xs: 12 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
                          <WorkIcon fontSize="small" />
                          <Typography variant="body2">Hiring for: {booth.hiringFor}</Typography>
                        </Box>
                      </Grid>
                    )}
                  </Grid>

                  {booth.description && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="h6" gutterBottom>About</Typography>
                      <Typography color="text.secondary">{booth.description}</Typography>
                    </>
                  )}

                  {jobs.length > 0 && (
                    <>
                      <Divider sx={{ my: 3 }} />
                      <Typography variant="h6" gutterBottom>
                        Open Positions ({jobs.length})
                      </Typography>
                      {jobs.map((job) => (
                        <Card key={job.id} variant="outlined" sx={{ mb: 2 }}>
                          <CardContent>
                            <Typography fontWeight="bold">{job.name}</Typography>
                            {job.majorsAssociated && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Skills: {job.majorsAssociated}
                              </Typography>
                            )}
                            {job.description && (
                              <Typography variant="body2" sx={{ mt: 1 }}>{job.description}</Typography>
                            )}
                            {job.applicationLink && (
                              <Link href={job.applicationLink} target="_blank" rel="noopener noreferrer" sx={{ mt: 1, display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                                Apply <LaunchIcon fontSize="small" />
                              </Link>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Contact</Typography>

                  {booth.contactName && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <BusinessIcon fontSize="small" color="action" />
                      <Typography variant="body2">{booth.contactName}</Typography>
                    </Box>
                  )}
                  {booth.contactEmail && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <EmailIcon fontSize="small" color="action" />
                      <Typography variant="body2">{booth.contactEmail}</Typography>
                    </Box>
                  )}
                  {booth.contactPhone && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <PhoneIcon fontSize="small" color="action" />
                      <Typography variant="body2">{booth.contactPhone}</Typography>
                    </Box>
                  )}
                  {booth.website && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <LanguageIcon fontSize="small" color="action" />
                      <Link href={booth.website} target="_blank" rel="noopener noreferrer" variant="body2">
                        Website
                      </Link>
                    </Box>
                  )}
                  {booth.careersPage && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                      <WorkIcon fontSize="small" color="action" />
                      <Link href={booth.careersPage} target="_blank" rel="noopener noreferrer" variant="body2">
                        Careers Page
                      </Link>
                    </Box>
                  )}

                  {user?.role === "student" && booth.contactEmail && (
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={handleStartChat}
                      disabled={startingChat}
                    >
                      {startingChat ? "Opening Chat..." : "Message Representative"}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Rating Card — students only */}
              {user?.role === "student" && myRating !== undefined && (
                <Card sx={{ mt: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Rate This Booth</Typography>

                    {ratingError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setRatingError("")}>{ratingError}</Alert>}
                    {ratingSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setRatingSuccess("")}>{ratingSuccess}</Alert>}

                    {!ratingBoothId ? (
                      <Typography variant="body2" color="text.secondary">Rating not available for this booth.</Typography>
                    ) : myRating ? (
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Your review</Typography>
                        <Rating value={myRating.rating} readOnly size="small" />
                        {myRating.comment && (
                          <Typography variant="body2" sx={{ mt: 0.5 }}>{myRating.comment}</Typography>
                        )}
                        {myRating.createdAt && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            {new Date(myRating.createdAt).toLocaleDateString()}
                          </Typography>
                        )}
                        <Button
                          variant="outlined"
                          size="small"
                          sx={{ mt: 2 }}
                          onClick={() => { setResubmitValue(null); setResubmitComment(""); setResubmitDialogOpen(true) }}
                        >
                          Resubmit Review
                        </Button>
                      </Box>
                    ) : (
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Your rating</Typography>
                        <Rating value={ratingValue} onChange={(_, v) => setRatingValue(v)} size="large" />
                        <TextField
                          label="Comment (optional)"
                          value={ratingComment}
                          onChange={(e) => setRatingComment(e.target.value)}
                          fullWidth multiline rows={2} size="small"
                          sx={{ mt: 2, mb: 2 }}
                        />
                        <Button
                          variant="contained"
                          fullWidth
                          disabled={!ratingValue || submittingRating}
                          onClick={() => submitRating(ratingValue, ratingComment, () => { setRatingValue(null); setRatingComment("") })}
                        >
                          {submittingRating ? "Submitting..." : "Submit Review"}
                        </Button>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}
            </Grid>
          </Grid>
        )}
      </Container>

      <Dialog open={resubmitDialogOpen} onClose={() => setResubmitDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Resubmit Review</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>New rating</Typography>
            <Rating value={resubmitValue} onChange={(_, v) => setResubmitValue(v)} size="large" />
            <TextField
              label="Comment (optional)"
              value={resubmitComment}
              onChange={(e) => setResubmitComment(e.target.value)}
              fullWidth multiline rows={3} size="small"
              sx={{ mt: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResubmitDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!resubmitValue || submittingRating}
            onClick={() => submitRating(resubmitValue, resubmitComment, () => setResubmitDialogOpen(false))}
          >
            {submittingRating ? "Submitting..." : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>
    </BaseLayout>
  )
}
