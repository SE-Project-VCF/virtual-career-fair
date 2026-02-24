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
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import ProfileMenu from "./ProfileMenu"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import { API_URL } from "../config"


export default function FairAdminDashboard() {
  const navigate = useNavigate()
  const { fair, isLive, loading: fairLoading, fairId } = useFair()
  const user = authUtils.getCurrentUser()

  const [toggling, setToggling] = useState(false)
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Add company dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addCompanyId, setAddCompanyId] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

  // Edit fair dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: "", description: "", startTime: "", endTime: "" })
  const [saving, setSaving] = useState(false)

  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    if (user?.role !== "administrator") {
      navigate("/dashboard")
      return
    }
    if (!fairLoading && fairId) {
      loadEnrollments()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fairLoading, fairId, navigate])

  useEffect(() => {
    if (fair) {
      setEditForm({
        name: fair.name || "",
        description: fair.description || "",
        startTime: fair.startTime ? toLocalDatetime(fair.startTime) : "",
        endTime: fair.endTime ? toLocalDatetime(fair.endTime) : "",
      })
    }
  }, [fair])

  function toLocalDatetime(ms: number): string {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
      const res = await fetch(`${API_URL}/api/fairs/${fairId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: user?.uid,
          name: editForm.name,
          description: editForm.description,
          startTime: editForm.startTime ? new Date(editForm.startTime).toISOString() : null,
          endTime: editForm.endTime ? new Date(editForm.endTime).toISOString() : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update fair")
      }
      setSuccess("Fair updated successfully")
      setEditDialogOpen(false)
      globalThis.location.reload()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddCompany = async () => {
    if (!addCompanyId.trim()) return
    setAdding(true)
    setAddError("")
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: addCompanyId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add company")
      setAddDialogOpen(false)
      setAddCompanyId("")
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
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          bgcolor: "primary.main",
          color: "white",
          py: 2,
          px: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" fontWeight="bold">Admin — {fair.name}</Typography>
        <ProfileMenu />
      </Box>

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
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Typography
                    variant="h5"
                    fontFamily="monospace"
                    fontWeight="bold"
                    sx={{ letterSpacing: 4 }}
                  >
                    {fair.inviteCode ?? "—"}
                  </Typography>
                  <IconButton onClick={handleCopyCode} title="Copy code">
                    <ContentCopyIcon />
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
                  <Button variant="outlined" onClick={() => setEditDialogOpen(true)}>Edit</Button>
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
                </Grid>
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
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveFair} disabled={saving || !editForm.name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Company Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Company to Fair</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Enter the Firestore company ID to enroll them in this fair.
          </Typography>
          <TextField
            label="Company ID"
            value={addCompanyId}
            onChange={(e) => setAddCompanyId(e.target.value)}
            fullWidth
            placeholder="e.g. abc123def456"
          />
          {addError && <Alert severity="error" sx={{ mt: 2 }}>{addError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddDialogOpen(false); setAddCompanyId(""); setAddError("") }}>Cancel</Button>
          <Button variant="contained" onClick={handleAddCompany} disabled={adding || !addCompanyId.trim()}>
            {adding ? "Adding..." : "Add Company"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
