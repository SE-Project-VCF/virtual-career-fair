import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  TextField,
  Autocomplete,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
} from "@mui/material"
import DeleteIcon from "@mui/icons-material/Delete"
import AddIcon from "@mui/icons-material/Add"
import EditIcon from "@mui/icons-material/Edit"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import RefreshIcon from "@mui/icons-material/Refresh"
import BaseLayout from "../components/BaseLayout"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import { API_URL } from "../config"
import { useGeocodeSuggest } from "../hooks/useGeocodeSuggest"

type FairAnnouncementRow = {
  id: string
  fairId: string
  fairName: string | null
  title: string
  description: string
  published: boolean
  publishedAt: number | null
  createdAt: number | null
  updatedAt: number | null
  createdBy: string | null
}

function formatSavedHubLine(fair: {
  venueCity?: string | null
  venueState?: string | null
  venueZip?: string | null
  venueCountry?: string | null
}): string | null {
  const c = fair.venueCity?.trim()
  const s = fair.venueState?.trim()
  const z = fair.venueZip?.trim()
  const parts = [c, s].filter(Boolean).join(", ")
  if (!parts && !z) return null
  const line = [parts, z].filter(Boolean).join(" ")
  const country = fair.venueCountry?.trim()
  if (country) return `${line} · ${country}`
  return line
}

