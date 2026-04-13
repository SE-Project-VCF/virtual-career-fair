import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Pagination,
} from "@mui/material"
import WorkIcon from "@mui/icons-material/Work"
import BusinessIcon from "@mui/icons-material/Business"
import SearchIcon from "@mui/icons-material/Search"
import LaunchIcon from "@mui/icons-material/Launch"
import BaseLayout from "../components/BaseLayout"
import { API_URL } from "../config"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"

const PAGE_SIZE = 20

interface SearchJob {
  id: string
  companyId: string
  companyName: string
  name: string
  description: string
  majorsAssociated: string
  applicationLink: string | null
  locationIsRemote?: boolean
  locationCity?: string | null
  locationState?: string | null
  location?: string | null
}

function formatJobLocation(job: SearchJob): string {
  if (job.locationIsRemote === true) return "Remote"
  if (job.locationCity || job.locationState) {
    return job.location || [job.locationCity, job.locationState].filter(Boolean).join(", ")
  }
  if (job.location) return job.location
  return "—"
}

export default function JobSearchPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [skill, setSkill] = useState("")
  const [location, setLocation] = useState("")
  const [jobs, setJobs] = useState<SearchJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const fetchJobsRef = useRef<(pageNum: number) => Promise<void>>(async () => {})

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
    }
  }, [navigate])

  const fetchJobs = useCallback(
    async (pageNum: number) => {
      if (!auth.currentUser) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError("")
      try {
        const token = await auth.currentUser.getIdToken()
        const params = new URLSearchParams()
        if (q.trim()) params.set("q", q.trim())
        if (skill.trim()) params.set("skill", skill.trim())
        if (location.trim()) params.set("location", location.trim())
        params.set("page", String(pageNum))
        params.set("limit", String(PAGE_SIZE))
        const url = `${API_URL}/api/jobs/search?${params.toString()}`
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error((data as { error?: string }).error || "Search failed")
        }
        const payload = data as {
          jobs?: SearchJob[]
          total?: number
          page?: number
          pageSize?: number
        }
        setJobs(payload.jobs || [])
        setTotal(typeof payload.total === "number" ? payload.total : 0)
        setPage(typeof payload.page === "number" ? payload.page : pageNum)
        if (typeof payload.pageSize === "number") setPageSize(payload.pageSize)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed")
        setJobs([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [q, skill, location]
  )

  fetchJobsRef.current = fetchJobs

  useEffect(() => {
    if (!authUtils.isAuthenticated()) return

    let cancelled = false

    const waitForUser = () =>
      new Promise<void>((resolve) => {
        if (auth.currentUser) {
          resolve()
          return
        }
        const unsub = auth.onAuthStateChanged((u) => {
          if (u) {
            unsub()
            resolve()
          }
        })
      })

    void (async () => {
      await waitForUser()
      if (cancelled || !auth.currentUser) return
      await fetchJobsRef.current(1)
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  const handleSearch = () => {
    setPage(1)
    void fetchJobs(1)
  }

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value)
    void fetchJobs(value)
  }

  const hasActiveFilters = Boolean(q.trim() || skill.trim() || location.trim())
  const totalPages = Math.max(1, Math.ceil(total / (pageSize || PAGE_SIZE)))

  return (
    <BaseLayout pageTitle="Job search">
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <WorkIcon sx={{ color: "#388560" }} />
          Search jobs
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Browse all company postings below (newest first). Use keyword, skill, or location to narrow results—try
          &quot;remote&quot; in the location field for remote roles.
        </Typography>

        <Card sx={{ mb: 3, border: "1px solid rgba(56, 133, 96, 0.25)" }}>
          <CardContent>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr) auto" },
                gap: 2,
                alignItems: "flex-start",
              }}
            >
              <TextField
                fullWidth
                size="small"
                label="Keyword"
                placeholder="Job title or description"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                label="Skill"
                placeholder="e.g. Python"
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                label="Location"
                placeholder="City, state, or remote"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
                onClick={handleSearch}
                disabled={loading}
                sx={{
                  height: 40,
                  alignSelf: { xs: "stretch", md: "center" },
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                }}
              >
                Search
              </Button>
            </Box>
          </CardContent>
        </Card>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!error && !loading && total > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} job
            {total === 1 ? "" : "s"}
            {hasActiveFilters ? " (filtered)" : ""}
          </Typography>
        )}

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && !error && total === 0 && (
          <Typography color="text.secondary">
            {hasActiveFilters ? "No jobs matched your filters." : "No job postings are available yet."}
          </Typography>
        )}

        {!loading && jobs.length > 0 && (
          <>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {jobs.map((job) => (
                <Card key={job.id} sx={{ border: "1px solid rgba(56, 133, 96, 0.2)" }}>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                      <Box sx={{ flex: 1, minWidth: 240 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                          {job.name}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}
                        >
                          <BusinessIcon sx={{ fontSize: 18 }} />
                          {job.companyName || "Company"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          <strong>Location:</strong> {formatJobLocation(job)}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1, whiteSpace: "pre-wrap" }}>
                          {job.description.length > 280 ? `${job.description.slice(0, 280)}…` : job.description}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: "#388560", mb: 0.5 }}>
                          Skills
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {job.majorsAssociated}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
                        {job.applicationLink && (
                          <Button
                            component="a"
                            href={job.applicationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="contained"
                            size="small"
                            startIcon={<LaunchIcon />}
                            sx={{
                              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                              fontWeight: 600,
                            }}
                          >
                            Apply
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>

            {totalPages > 1 && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={handlePageChange}
                  color="primary"
                  size="large"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
          </>
        )}
      </Container>
    </BaseLayout>
  )
}
