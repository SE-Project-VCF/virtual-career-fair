import { useEffect, useState } from "react"
import type React from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Select,
  Typography,
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import AssignmentIcon from "@mui/icons-material/Assignment"
import DescriptionIcon from "@mui/icons-material/Description"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import ChatIcon from "@mui/icons-material/Chat"
import { auth, db } from "../firebase"
import { doc, getDoc } from "firebase/firestore"
import { authUtils } from "../utils/auth"
import { API_URL } from "../config"
import ProfileMenu from "./ProfileMenu"
import type { ApplicationForm } from "../types/applicationForm"

interface Submission {
  id: string
  jobId: string
  companyId: string
  studentId: string
  responses: Record<string, string | string[] | boolean | null>
  fileUrls?: Record<string, string>
  attachedResumePath?: string
  attachedResumeFileName?: string
  submittedAt: number
}

interface Job {
  id: string
  name: string
  applicationForm?: ApplicationForm
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

function renderResponseValue(value: string | string[] | boolean | null): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—"
  return String(value) || "—"
}

function SubmissionCard({ submission, form, studentName }: { submission: Submission; form?: ApplicationForm; studentName?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const navigate = useNavigate()

  const handleChat = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate("/dashboard/chat", { state: { repId: submission.studentId } })
  }

  const handleViewResume = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      setResumeLoading(true)
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/applicant-resume-url/${submission.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to get resume URL")
      }
      const { url } = await res.json()
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err: any) {
      console.error("Error fetching resume URL:", err)
    } finally {
      setResumeLoading(false)
    }
  }

  return (
    <Box
      sx={{
        border: "1px solid rgba(56, 133, 96, 0.2)",
        borderRadius: 1,
        mb: 1,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.25,
          cursor: "pointer",
          bgcolor: "rgba(56, 133, 96, 0.04)",
          "&:hover": { bgcolor: "rgba(56, 133, 96, 0.08)" },
        }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Box>
          {studentName && (
            <Typography variant="body2" fontWeight={600} color="text.primary">
              {studentName}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            ID: {submission.studentId}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Submitted: {formatDate(submission.submittedAt)}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <IconButton
            size="small"
            onClick={handleChat}
            title="Chat with applicant"
            sx={{ color: "#388560", mr: 0.5 }}
          >
            <ChatIcon fontSize="small" />
          </IconButton>
          <IconButton size="small">
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, py: 1.5 }}>
          {submission.attachedResumePath && (
            <Box sx={{ mb: 1.5 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DescriptionIcon fontSize="small" />}
                onClick={handleViewResume}
                disabled={resumeLoading}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": { borderColor: "#2d6b4d", color: "#2d6b4d", bgcolor: "rgba(56,133,96,0.06)" },
                }}
              >
                {resumeLoading
                  ? "Loading..."
                  : submission.attachedResumeFileName
                    ? `View Resume (${submission.attachedResumeFileName})`
                    : "View Resume"}
              </Button>
              <Divider sx={{ mt: 1.5 }} />
            </Box>
          )}
          {form && form.fields.length > 0 ? (
            form.fields.map((field) => {
              const value = submission.responses?.[field.id]
              const fileUrl = submission.fileUrls?.[field.id]
              return (
                <Box key={field.id} sx={{ mb: 1.25 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {field.label}
                    {field.required && (
                      <Typography component="span" color="error" variant="caption">
                        {" "}*
                      </Typography>
                    )}
                  </Typography>
                  {field.type === "file" ? (
                    fileUrl ? (
                      <Box>
                        <Link href={fileUrl} target="_blank" rel="noopener noreferrer" variant="body2">
                          View uploaded file
                        </Link>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No file uploaded
                      </Typography>
                    )
                  ) : (
                    <Typography variant="body2" color="text.primary" sx={{ mt: 0.25 }}>
                      {renderResponseValue(value ?? null)}
                    </Typography>
                  )}
                </Box>
              )
            })
          ) : (
            <Box>
              {Object.entries(submission.responses ?? {}).map(([key, val]) => (
                <Box key={key} sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {key}
                  </Typography>
                  <Typography variant="body2">{renderResponseValue(val)}</Typography>
                </Box>
              ))}
              {submission.fileUrls &&
                Object.entries(submission.fileUrls).map(([key, url]) => (
                  <Box key={key} sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {key} (file)
                    </Typography>
                    <Box>
                      <Link href={url} target="_blank" rel="noopener noreferrer" variant="body2">
                        View uploaded file
                      </Link>
                    </Box>
                  </Box>
                ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

export default function SubmissionsPage() {
  const navigate = useNavigate()
  const { companyId } = useParams<{ companyId: string }>()

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [studentNames, setStudentNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterJobId, setFilterJobId] = useState<string>("all")

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }
    if (!companyId) return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError("")

        const token = await auth.currentUser?.getIdToken()
        const headers = { Authorization: `Bearer ${token}` }

        const [jobsRes, subsRes] = await Promise.all([
          fetch(`${API_URL}/api/jobs?companyId=${companyId}`),
          fetch(`${API_URL}/api/companies/${companyId}/submissions`, { headers }),
        ])

        if (!subsRes.ok) {
          const data = await subsRes.json()
          throw new Error(data.error || "Failed to load submissions.")
        }

        const jobsData = jobsRes.ok ? await jobsRes.json() : { jobs: [] }
        const subsData = await subsRes.json()

        const fetchedSubmissions: Submission[] = subsData.submissions ?? []
        setJobs(jobsData.jobs ?? [])
        setSubmissions(fetchedSubmissions)

        // Batch-fetch names for all unique student IDs
        const uniqueIds = [...new Set(fetchedSubmissions.map((s) => s.studentId))]
        const nameEntries = await Promise.all(
          uniqueIds.map(async (uid) => {
            try {
              const snap = await getDoc(doc(db, "users", uid))
              if (!snap.exists()) return [uid, uid] as [string, string]
              const d = snap.data()
              const name =
                d.firstName && d.lastName
                  ? `${d.firstName} ${d.lastName}`
                  : d.firstName || d.email || uid
              return [uid, name] as [string, string]
            } catch {
              return [uid, uid] as [string, string]
            }
          })
        )
        setStudentNames(Object.fromEntries(nameEntries))
      } catch (err: any) {
        console.error("Error fetching submissions:", err)
        setError(err?.message || "Failed to load submissions.")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [companyId, navigate])

  const filteredSubmissions =
    filterJobId === "all" ? submissions : submissions.filter((s) => s.jobId === filterJobId)

  const jobMap = new Map(jobs.map((j) => [j.id, j]))

  const grouped = filteredSubmissions.reduce<Record<string, Submission[]>>((acc, sub) => {
    const key = sub.jobId
    if (!acc[key]) acc[key] = []
    acc[key].push(sub)
    return acc
  }, {})

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
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
              <IconButton onClick={() => navigate(`/company/${companyId}`)} sx={{ color: "white" }}>
                <ArrowBackIcon />
              </IconButton>
              <AssignmentIcon sx={{ fontSize: 32, color: "white" }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
                Application Submissions
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: "#388560" }} />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <>
            {/* Filter */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 3,
                p: 2,
                bgcolor: "white",
                borderRadius: 1,
                border: "1px solid rgba(0,0,0,0.08)",
              }}
            >
              <Typography variant="body2" color="text.secondary" flexShrink={0}>
                Filter by job:
              </Typography>
              <Select
                size="small"
                value={filterJobId}
                onChange={(e) => setFilterJobId(e.target.value)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="all">All jobs</MenuItem>
                {jobs.map((j) => (
                  <MenuItem key={j.id} value={j.id}>
                    {j.name}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
                {filteredSubmissions.length} submission{filteredSubmissions.length !== 1 ? "s" : ""}
              </Typography>
            </Box>

            {filteredSubmissions.length === 0 ? (
              <Box
                sx={{
                  textAlign: "center",
                  py: 8,
                  bgcolor: "white",
                  borderRadius: 1,
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <AssignmentIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                <Typography color="text.secondary">No submissions yet.</Typography>
                <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
                  Publish an application form on a job to start receiving submissions.
                </Typography>
              </Box>
            ) : (
              Object.entries(grouped).map(([jobId, jobSubs]) => {
                const job = jobMap.get(jobId)
                return (
                  <Box
                    key={jobId}
                    sx={{
                      mb: 3,
                      bgcolor: "white",
                      borderRadius: 1,
                      border: "1px solid rgba(0,0,0,0.08)",
                      p: 2,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={700} color="#388560">
                        {job?.name ?? jobId}
                      </Typography>
                      <Chip
                        label={`${jobSubs.length} submission${jobSubs.length !== 1 ? "s" : ""}`}
                        size="small"
                      />
                    </Box>
                    <Divider sx={{ mb: 1.5 }} />
                    {jobSubs.map((sub) => (
                      <SubmissionCard
                        key={sub.id}
                        submission={sub}
                        form={job?.applicationForm}
                        studentName={studentNames[sub.studentId]}
                      />
                    ))}
                  </Box>
                )
              })
            )}
          </>
        )}
      </Container>
    </Box>
  )
}