export default function FairAdminDashboard() {
  const navigate = useNavigate()
  const { fair, setFair, isLive, loading: fairLoading, fairId } = useFair()
  const user = authUtils.getCurrentUser()

  const [toggling, setToggling] = useState(false)
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Add company dialog
  type CompanySearchResult = {
    companyId: string
    companyName: string
    logoUrl: string | null
    industry: string | null
    primaryLocation: string | null
    alreadyEnrolled: boolean
  }
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [companyQuery, setCompanyQuery] = useState("")
  const [companyOptions, setCompanyOptions] = useState<CompanySearchResult[]>([])
  const [companySearchLoading, setCompanySearchLoading] = useState(false)
  const [companySearchError, setCompanySearchError] = useState("")
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

  // Edit fair dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    startTime: "",
    endTime: "",
  })
  const [hubPicked, setHubPicked] = useState<{
    city: string
    state: string
    zip: string
  } | null>(null)
  const [hubSearchInput, setHubSearchInput] = useState("")
  const [savedHubLabel, setSavedHubLabel] = useState<string | null>(null)
  const [hubRemoved, setHubRemoved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hubDirty, setHubDirty] = useState(false)

  const { options: hubSuggestOptions, loading: hubSuggestLoading } = useGeocodeSuggest(
    hubSearchInput,
    editDialogOpen,
  )

  const [codeCopied, setCodeCopied] = useState(false)
  const [refreshingInviteCode, setRefreshingInviteCode] = useState(false)

  const [announcements, setAnnouncements] = useState<FairAnnouncementRow[]>([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)
  const [annDialogOpen, setAnnDialogOpen] = useState(false)
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null)
  const [annForm, setAnnForm] = useState({ title: "", description: "", published: false })
  const [annSaving, setAnnSaving] = useState(false)
  const [annError, setAnnError] = useState("")
  const [publishingAnnId, setPublishingAnnId] = useState<string | null>(null)

  useEffect(() => {
    if (user?.role !== "administrator") {
      navigate("/dashboard")
      return
    }
    if (!fairLoading && fairId) {
      loadEnrollments()
      loadAnnouncements()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fairLoading, fairId, navigate])

  useEffect(() => {
    if (fair && !editDialogOpen) {
      setEditForm({
        name: fair.name || "",
        description: fair.description || "",
        startTime: fair.startTime ? toLocalDatetime(fair.startTime) : "",
        endTime: fair.endTime ? toLocalDatetime(fair.endTime) : "",
      })
    }
  }, [fair, editDialogOpen])

  useEffect(() => {
    if (!addDialogOpen) return
    const trimmed = companyQuery.trim()
    if (trimmed.length < 2) {
      setCompanyOptions([])
      setCompanySearchError("")
      setCompanySearchLoading(false)
      return
    }

    let cancelled = false
    setCompanySearchLoading(true)
    setCompanySearchError("")

    const timer = setTimeout(async () => {
      try {
        const token = await getToken()
        const url = `${API_URL}/api/companies/search?q=${encodeURIComponent(trimmed)}&fairId=${encodeURIComponent(fairId || "")}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setCompanyOptions([])
          setCompanySearchError(data.error || "Search failed — try again")
          return
        }
        setCompanyOptions(data.results || [])
      } catch {
        if (!cancelled) {
          setCompanyOptions([])
          setCompanySearchError("Search failed — try again")
        }
      } finally {
        if (!cancelled) setCompanySearchLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [companyQuery, addDialogOpen, fairId])

  function toLocalDatetime(ms: number): string {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const openEditDialog = () => {
    if (fair) {
      setEditForm({
        name: fair.name || "",
        description: fair.description || "",
        startTime: fair.startTime ? toLocalDatetime(fair.startTime) : "",
        endTime: fair.endTime ? toLocalDatetime(fair.endTime) : "",
      })
      setSavedHubLabel(formatSavedHubLine(fair))
    }
    setHubPicked(null)
    setHubSearchInput("")
    setHubRemoved(false)
    setHubDirty(false)
    setEditDialogOpen(true)
  }

  const getToken = () => auth.currentUser?.getIdToken()

  const loadEnrollments = async () => {
    try {
      setLoadingEnrollments(true)
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enrollments`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to load enrollments")
      const data = await res.json()
      setEnrollments(data.enrollments || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingEnrollments(false)
    }
  }

  const loadAnnouncements = async () => {
    if (!fairId) return
    try {
      setLoadingAnnouncements(true)
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to load announcements")
      const data = await res.json()
      setAnnouncements(data.announcements || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingAnnouncements(false)
    }
  }

  const openCreateAnnouncement = () => {
    setEditingAnnId(null)
    setAnnForm({ title: "", description: "", published: false })
    setAnnError("")
    setAnnDialogOpen(true)
  }

  const openEditAnnouncement = (row: FairAnnouncementRow) => {
    setEditingAnnId(row.id)
    setAnnForm({
      title: row.title,
      description: row.description,
      published: row.published,
    })
    setAnnError("")
    setAnnDialogOpen(true)
  }

  const submitAnnouncement = async (mode: "create-draft" | "create-publish" | "save-edit") => {
    if (!fairId || !annForm.title.trim()) {
      setAnnError("Title is required")
      return
    }
    let published = annForm.published
    if (mode === "create-publish") published = true
    if (mode === "create-draft") published = false

    setAnnSaving(true)
    setAnnError("")
    try {
      const token = await getToken()
      const body: Record<string, unknown> = {
        title: annForm.title.trim(),
        published,
      }
      const desc = annForm.description.trim()
      if (desc) body.description = desc
      else if (editingAnnId) body.description = ""

      if (editingAnnId) {
        const res = await fetch(`${API_URL}/api/fairs/${fairId}/announcements/${editingAnnId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to update announcement")
      } else {
        const res = await fetch(`${API_URL}/api/fairs/${fairId}/announcements`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: annForm.title.trim(),
            ...(desc ? { description: desc } : {}),
            published,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to create announcement")
      }
      setAnnDialogOpen(false)
      setSuccess(editingAnnId ? "Announcement updated" : "Announcement saved")
      await loadAnnouncements()
    } catch (err: any) {
      setAnnError(err.message || "Save failed")
    } finally {
      setAnnSaving(false)
    }
  }

  const handleDeleteAnnouncement = async (announcementId: string) => {
    if (!fairId) return
    if (!globalThis.confirm("Delete this announcement?")) return
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/announcements/${announcementId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to delete")
      setSuccess("Announcement deleted")
      await loadAnnouncements()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handlePublishAnnouncement = async (row: FairAnnouncementRow) => {
    if (!fairId || row.published) return
    setPublishingAnnId(row.id)
    setError("")
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/announcements/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ published: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to publish")
      setSuccess("Announcement published")
      await loadAnnouncements()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPublishingAnnId(null)
    }
  }

  const handleToggleLive = async () => {
    setToggling(true)
    setError("")
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/toggle-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user?.uid }),
      })
      if (!res.ok) throw new Error("Failed to toggle status")
      globalThis.location.reload()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setToggling(false)
    }
  }

  const handleSaveFair = async () => {
    setSaving(true)
    setError("")
    try {
      const token = await getToken()
      const payload: Record<string, unknown> = {
        userId: user?.uid,
        name: editForm.name,
        description: editForm.description,
        startTime: editForm.startTime ? new Date(editForm.startTime).toISOString() : null,
        endTime: editForm.endTime ? new Date(editForm.endTime).toISOString() : null,
      }
      if (hubDirty) {
        const fromPick =
          hubPicked &&
          (hubPicked.city.trim() || hubPicked.state.trim() || hubPicked.zip.trim())
        if (fromPick) {
          payload.venueCity = hubPicked.city.trim()
          payload.venueState = hubPicked.state.trim()
          payload.venueZip = hubPicked.zip.trim()
        } else if (hubSearchInput.trim()) {
          payload.venueGeocodeQuery = hubSearchInput.trim()
        } else {
          payload.venueCity = ""
          payload.venueState = ""
          payload.venueZip = ""
        }
      }
      const res = await fetch(`${API_URL}/api/fairs/${fairId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let message = "Failed to update fair"
        try {
          const data = (await res.json()) as { error?: string }
          if (typeof data?.error === "string") message = data.error
        } catch {
          message = `API error: ${res.status}`
        }
        throw new Error(message)
      }
      setSuccess("Fair updated successfully")
      setEditDialogOpen(false)
      try {
        const refreshToken = await getToken()
        const fairRes = await fetch(`${API_URL}/api/fairs/${fairId}`, {
          headers: refreshToken ? { Authorization: `Bearer ${refreshToken}` } : {},
        })
        if (fairRes.ok) {
          const fairData = await fairRes.json()
          setFair(fairData)
        }
      } catch {
        /* PUT succeeded; refresh is best-effort */
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddCompany = async () => {
    if (!selectedCompany || selectedCompany.alreadyEnrolled) return
    setAdding(true)
    setAddError("")
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: selectedCompany.companyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add company")
      setAddDialogOpen(false)
      setCompanyQuery("")
      setSelectedCompany(null)
      setCompanyOptions([])
      setSuccess("Company enrolled successfully")
      loadEnrollments()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveCompany = async (companyId: string) => {
    if (!globalThis.confirm("Remove this company from the fair?")) return
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enrollments/${companyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to remove company")
      setSuccess("Company removed from fair")
      loadEnrollments()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleCopyCode = () => {
    if (fair?.inviteCode) {
      navigator.clipboard.writeText(fair.inviteCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  const handleRefreshInviteCode = async () => {
    if (!fairId || user?.role !== "administrator") return
    
    setRefreshingInviteCode(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/refresh-invite-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user?.uid }),
      })
      
      if (!res.ok) {
        const contentType = res.headers.get("content-type")
        let errorMessage = "Failed to refresh invite code"
        
        if (contentType?.includes("application/json")) {
          const errorData = await res.json()
          errorMessage = errorData.error || errorMessage
        } else {
          errorMessage = `API Error: ${res.status} ${res.statusText}`
        }
        throw new Error(errorMessage)
      }
      
      const data = await res.json()
      setFair(prev => prev ? { ...prev, inviteCode: data.inviteCode } : prev)
      setCodeCopied(false)
    } catch (err: any) {
      console.error("Error refreshing invite code:", err)
      setError(err.message || "Failed to refresh invite code")
    } finally {
      setRefreshingInviteCode(false)
    }
  }

  if (fairLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!fair) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error">Fair not found</Alert>
      </Container>
    )
  }

  return (
    <BaseLayout pageTitle={`Admin — ${fair.name}`}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Button variant="text" onClick={() => navigate("/admin")} sx={{ mb: 2 }}>
          ← Back to Admin
        </Button>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>{success}</Alert>}

        <Grid container spacing={3}>
          {/* Fair Status */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Fair Status</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                  <Chip label={isLive ? "Live" : "Offline"} color={isLive ? "success" : "default"} />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={isLive}
                        onChange={handleToggleLive}
                        disabled={toggling}
                        color="success"
                      />
                    }
                    label={isLive ? "Turn Offline" : "Go Live"}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {isLive
                    ? "Fair is live — all students can see booths."
                    : "Fair is offline — only company reps can see their own booth."}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Fair Invite Code */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Company Invite Code</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="h5"
                    fontFamily="monospace"
                    fontWeight="bold"
                    sx={{ letterSpacing: 4, flex: 1 }}
                  >
                    {fair.inviteCode ?? "—"}
                  </Typography>
                  <IconButton onClick={handleCopyCode} title="Copy code" size="small">
                    <ContentCopyIcon />
                  </IconButton>
                  <IconButton 
                    onClick={handleRefreshInviteCode} 
                    title="Generate new code" 
                    size="small" 
                    disabled={refreshingInviteCode}
                  >
                    <RefreshIcon sx={{ 
                      transition: "transform 0.6s linear",
                      transform: refreshingInviteCode ? "rotate(360deg)" : "rotate(0deg)",
                    }} />
                  </IconButton>
                </Box>
                {codeCopied && (
                  <Typography variant="caption" color="success.main">Copied!</Typography>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Share this code with companies so they can self-enroll in this fair.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Fair Details */}
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Typography variant="h6">Fair Details</Typography>
                  <Button variant="outlined" onClick={openEditDialog}>Edit</Button>
                </Box>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="body2" color="text.secondary">Name</Typography>
                    <Typography fontWeight="medium">{fair.name}</Typography>
                  </Grid>
                  {fair.description && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Description</Typography>
                      <Typography>{fair.description}</Typography>
                    </Grid>
                  )}
                  {fair.startTime && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Start</Typography>
                      <Typography>{new Date(fair.startTime).toLocaleString()}</Typography>
                    </Grid>
                  )}
                  {fair.endTime && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">End</Typography>
                      <Typography>{new Date(fair.endTime).toLocaleString()}</Typography>
                    </Grid>
                  )}
                  {(fair.venueCity || fair.venueState || fair.venueZip || fair.venueCountry) && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Fair Location</Typography>
                      <Typography fontWeight="medium">
                        {(() => {
                          const cityState = [fair.venueCity, fair.venueState].filter(Boolean).join(", ")
                          const zip = fair.venueZip?.trim()
                          const line = [cityState, zip].filter(Boolean).join(" ").trim()
                          return line || fair.venueCountry || "—"
                        })()}
                      </Typography>
                      {fair.venueCountry &&
                        (fair.venueCity || fair.venueState || fair.venueZip) && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {fair.venueCountry}
                          </Typography>
                        )}
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Fair announcements (employer banners) */}
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Typography variant="h6">Fair announcements</Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateAnnouncement}>
                    New announcement
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Published announcements appear as banners for company owners and representatives whose company is
                  enrolled in this fair.
                </Typography>
                {loadingAnnouncements && <CircularProgress size={24} />}
                {!loadingAnnouncements && announcements.length === 0 && (
                  <Typography color="text.secondary">No announcements yet.</Typography>
                )}
                {!loadingAnnouncements && announcements.length > 0 && (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Title</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {announcements.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell sx={{ fontWeight: 600, maxWidth: 220 }}>
                              {row.title}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 360 }}>
                              <Typography variant="body2" noWrap title={row.description || undefined}>
                                {row.description || "—"}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={row.published ? "Published" : "Draft"}
                                color={row.published ? "success" : "default"}
                                variant={row.published ? "filled" : "outlined"}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {!row.published ? (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="success"
                                    disabled={publishingAnnId === row.id}
                                    onClick={() => void handlePublishAnnouncement(row)}
                                  >
                                    {publishingAnnId === row.id ? "Publishing…" : "Publish"}
                                  </Button>
                                ) : null}
                                <IconButton size="small" onClick={() => openEditAnnouncement(row)} title="Edit">
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteAnnouncement(row.id)}
                                  title="Delete"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Enrolled Companies */}
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Typography variant="h6">
                    Enrolled Companies ({enrollments.length})
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddDialogOpen(true)}>
                    Add Company
                  </Button>
                </Box>

                {loadingEnrollments && <CircularProgress size={24} />}
                {!loadingEnrollments && enrollments.length === 0 && (
                  <Typography color="text.secondary">No companies enrolled yet.</Typography>
                )}
                {!loadingEnrollments && enrollments.length > 0 && (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Company</TableCell>
                          <TableCell>Enrolled</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {enrollments.map((enrollment) => (
                          <TableRow key={enrollment.id}>
                            <TableCell>{enrollment.companyName}</TableCell>
                            <TableCell>
                              {enrollment.enrolledAt?.seconds
                                ? new Date(enrollment.enrolledAt.seconds * 1000).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={enrollment.enrollmentMethod || "admin"}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveCompany(enrollment.id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* Edit Fair Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Fair Details</DialogTitle>
        <form
          onSubmit={e => {
            e.preventDefault()
            void handleSaveFair()
          }}
        >
          <DialogContent>
            <TextField
              label="Fair Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              fullWidth
              sx={{ mt: 1, mb: 2 }}
            />
            <TextField
              label="Description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Start Time"
              type="datetime-local"
              value={editForm.startTime}
              onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ mb: 2 }}
            />
            <TextField
              label="End Time"
              type="datetime-local"
              value={editForm.endTime}
              onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ mb: 2 }}
            />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Fair location (virtual hub)
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Search for a place, city, or ZIP. Pick a suggestion or type a query and save—the server verifies it with
              Mapbox. The saved hub appears as a chip below; remove it to clear. Saving after remove with nothing in the
              search box clears the hub.
            </Typography>
            {savedHubLabel &&
              !hubRemoved &&
              !hubPicked &&
              !hubSearchInput.trim() && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  Current location
                </Typography>
                <Chip
                  label={savedHubLabel}
                  onDelete={() => {
                    setHubRemoved(true)
                    setHubDirty(true)
                    setHubPicked(null)
                    setHubSearchInput("")
                  }}
                  color="secondary"
                  variant="outlined"
                />
              </Box>
            )}
            <Autocomplete
              freeSolo
              size="small"
              options={hubSuggestOptions}
              loading={hubSuggestLoading}
              filterOptions={(opts) => opts}
              getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
              isOptionEqualToValue={(a, b) =>
                typeof a === "object" &&
                typeof b === "object" &&
                Boolean(a.id && b.id && a.id === b.id)
              }
              inputValue={hubSearchInput}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === "reset") {
                  setHubSearchInput(newInputValue)
                  return
                }
                setHubSearchInput(newInputValue)
                if (reason === "input") {
                  setHubPicked(null)
                  setHubDirty(true)
                }
              }}
              onChange={(_, newValue) => {
                if (newValue && typeof newValue === "object" && "lat" in newValue) {
                  setHubPicked({
                    city: typeof newValue.city === "string" ? newValue.city : "",
                    state: typeof newValue.state === "string" ? newValue.state : "",
                    zip: typeof newValue.zip === "string" ? newValue.zip : "",
                  })
                  setHubSearchInput(
                    typeof newValue.label === "string" ? newValue.label : "",
                  )
                  setHubRemoved(false)
                  setHubDirty(true)
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search places"
                  placeholder="City, ZIP, or address — pick a suggestion or type and save"
                  sx={{ mb: 0 }}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving || !editForm.name.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Announcement create/edit */}
      <Dialog
        open={annDialogOpen}
        onClose={() => !annSaving && setAnnDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingAnnId ? "Edit announcement" : "New announcement"}</DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submitAnnouncement(editingAnnId ? "save-edit" : "create-publish")
          }}
        >
          <DialogContent>
            <TextField
              label="Title"
              value={annForm.title}
              onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))}
              fullWidth
              required
              sx={{ mt: 1, mb: 2 }}
            />
            <TextField
              label="Description (optional)"
              value={annForm.description}
              onChange={(e) => setAnnForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
              sx={{ mb: 2 }}
              placeholder="Add more context for employers…"
            />
            {editingAnnId ? (
              <FormControlLabel
                control={
                  <Switch
                    checked={annForm.published}
                    onChange={(e) => setAnnForm((f) => ({ ...f, published: e.target.checked }))}
                    color="success"
                  />
                }
                label={annForm.published ? "Published" : "Draft"}
              />
            ) : null}
            {annError ? <Alert severity="error" sx={{ mt: 1 }}>{annError}</Alert> : null}
          </DialogContent>
          <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button type="button" onClick={() => setAnnDialogOpen(false)} disabled={annSaving}>
              Cancel
            </Button>
            {editingAnnId ? (
              <Button
                type="submit"
                variant="contained"
                disabled={annSaving}
              >
                {annSaving ? "Saving…" : "Save changes"}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outlined"
                  disabled={annSaving}
                  onClick={() => void submitAnnouncement("create-draft")}
                >
                  Save draft
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  disabled={annSaving}
                  onClick={() => void submitAnnouncement("create-publish")}
                >
                  Publish
                </Button>
              </>
            )}
          </DialogActions>
        </form>
      </Dialog>

      {/* Add Company Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false)
          setCompanyQuery("")
          setSelectedCompany(null)
          setCompanyOptions([])
          setAddError("")
          setCompanySearchError("")
        }}
        maxWidth="sm"
        fullWidth
        transitionDuration={0}
      >
        <DialogTitle>Add Company to Fair</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Search for a company by name and select it from the list.
          </Typography>
          <Autocomplete
            options={companyOptions}
            value={selectedCompany}
            onChange={(_, value) => setSelectedCompany(value)}
            inputValue={companyQuery}
            onInputChange={(_, value) => setCompanyQuery(value)}
            loading={companySearchLoading}
            filterOptions={(opts) => opts}
            getOptionLabel={(opt) => opt.companyName}
            isOptionEqualToValue={(a, b) => a.companyId === b.companyId}
            getOptionDisabled={(opt) => opt.alreadyEnrolled}
            noOptionsText={
              companyQuery.trim().length < 2
                ? "Type at least 2 characters"
                : companySearchError || "No companies found"
            }
            renderOption={(props, option) => (
              <li {...props} key={option.companyId}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%" }}>
                  <Box
                    component="img"
                    src={option.logoUrl || ""}
                    alt=""
                    sx={{ width: 32, height: 32, borderRadius: 1, objectFit: "cover", bgcolor: "grey.200", flexShrink: 0 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden" }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{option.companyName}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {option.alreadyEnrolled
                        ? "Already enrolled in this fair"
                        : [option.industry, option.primaryLocation].filter(Boolean).join(" • ") || "—"}
                    </Typography>
                  </Box>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search company"
                placeholder="Start typing a company name"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {companySearchLoading ? <CircularProgress color="inherit" size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          {addError && <Alert severity="error" sx={{ mt: 2 }}>{addError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddDialogOpen(false)
              setCompanyQuery("")
              setSelectedCompany(null)
              setCompanyOptions([])
              setAddError("")
              setCompanySearchError("")
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddCompany}
            disabled={adding || !selectedCompany || selectedCompany.alreadyEnrolled}
          >
            {adding ? "Adding..." : "Add Company"}
          </Button>
        </DialogActions>
      </Dialog>
    </BaseLayout>
  )
}
