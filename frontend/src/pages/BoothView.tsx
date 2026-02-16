import { useState, useEffect } from "react"
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
} from "@mui/material"
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore"
import { db } from "../firebase"
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

  const handleStartChat = async () => {
    try {
      if (!booth || startingChat) return;
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
      console.error("Chat: failed to initialize");
    } finally {
      setStartingChat(false);
    }
  };

  useEffect(() => {
    if (!boothId) {
      navigate("/booths")
      return
    }
    fetchBooth()
  }, [boothId, navigate])

  const fetchBooth = async () => {
    if (!boothId) return

    try {
      setLoading(true)
      setError("")

      // Check if fair is live
      const status = await evaluateFairStatus()
      const fairIsLive = status.isLive

      const boothDoc = await getDoc(doc(db, "booths", boothId))

      if (!boothDoc.exists()) {
        setError("Booth not found")
        setLoading(false)
        return
      }

      const boothData = {
        id: boothDoc.id,
        ...boothDoc.data(),
      } as Booth

      // If fair is not live, check if user has access
      if (!fairIsLive) {
        // Only company owners and representatives can view booths when not live
        if (!user || (user.role !== "companyOwner" && user.role !== "representative")) {
          setError("The career fair is not currently live. You can only view your own booth.")
          setLoading(false)
          return
        }

        // Check if this booth belongs to the user's company
        let hasAccess = false
        const companiesRef = collection(db, "companies")

        if (user.role === "companyOwner") {
          // Get all companies owned by this user
          const ownerQuery = query(companiesRef, where("ownerId", "==", user.uid))
          const ownerSnapshot = await getDocs(ownerQuery)
          ownerSnapshot.forEach((doc) => {
            const companyData = doc.data()
            if (companyData.boothId === boothId) {
              hasAccess = true
            }
          })
        } else if (user.role === "representative" && user.companyId) {
          // Check if the representative's company owns this booth
          const companyDoc = await getDoc(doc(db, "companies", user.companyId))
          if (companyDoc.exists()) {
            const companyData = companyDoc.data()
            if (companyData.boothId === boothId) {
              hasAccess = true
            }
          }
        }

        if (!hasAccess) {
          setError("You don't have access to view this booth. The career fair is not currently live.")
          setLoading(false)
          return
        }
      }

      setBooth(boothData)

      // ✅ Track booth views for the student's History tab
      // We only record history for authenticated students.
      // (Company reps/owners viewing booths shouldn't clutter student history.)
      try {
        if (user?.uid && user.role === "student") {
          await trackBoothView(user.uid, {
            boothId: boothData.id,
            companyName: boothData.companyName,
            industry: boothData.industry,
            location: boothData.location,
            logoUrl: boothData.logoUrl,
          });
        }
      } catch (err) {
        // If history fails, we don't want the whole Booth page to fail.
        console.warn("History tracking failed:", err);
      }


      // Get companyId from booth or look it up from companies
      let companyId = boothData.companyId
      if (!companyId) {
        // Try to find companyId by looking up companies with this boothId
        const companiesRef = collection(db, "companies")
        const companiesSnapshot = await getDocs(companiesRef)
        companiesSnapshot.forEach((doc) => {
          const companyData = doc.data()
          if (companyData.boothId === boothId) {
            companyId = doc.id
          }
        })
      }

      // Fetch jobs for this company if companyId is available
      if (companyId) {
        fetchJobs(companyId)
      }
    } catch (err) {
      console.error("Error fetching booth:", err)
      setError("Failed to load booth")
    } finally {
      setLoading(false)
    }
  }

  const fetchJobs = async (companyId: string) => {
    try {
      setLoadingJobs(true)
      const response = await fetch(`${API_URL}/api/jobs?companyId=${companyId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch jobs")
      }
      const data = await response.json()
      setJobs(data.jobs || [])
    } catch (err) {
      console.error("Error fetching jobs:", err)
      setError("Failed to load job postings.")
    } finally {
      setLoadingJobs(false)
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

                {/* Job Postings */}
                {loadingJobs ? (
                  <Box sx={{ mb: 4, display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
                    <CircularProgress />
                  </Box>
                ) : jobs.length > 0 ? (
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
                ) : null}


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
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
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
                  Open Position{jobs.length !== 1 ? "s" : ""}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}

