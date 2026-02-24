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
import { authUtils } from "../utils/auth"
import { collection, getDocs, query, orderBy, where, doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import { evaluateFairStatus } from "../utils/fairStatus"
import BusinessIcon from "@mui/icons-material/Business"
import PeopleIcon from "@mui/icons-material/People"
import EventIcon from "@mui/icons-material/Event"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import WorkIcon from "@mui/icons-material/Work"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import ProfileMenu from "./ProfileMenu"
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
  companyId?: string
  hiringFor?: string
  website?: string
  careersPage?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
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

// Firestore 'in' queries support a maximum of 30 values per query
const FIRESTORE_IN_QUERY_LIMIT = 30

export default function Booths() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [booths, setBooths] = useState<Booth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isLive, setIsLive] = useState(false)
  const [scheduleName, setScheduleName] = useState<string | null>(null)
  const [scheduleDescription, setScheduleDescription] = useState<string | null>(null)
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({})
  const [totalJobs, setTotalJobs] = useState(0)

  useEffect(() => {
    fetchBooths()
  }, [])

  const fetchJobCounts = async (companyIds: string[]) => {
    try {
      if (companyIds.length === 0) return

      const counts: Record<string, number> = {}
      let total = 0

      // Firestore "in" queries support max FIRESTORE_IN_QUERY_LIMIT values, batch if needed
      const batches = []
      for (let i = 0; i < companyIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
        batches.push(companyIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT))
      }

      for (const batch of batches) {
        const q = query(collection(db, "jobs"), where("companyId", "in", batch))
        const jobsSnapshot = await getDocs(q)
        jobsSnapshot.forEach((doc) => {
          const companyId = doc.data().companyId
          if (companyId) {
            counts[companyId] = (counts[companyId] || 0) + 1
            total++
          }
        })
      }

      setJobCounts(counts)
      setTotalJobs(total)
    } catch (err) {
      console.error("Error fetching job counts:", err)
    }
  }

  const fetchBooths = async () => {
    try {
      setLoading(true)
      setError("")

      // Check if fair is live
      const status = await evaluateFairStatus()
      const fairIsLive = status.isLive
      setIsLive(status.isLive)
      setScheduleName(status.scheduleName)
      setScheduleDescription(status.scheduleDescription)

      let boothsList: Booth[] = []

      if (fairIsLive) {
        // Fair is live - show all booths
        const q = query(collection(db, "booths"), orderBy("companyName"))
        const querySnapshot = await getDocs(q)

        // Also fetch companies to map boothId to companyId
        const companiesSnapshot = await getDocs(collection(db, "companies"))
        const boothIdToCompanyId: Record<string, string> = {}
        companiesSnapshot.forEach((companyDoc) => {
          const companyData = companyDoc.data()
          if (companyData.boothId) {
            boothIdToCompanyId[companyData.boothId] = companyDoc.id
          }
        })

        querySnapshot.forEach((doc) => {
          const boothData = doc.data()
          const companyId = boothData.companyId || boothIdToCompanyId[doc.id] || undefined
          boothsList.push({
            id: doc.id,
            ...boothData,
            companyId,
          } as Booth)
        })
      } else if (user && (user.role === "companyOwner" || user.role === "representative")) {
        // Fair is not live - only show booths for company owners/representatives
          // Get user's company IDs
          const companiesRef = collection(db, "companies")
          let companyIds: string[] = []

          if (user.role === "companyOwner") {
            // Get all companies owned by this user
            const ownerQuery = query(companiesRef, where("ownerId", "==", user.uid))
            const ownerSnapshot = await getDocs(ownerQuery)
            ownerSnapshot.forEach((doc) => {
              companyIds.push(doc.id)
            })
          } else if (user.role === "representative" && user.companyId) {
            // Get the company the representative is linked to
            companyIds.push(user.companyId)
          }

          // Get booths for these companies
          if (companyIds.length > 0) {
            // Batch fetch all companies to avoid N+1 queries
            const companyDocsPromises = companyIds.map(companyId => getDoc(doc(db, "companies", companyId)))
            const companyDocs = await Promise.all(companyDocsPromises)

            // Build mapping of boothId -> companyId
            const boothIdToCompanyIdMap: Record<string, string> = {}
            const boothIds: string[] = []

            companyDocs.forEach((companyDoc, index) => {
              if (companyDoc.exists()) {
                const companyData = companyDoc.data()
                if (companyData.boothId) {
                  boothIds.push(companyData.boothId)
                  boothIdToCompanyIdMap[companyData.boothId] = companyIds[index]
                }
              }
            })

            // Batch fetch all booths
            if (boothIds.length > 0) {
              const boothDocsPromises = boothIds.map(boothId => getDoc(doc(db, "booths", boothId)))
              const boothDocs = await Promise.all(boothDocsPromises)

              boothDocs.forEach((boothDoc) => {
                if (boothDoc.exists()) {
                  const boothData = boothDoc.data()
                  const boothCompanyId = boothData.companyId || boothIdToCompanyIdMap[boothDoc.id]
                  boothsList.push({
                    id: boothDoc.id,
                    ...boothData,
                    companyId: boothCompanyId,
                  } as Booth)
                }
              })
            }
          }
        // If user is student or not logged in, they see no booths when fair is not live
      }

      setBooths(boothsList)

      // Fetch job counts for the loaded booths' companies
      const companyIds = boothsList
        .map((b) => b.companyId)
        .filter((id): id is string => !!id)
      fetchJobCounts([...new Set(companyIds)])
    } catch (err) {
      console.error("Error fetching booths:", err)
      setError("Failed to load booths")
    } finally {
      setLoading(false)
    }
  }

  // Get companyId for each booth and count jobs
  const getJobCountForBooth = (booth: Booth): number => {
    if (booth.companyId) {
      return jobCounts[booth.companyId] || 0
    }
    return 0
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
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
                Job Goblin - Virtual Career Fair
              </Typography>
              <Typography variant="body1" sx={{ color: "rgba(255,255,255,0.9)", mt: 1 }}>
                Explore opportunities from top companies
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {user && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {/* Dashboard button (existing) */}
                  <Button
                    variant="outlined"
                    onClick={() => navigate("/dashboard")}
                    sx={{
                      color: "white",
                      borderColor: "white",
                      "&:hover": {
                        borderColor: "white",
                        bgcolor: "rgba(255,255,255,0.1)",
                      },
                    }}
                  >
                    Dashboard
                  </Button>

                  {/* Booth History button (NEW) - only for students, ALWAYS enabled */}
                  {user.role === "student" && (
                    <Button
                      variant="outlined"
                      onClick={() => navigate("/dashboard/booth-history")}
                      sx={{
                        color: "white",
                        borderColor: "white",
                        "&:hover": {
                          borderColor: "white",
                          bgcolor: "rgba(255,255,255,0.1)",
                        },
                      }}
                    >
                      Booth History
                    </Button>
                  )}
                </Box>
              )}

              <NotificationBell />

              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Fair Name and Description Banner - Show when active */}
        {isLive && (scheduleName || scheduleDescription) && (
          <Alert
            severity="success"
            sx={{
              mb: 4,
              borderRadius: 2,
              bgcolor: "rgba(56, 133, 96, 0.1)",
              border: "1px solid rgba(56, 133, 96, 0.3)",
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
              {scheduleName || "Career Fair is LIVE"}
            </Typography>
            {scheduleDescription && (
              <Typography variant="body1" sx={{ mb: 1 }}>
                {scheduleDescription}
              </Typography>
            )}
            <Typography variant="body2">
              Browse and explore all company booths at the career fair.
            </Typography>
          </Alert>
        )}

        {/* Stats Bar */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BusinessIcon sx={{ fontSize: 28, color: "#388560" }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                      {booths.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Booths
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <WorkIcon sx={{ fontSize: 28, color: "#b03a6c" }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                      {totalJobs}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Open Positions
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <EventIcon sx={{ fontSize: 28, color: isLive ? "#388560" : "#ccc" }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: isLive ? "#388560" : "#ccc" }}>
                      {isLive ? (scheduleName || "Live Now") : "Not Live"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {isLive && scheduleDescription
                        ? scheduleDescription
                        : "Event Status"}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}
        {!loading && booths.length === 0 && (
          <Card sx={{ textAlign: "center", p: 6, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
            <BusinessIcon sx={{ fontSize: 80, color: "#ccc", mb: 2 }} />
            <Typography variant="h5" sx={{ mb: 2, color: "text.secondary" }}>
              {isLive ? "No booths available" : "Career Fair Not Live"}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {isLive
                ? "Companies are setting up their booths. Check back soon!"
                : "The career fair is not currently live. You can only view and edit your own booth."}
            </Typography>
          </Card>
        )}
        {!loading && booths.length > 0 && (
          <>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: "#1a1a1a" }}>
              Company Booths
            </Typography>
            <Grid container spacing={3}>
              {booths.map((booth) => (
                <Grid size={{ xs: 12, md: 6, lg: 4 }} key={booth.id}>
                  <Card
                    sx={{
                      height: "100%",
                      border: "1px solid rgba(56, 133, 96, 0.3)",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
                      },
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>
                      {/* Company Logo & Name */}
                      <Box sx={{ display: "flex", alignItems: "start", gap: 2, mb: 2 }}>
                        {booth.logoUrl ? (
                          <Box
                            component="img"
                            src={booth.logoUrl}
                            alt={`${booth.companyName} logo`}
                            sx={{
                              width: 64,
                              height: 64,
                              borderRadius: 2,
                              objectFit: "cover",
                              border: "1px solid rgba(0,0,0,0.1)",
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: 64,
                              height: 64,
                              borderRadius: 2,
                              background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <BusinessIcon sx={{ fontSize: 32, color: "#388560" }} />
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.2 }}>
                            {booth.companyName}
                          </Typography>
                          <Chip
                            label={INDUSTRY_LABELS[booth.industry] || booth.industry}
                            size="small"
                            sx={{
                              bgcolor: "rgba(56, 133, 96, 0.1)",
                              color: "#388560",
                              fontWeight: 500,
                              fontSize: "0.75rem",
                            }}
                          />
                        </Box>
                      </Box>

                      {/* Description */}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 2,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          minHeight: 40,
                        }}
                      >
                        {booth.description}
                      </Typography>

                      {/* Details */}
                      <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <LocationOnIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                          <Typography variant="body2" color="text.secondary">
                            {booth.location}
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <PeopleIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                          <Typography variant="body2" color="text.secondary">
                            {booth.companySize} employees
                          </Typography>
                        </Box>
                      </Box>

                      {/* Open Positions Badge & Button */}
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          pt: 2,
                          borderTop: "1px solid rgba(0,0,0,0.1)",
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, color: "#388560" }}>
                          {getJobCountForBooth(booth)} open position{getJobCountForBooth(booth) === 1 ? "" : "s"}
                        </Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          endIcon={<ArrowForwardIcon />}
                          onClick={() => navigate(`/booth/${booth.id}`)}
                          sx={{
                            borderColor: "#388560",
                            color: "#388560",
                            "&:hover": {
                              borderColor: "#2d6b4d",
                              bgcolor: "rgba(56, 133, 96, 0.05)",
                            },
                          }}
                        >
                          Visit Booth
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Container>
    </Box>
  )
}

