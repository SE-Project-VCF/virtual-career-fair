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
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { collection, getDocs, query, orderBy, where, doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import { API_URL } from "../config"
import BoothCardsSection from "../components/booths/BoothCardsSection"
import {
  FIRESTORE_IN_QUERY_LIMIT,
  type BoothCardItem,
} from "../components/booths/boothShared"
import BusinessIcon from "@mui/icons-material/Business"
import EventIcon from "@mui/icons-material/Event"
import WorkIcon from "@mui/icons-material/Work"
import BaseLayout from "../components/BaseLayout"

type Booth = BoothCardItem & {
  openPositions: number
  hiringFor?: string
  website?: string
  careersPage?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
}

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

      // Check if any fair is live
      let fairIsLive = false
      let activeFairName: string | null = null
      let activeFairDescription: string | null = null
      try {
        const fairsRes = await fetch(`${API_URL}/api/fairs`)
        if (fairsRes.ok) {
          const fairsData = await fairsRes.json()
          const fairs: Array<{ isLive: boolean; name: string; description: string | null }> = fairsData.fairs || []
          const activeFair = fairs.find((f) => f.isLive)
          fairIsLive = !!activeFair
          activeFairName = activeFair?.name ?? null
          activeFairDescription = activeFair?.description ?? null
        }
      } catch (err) {
        console.error("Error fetching fairs:", err)
      }
      setIsLive(fairIsLive)
      setScheduleName(activeFairName)
      setScheduleDescription(activeFairDescription)

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
  const getJobCountForBooth = (booth: BoothCardItem): number => {
    if (booth.companyId) {
      return jobCounts[booth.companyId] || 0
    }
    return 0
  }

  return (
    <BaseLayout pageTitle="Browse Booths">
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
        {!loading && (
          <BoothCardsSection
            booths={booths}
            getJobCountForBooth={getJobCountForBooth}
            onVisitBooth={(boothId) => navigate(`/booth/${boothId}`)}
          />
        )}
      </Container>
    </BaseLayout>
  )
}

