import { useState, useEffect, useRef, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { trackBoothView } from "../utils/boothHistory";
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
  Rating,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material"
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore"
import { db, auth } from "../firebase"
import { authUtils } from "../utils/auth"
import { evaluateFairStatus } from "../utils/fairStatus"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import BusinessIcon from "@mui/icons-material/Business"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import PeopleIcon from "@mui/icons-material/People"
import WorkIcon from "@mui/icons-material/Work"
import EmailIcon from "@mui/icons-material/Email"
import PhoneIcon from "@mui/icons-material/Phone"
import LanguageIcon from "@mui/icons-material/Language"
import LaunchIcon from "@mui/icons-material/Launch"
import ProfileMenu from "./ProfileMenu"
import { API_URL } from "../config"
import NotificationBell from "../components/NotificationBell"

interface Booth {
  id: string
  companyName: string
  industry: string
  companySize: string
  location: string
  description: string
  logoUrl?: string
  openPositions: number
  hiringFor?: string
  website?: string
  careersPage?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  companyId?: string
}

interface Job {
  id: string
  companyId: string
  name: string
  description: string
  majorsAssociated: string
  applicationLink: string | null
  createdAt: number | null
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

export default function BoothView() {
  const navigate = useNavigate()
  const { boothId } = useParams<{ boothId: string }>()
  const user = authUtils.getCurrentUser()
  const [booth, setBooth] = useState<Booth | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [error, setError] = useState("")
  const [startingChat, setStartingChat] = useState(false)
  const [ratingValue, setRatingValue] = useState<number | null>(null)
  const [ratingComment, setRatingComment] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)
  const [ratingError, setRatingError] = useState("")
  const [myReview, setMyReview] = useState<{ rating: number; comment: string | null; createdAt: number | null } | null>(null)
  const [loadingMyReview, setLoadingMyReview] = useState(false)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [resubmitValue, setResubmitValue] = useState<number | null>(null)
  const [resubmitComment, setResubmitComment] = useState("")
  const [resubmitError, setResubmitError] = useState("")
  const [submittingResubmit, setSubmittingResubmit] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joinSuccess, setJoinSuccess] = useState("")
  const [joiningFair, setJoiningFair] = useState(false)

  // Track if component is mounted to prevent setState after unmount
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleSubmitRating = async () => {
    if (!ratingValue || !boothId) return
    try {
      setSubmittingRating(true)
      setRatingError("")
      if (!auth.currentUser) {
        setRatingError("You must be logged in to rate booths")
        return
      }
      const token = await auth.currentUser.getIdToken()
      const res = await fetch(`${API_URL}/api/booths/${boothId}/ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating: ratingValue, comment: ratingComment }),
      })
      const data = await res.json()
      if (!isMountedRef.current) return
      if (!res.ok) {
        setRatingError(data.error || "Failed to submit rating")
        return
      }
      setMyReview({ rating: ratingValue, comment: ratingComment || null, createdAt: Date.now() })
    } catch {
      if (isMountedRef.current) setRatingError("Failed to submit rating")
    } finally {
      if (isMountedRef.current) setSubmittingRating(false)
    }
  }

  const handleResubmit = async () => {
    if (!resubmitValue || !boothId) return
    try {
      setSubmittingResubmit(true)
      setResubmitError("")
      if (!auth.currentUser) {
        setResubmitError("You must be logged in to submit a rating")
        return
      }
      const token = await auth.currentUser.getIdToken()
      const res = await fetch(`${API_URL}/api/booths/${boothId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: resubmitValue, comment: resubmitComment }),
      })
      const data = await res.json()
      if (!isMountedRef.current) return
      if (!res.ok) {
        setResubmitError(data.error || "Failed to submit rating")
        return
      }
      setMyReview({ rating: resubmitValue, comment: resubmitComment || null, createdAt: Date.now() })
      setResubmitOpen(false)
      setResubmitValue(null)
      setResubmitComment("")
    } catch {
      if (isMountedRef.current) setResubmitError("Failed to submit rating")
    } finally {
      if (isMountedRef.current) setSubmittingResubmit(false)
    }
  }

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
    setJoiningFair(true)
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
        if (isMountedRef.current) setJoinError(data.error || "Failed to join fair")
      } else {
        if (isMountedRef.current) {
          setJoinSuccess(`Joined "${data.fairName || "fair"}" successfully`)
          setJoinCode("")
        }
      }
    } catch {
      if (isMountedRef.current) setJoinError("Network error. Please try again.")
    } finally {
      if (isMountedRef.current) setJoiningFair(false)
    }
  }

  const handleStartChat = async () => {
    try {
      if (!booth || startingChat) return;
      if (!isMountedRef.current) return;
      setStartingChat(true);

      // Query Firestore for representative user
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", booth.contactEmail));
      const snap = await getDocs(q);

      if (snap.empty) {
        console.warn("Chat: representative not found");
        return;
      }

      const repDoc = snap.docs[0];
      const repData = repDoc.data();
      const representativeId = repData.uid;

      // Navigate to chat page, passing repId so ChatPage can auto-create/select DM
      navigate("/dashboard/chat", {
        state: { repId: representativeId },
      });
    } catch (err) {
      console.error("Chat: failed to initialize", err);
    } finally {
      if (isMountedRef.current) {
        setStartingChat(false);
      }
    }
  };

  useEffect(() => {
    if (!boothId) {
      navigate("/booths")
      return
    }
    fetchBooth()
  }, [boothId, navigate])

  useEffect(() => {
    if (!boothId || user?.role !== "student") return
    const fetchMyReview = async () => {
      try {
        setLoadingMyReview(true)
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch(`${API_URL}/api/booths/${boothId}/ratings/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (res.ok && data.rating != null) {
          setMyReview({ rating: data.rating, comment: data.comment, createdAt: data.createdAt })
        }
      } catch {
        // silently ignore
      } finally {
        if (isMountedRef.current) setLoadingMyReview(false)
      }
    }
    fetchMyReview()
  }, [boothId, user?.role])

  const checkBoothAccess = async (targetBoothId: string): Promise<boolean> => {
    if (!user || (user.role !== "companyOwner" && user.role !== "representative")) return false
    const companiesRef = collection(db, "companies")
    if (user.role === "companyOwner") {
      const ownerSnapshot = await getDocs(query(companiesRef, where("ownerId", "==", user.uid)))
      return ownerSnapshot.docs.some((d) => d.data().boothId === targetBoothId)
    }
    if (user.role === "representative" && user.companyId) {
      const companyDoc = await getDoc(doc(db, "companies", user.companyId))
      return companyDoc.exists() && companyDoc.data()?.boothId === targetBoothId
    }
    return false
  }

  const getAccessError = async (fairIsLive: boolean): Promise<string | null> => {
    if (fairIsLive) return null
    const hasAccess = await checkBoothAccess(boothId!)
    if (hasAccess) return null
    const isCompanyUser = user?.role === "companyOwner" || user?.role === "representative"
    return isCompanyUser
      ? "You don't have access to view this booth. The career fair is not currently live."
      : "The career fair is not currently live. You can only view your own booth."
  }

  const trackStudentBoothView = async (boothData: Booth) => {
    if (!user?.uid || user.role !== "student") return
    try {
      await trackBoothView(user.uid, {
        boothId: boothData.id,
        companyName: boothData.companyName,
        industry: boothData.industry,
        location: boothData.location,
        logoUrl: boothData.logoUrl,
      })
    } catch (err) {
      console.warn("History tracking failed:", err)
    }
  }

  const resolveCompanyId = async (boothData: Booth, targetBoothId: string): Promise<string | undefined> => {
    if (boothData.companyId) return boothData.companyId
    const companiesSnapshot = await getDocs(collection(db, "companies"))
    const match = companiesSnapshot.docs.find((d) => d.data().boothId === targetBoothId)
    return match?.id
  }

  const fetchBooth = async () => {
    if (!boothId) return

    setLoading(true)
    setError("")
    try {
      const [status, boothDoc] = await Promise.all([
        evaluateFairStatus(),
        getDoc(doc(db, "booths", boothId)),
      ])
      if (!isMountedRef.current) return

      if (!boothDoc.exists()) {
        setError("Booth not found")
        return
      }

      const accessError = await getAccessError(status.isLive)
      if (!isMountedRef.current) return

      if (accessError) {
        setError(accessError)
        return
      }

      const boothData = { id: boothDoc.id, ...boothDoc.data() } as Booth
      setBooth(boothData)
      void trackStudentBoothView(boothData)

      const companyId = await resolveCompanyId(boothData, boothId)
      if (companyId) fetchJobs(companyId)
    } catch (err) {
      console.error("Error fetching booth:", err)
      if (isMountedRef.current) setError("Failed to load booth")
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }

  const fetchJobs = async (companyId: string) => {
    try {
      if (!isMountedRef.current) return
      setLoadingJobs(true)
      const response = await fetch(`${API_URL}/api/jobs?companyId=${companyId}`)
      if (!isMountedRef.current) return
      if (!response.ok) {
        throw new Error("Failed to fetch jobs")
      }
      const data = await response.json()
      if (!isMountedRef.current) return
      setJobs(data.jobs || [])
    } catch (err) {
      console.error("Error fetching jobs:", err)
      if (isMountedRef.current) {
        setError("Failed to load job postings.")
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingJobs(false)
      }
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !booth) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Card sx={{ p: 4, maxWidth: 500, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || "Booth not found"}
          </Alert>
          <Button onClick={() => navigate("/booths")} variant="contained" fullWidth>
            Back to Booths
          </Button>
        </Card>
      </Box>
    )
  }

  let reviewContent: ReactNode
  if (loadingMyReview) {
    reviewContent = <CircularProgress size={24} />
  } else if (myReview) {
    reviewContent = (
      <Box>
        <Rating value={myReview.rating} readOnly size="large" sx={{ "& .MuiRating-iconFilled": { color: "#b03a6c" } }} />
        {myReview.comment && (
          <Typography variant="body2" sx={{ mt: 1 }}>{myReview.comment}</Typography>
        )}
        {myReview.createdAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Submitted {new Date(myReview.createdAt).toLocaleDateString()}
          </Typography>
        )}
        <Button
          variant="outlined"
          onClick={() => setResubmitOpen(true)}
          sx={{ mt: 2, textTransform: "none", borderColor: "#b03a6c", color: "#b03a6c" }}
        >
          Resubmit Review
        </Button>
      </Box>
    )
  } else {
    reviewContent = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Rating
          value={ratingValue}
          onChange={(_, val) => setRatingValue(val)}
          size="large"
          sx={{ "& .MuiRating-iconFilled": { color: "#b03a6c" } }}
        />
        <TextField
          label="Comments (optional)"
          multiline
          rows={3}
          value={ratingComment}
          onChange={(e) => setRatingComment(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
          size="small"
          fullWidth
        />
        {ratingError && (
          <Alert severity="error">{ratingError}</Alert>
        )}
        <Button
          variant="contained"
          disabled={!ratingValue || submittingRating}
          onClick={handleSubmitRating}
          sx={{
            background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 2,
            "&:hover": {
              background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
            },
          }}
        >
          {submittingRating ? "Submitting..." : "Submit Rating"}
        </Button>
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
              <Button
                onClick={() => navigate("/booths")}
                sx={{
                  color: "white",
                  minWidth: "auto",
                  p: 1,
                  "&:hover": {
                    bgcolor: "rgba(255,255,255,0.1)",
                  },
                }}
              >
                <ArrowBackIcon />
              </Button>
              <BusinessIcon sx={{ fontSize: 32, color: "white" }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
                {booth.companyName}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <NotificationBell />
              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={3}>
          {/* Main Content */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", mb: 3 }}>
              <CardContent sx={{ p: 4 }}>
                {/* Company Header */}
                <Box sx={{ display: "flex", alignItems: "start", gap: 3, mb: 4 }}>
                  {booth.logoUrl ? (
                    <Box
                      component="img"
                      src={booth.logoUrl}
                      alt={`${booth.companyName} logo`}
                      sx={{
                        width: 120,
                        height: 120,
                        borderRadius: 2,
                        objectFit: "cover",
                        border: "1px solid rgba(0,0,0,0.1)",
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 120,
                        height: 120,
                        borderRadius: 2,
                        background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <BusinessIcon sx={{ fontSize: 60, color: "#388560" }} />
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                      <Typography variant="h4" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                        {booth.companyName}
                      </Typography>
                      <Chip
                        label={INDUSTRY_LABELS[booth.industry] || booth.industry}
                        sx={{
                          bgcolor: "rgba(56, 133, 96, 0.1)",
                          color: "#388560",
                          fontWeight: 600,
                        }}
                      />
                    </Box>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LocationOnIcon sx={{ fontSize: 20, color: "#b03a6c" }} />
                        <Typography variant="body2" color="text.secondary">
                          {booth.location}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <PeopleIcon sx={{ fontSize: 20, color: "#b03a6c" }} />
                        <Typography variant="body2" color="text.secondary">
                          {booth.companySize} employees
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Company Description */}
                <Box sx={{ mb: 4 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#1a1a1a" }}>
                    About Us
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                    {booth.description}
                  </Typography>
                </Box>

                {/* Join a Fair */}
                {(user?.role === "companyOwner" || user?.role === "representative") && (
                  <Card sx={{ mb: 3 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Join a Career Fair
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Enter the invite code provided by the fair organizer to register your booth.
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                        <TextField
                          label="Fair Invite Code"
                          size="small"
                          value={joinCode}
                          onChange={(e) => {
                            setJoinCode(e.target.value.toUpperCase())
                            setJoinError("")
                            setJoinSuccess("")
                          }}
                          error={!!joinError}
                          helperText={joinError}
                          slotProps={{ htmlInput: { maxLength: 20 } }}
                          sx={{ flex: 1 }}
                        />
                        <Button
                          variant="contained"
                          onClick={handleJoinFair}
                          disabled={joiningFair}
                          sx={{ mt: 0.5 }}
                        >
                          {joiningFair ? "Joining…" : "Join Fair"}
                        </Button>
                      </Box>
                      {joinSuccess && (
                        <Alert severity="success" sx={{ mt: 1 }}>
                          {joinSuccess}
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Job Postings */}
                {loadingJobs && (
                  <Box sx={{ mb: 4, display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
                    <CircularProgress />
                  </Box>
                )}
                {!loadingJobs && jobs.length > 0 && (
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, color: "#1a1a1a", display: "flex", alignItems: "center", gap: 1 }}>
                      <WorkIcon sx={{ color: "#388560" }} />
                      Job Openings ({jobs.length})
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {jobs.map((job) => (
                        <Card
                          key={job.id}
                          sx={{
                            border: "1px solid rgba(56, 133, 96, 0.2)",
                            borderRadius: 2,
                            transition: "box-shadow 0.2s",
                            "&:hover": {
                              boxShadow: "0 4px 12px rgba(56, 133, 96, 0.15)",
                            },
                          }}
                        >
                          <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                                {job.name}
                              </Typography>
                              {job.applicationLink && (
                                <Button
                                  variant="contained"
                                  href={job.applicationLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{
                                    background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                                    "&:hover": {
                                      background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                                    },
                                  }}
                                >
                                  Apply Now
                                </Button>
                              )}
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: "pre-wrap" }}>
                              {job.description}
                            </Typography>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, color: "#388560" }}>
                                Required Skills:
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {job.majorsAssociated}
                              </Typography>
                            </Box>
                          </CardContent>
                        </Card>
                      ))}
                    </Box>
                  </Box>
                )}


                {/* Links */}
                {(booth.website || booth.careersPage) && (
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#1a1a1a" }}>
                      Learn More
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {booth.website && (
                        <Link
                          href={booth.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            color: "#388560",
                            textDecoration: "none",
                            "&:hover": { textDecoration: "underline" },
                          }}
                        >
                          <LanguageIcon />
                          <Typography>Company Website</Typography>
                          <LaunchIcon sx={{ fontSize: 16 }} />
                        </Link>
                      )}
                      {booth.careersPage && (
                        <Link
                          href={booth.careersPage}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            color: "#388560",
                            textDecoration: "none",
                            "&:hover": { textDecoration: "underline" },
                          }}
                        >
                          <WorkIcon />
                          <Typography>Careers Page</Typography>
                          <LaunchIcon sx={{ fontSize: 16 }} />
                        </Link>
                      )}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Sidebar */}
          <Grid size={{ xs: 12, md: 4 }}>
            {/* Contact Card */}
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", mb: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, color: "#1a1a1a" }}>
                  Contact Information
                </Typography>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Contact Person
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {booth.contactName}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Email
                    </Typography>
                    <Link
                      href={`mailto:${booth.contactEmail}`}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        color: "#388560",
                        textDecoration: "none",
                        "&:hover": { textDecoration: "underline" },
                      }}
                    >
                      <EmailIcon sx={{ fontSize: 18 }} />
                      <Typography variant="body1">{booth.contactEmail}</Typography>
                    </Link>
                  </Box>

                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>


                    {/* ✅ INSERT THIS BUTTON RIGHT HERE */}
                    <Button
                      variant="contained"
                      fullWidth
                      disabled={startingChat}
                      onClick={handleStartChat}
                      sx={{
                        mt: 2,
                        background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                        textTransform: "none",
                        fontWeight: 600,
                        borderRadius: 2,
                        "&:hover": {
                          background: "linear-gradient(135deg, #2d6b4d 0%, #1f523b 100%)",
                        },
                      }}
                    >
                      {startingChat ? "Connecting..." : "Message Representative"}
                    </Button>

                  </Box>


                  {booth.contactPhone && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        Phone
                      </Typography>
                      <Link
                        href={`tel:${booth.contactPhone}`}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          color: "#388560",
                          textDecoration: "none",
                          "&:hover": { textDecoration: "underline" },
                        }}
                      >
                        <PhoneIcon sx={{ fontSize: 18 }} />
                        <Typography variant="body1">{booth.contactPhone}</Typography>
                      </Link>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>

            {/* Open Positions Card */}
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", mb: 3 }}>
              <CardContent sx={{ p: 3, textAlign: "center" }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mx: "auto",
                    mb: 2,
                  }}
                >
                  <WorkIcon sx={{ fontSize: 32, color: "#388560" }} />
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: "#388560", mb: 1 }}>
                  {jobs.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Open Position{jobs.length === 1 ? "" : "s"}
                </Typography>
              </CardContent>
            </Card>

            {/* Rate this Booth / Your Review — students only */}
            {user?.role === "student" && (
              <Card sx={{ border: "1px solid rgba(176, 58, 108, 0.3)" }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#1a1a1a" }}>
                    {myReview ? "Your Review" : "Rate this Booth"}
                  </Typography>

                  {reviewContent}
                </CardContent>
              </Card>
            )}

            {/* Resubmit dialog */}
            <Dialog open={resubmitOpen} onClose={() => setResubmitOpen(false)} fullWidth maxWidth="sm">
              <DialogTitle>Resubmit Your Review</DialogTitle>
              <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
                  <Rating
                    value={resubmitValue}
                    onChange={(_, val) => setResubmitValue(val)}
                    size="large"
                    sx={{ "& .MuiRating-iconFilled": { color: "#b03a6c" } }}
                  />
                  <TextField
                    label="Comments (optional)"
                    multiline
                    rows={3}
                    value={resubmitComment}
                    onChange={(e) => setResubmitComment(e.target.value)}
                    slotProps={{ htmlInput: { maxLength: 1000 } }}
                    size="small"
                    fullWidth
                  />
                  {resubmitError && <Alert severity="error">{resubmitError}</Alert>}
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setResubmitOpen(false)}>Cancel</Button>
                <Button
                  variant="contained"
                  disabled={!resubmitValue || submittingResubmit}
                  onClick={handleResubmit}
                  sx={{ background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)", textTransform: "none" }}
                >
                  {submittingResubmit ? "Submitting..." : "Submit New Review"}
                </Button>
              </DialogActions>
            </Dialog>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}

