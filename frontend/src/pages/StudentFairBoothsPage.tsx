import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
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
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import { authUtils } from "../utils/auth"
import BoothCardsSection from "../components/booths/BoothCardsSection"
import {
  FIRESTORE_IN_QUERY_LIMIT,
  type BoothCardItem,
} from "../components/booths/boothShared"
import BusinessIcon from "@mui/icons-material/Business"
import WorkIcon from "@mui/icons-material/Work"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ProfileMenu from "./ProfileMenu"
import NotificationBell from "../components/NotificationBell"

type Booth = BoothCardItem & { openPositions: number }

function toMillis(ts: unknown): number {
  if (ts && typeof ts === "object" && "toMillis" in (ts as Record<string, unknown>)) {
    return (ts as { toMillis: () => number }).toMillis()
  }
  return Number(ts)
}

export default function StudentFairBoothsPage() {
  const { fairId } = useParams<{ fairId: string }>()
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [fairName, setFairName] = useState("")
  const [fairDescription, setFairDescription] = useState("")
  const [booths, setBooths] = useState<Booth[]>([])
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({})
  const [totalJobs, setTotalJobs] = useState(0)
  const [statusMessage, setStatusMessage] = useState("")

  useEffect(() => {
    loadFairBooths()
  }, [fairId])

  const fetchJobCounts = async (companyIds: string[]) => {
    try {
      if (companyIds.length === 0) return

      const counts: Record<string, number> = {}
      let total = 0

      const batches: string[][] = []
      for (let i = 0; i < companyIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
        batches.push(companyIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT))
      }

      for (const batch of batches) {
        const q = query(collection(db, "jobs"), where("companyId", "in", batch))
        const jobsSnapshot = await getDocs(q)
        jobsSnapshot.forEach((d) => {
          const companyId = d.data().companyId
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

  const loadFairBooths = async () => {
    try {
      setLoading(true)
      setError("")
      setStatusMessage("")

      if (!fairId) {
        setError("Fair not found")
        setLoading(false)
        return
      }

      const fairDoc = await getDoc(doc(db, "fairSchedules", fairId))

      if (!fairDoc.exists()) {
        setError("Fair not found")
        setLoading(false)
        return
      }

      const fairData = fairDoc.data()
      const name = fairData.name || ""
      const description = fairData.description || ""
      const startTime = toMillis(fairData.startTime)
      const endTime = toMillis(fairData.endTime)
      const registeredBoothIds: string[] = fairData.registeredBoothIds || []

      setFairName(name)
      setFairDescription(description)

      const now = Date.now()

      if (now < startTime) {
        const startDate = new Date(startTime)
        setStatusMessage(
          `This fair isn't live yet — starts at ${startDate.toLocaleString()}`
        )
        setLoading(false)
        return
      }

      if (now > endTime) {
        setStatusMessage("This fair has ended")
        setLoading(false)
        return
      }

      // Fair is live
      if (registeredBoothIds.length === 0) {
        setStatusMessage("No companies have registered for this fair yet.")
        setLoading(false)
        return
      }

      // Fetch booth docs
      const boothDocs = await Promise.all(
        registeredBoothIds.map((id) => getDoc(doc(db, "booths", id)))
      )

      // Fetch companies to map boothId -> companyId
      const companiesSnapshot = await getDocs(collection(db, "companies"))
      const boothIdToCompanyId: Record<string, string> = {}
      companiesSnapshot.forEach((companyDoc) => {
        const companyData = companyDoc.data()
        if (companyData.boothId) {
          boothIdToCompanyId[companyData.boothId] = companyDoc.id
        }
      })

      const boothsList: Booth[] = []
      boothDocs.forEach((boothDoc) => {
        if (!boothDoc.exists()) return
        const boothData = boothDoc.data()
        const companyId =
          boothData.companyId || boothIdToCompanyId[boothDoc.id] || undefined
        boothsList.push({
          id: boothDoc.id,
          ...boothData,
          companyId,
        } as Booth)
      })

      setBooths(boothsList)

      // Fetch job counts
      const companyIds = boothsList
        .map((b) => b.companyId)
        .filter((id): id is string => !!id)
      fetchJobCounts([...new Set(companyIds)])
    } catch (err) {
      console.error("Error loading fair booths:", err)
      setError("Failed to load fair booths")
    } finally {
      setLoading(false)
    }
  }

  const getJobCountForBooth = (booth: BoothCardItem): number => {
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate("/dashboard")}
                sx={{
                  color: "white",
                  borderColor: "white",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
                }}
              >
                Dashboard
              </Button>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
                  {fairName || "Career Fair"}
                </Typography>
                <Typography variant="body1" sx={{ color: "rgba(255,255,255,0.9)", mt: 0.5 }}>
                  Explore opportunities from participating companies
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {user && <NotificationBell />}
              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Loading */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error */}
        {!loading && error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Status message (not live yet / ended / no booths) */}
        {!loading && !error && statusMessage && (
          <Card sx={{ textAlign: "center", p: 6, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
            <BusinessIcon sx={{ fontSize: 80, color: "#ccc", mb: 2 }} />
            <Typography variant="h5" sx={{ mb: 2, color: "text.secondary" }}>
              {statusMessage}
            </Typography>
          </Card>
        )}

        {/* Fair description banner */}
        {!loading && !error && !statusMessage && fairDescription && (
          <Alert
            severity="success"
            sx={{
              mb: 4,
              borderRadius: 2,
              bgcolor: "rgba(56, 133, 96, 0.1)",
              border: "1px solid rgba(56, 133, 96, 0.3)",
            }}
          >
            <Typography variant="body1">{fairDescription}</Typography>
          </Alert>
        )}

        {/* Stats Bar */}
        {!loading && !error && !statusMessage && (
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", height: "100%" }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 2,
                        background:
                          "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
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

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", height: "100%" }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 2,
                        background:
                          "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
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
          </Grid>
        )}

        {!loading && !error && !statusMessage && (
          <BoothCardsSection
            booths={booths}
            getJobCountForBooth={getJobCountForBooth}
            onVisitBooth={(boothId) => navigate(`/booth/${boothId}`)}
          />
        )}
      </Container>
    </Box>
  )
}
