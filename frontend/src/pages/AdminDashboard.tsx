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
  TextField,
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
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import EventIcon from "@mui/icons-material/Event"
import DeleteIcon from "@mui/icons-material/Delete"
import AddIcon from "@mui/icons-material/Add"
import ProfileMenu from "./ProfileMenu"
import { API_URL } from "../config"

/* -------------------------------------------------------
   Inline component: Manage Fairs panel for AdminDashboard
------------------------------------------------------- */
function FairsManagementPanel({ navigate }: Readonly<{ navigate: ReturnType<typeof useNavigate> }>) {
  const user = authUtils.getCurrentUser()
  const [fairs, setFairs] = useState<any[]>([])
  const [loadingFairs, setLoadingFairs] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: "", description: "", startTime: "", endTime: "" })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [togglingFairId, setTogglingFairId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState("")

  useEffect(() => {
    loadFairs()
  }, [])

  const loadFairs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fairs`)
      if (res.ok) {
        const data = await res.json()
        setFairs(data.fairs || [])
      }
    } finally {
      setLoadingFairs(false)
    }
  }

  const handleToggleLive = async (fairId: string) => {
    setTogglingFairId(fairId)
    setToggleError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/toggle-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user?.uid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to toggle")
      setFairs((prev) => prev.map((f) => f.id === fairId ? { ...f, isLive: data.isLive } : f))
    } catch (err: any) {
      setToggleError(err.message)
    } finally {
      setTogglingFairId(null)
    }
  }

  const handleCreateFair = async () => {
    if (!createForm.name.trim()) return
    setCreating(true)
    setCreateError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: user?.uid,
          name: createForm.name,
          description: createForm.description,
          startTime: createForm.startTime ? new Date(createForm.startTime).toISOString() : null,
          endTime: createForm.endTime ? new Date(createForm.endTime).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create fair")
      setCreateDialogOpen(false)
      setCreateForm({ name: "", description: "", startTime: "", endTime: "" })
      loadFairs()
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteFair = async (fairId: string, fairName: string) => {
    if (!globalThis.confirm(`Delete "${fairName}"? This will remove all booths and enrollments.`)) return
    try {
      const token = await auth.currentUser?.getIdToken()
      await fetch(`${API_URL}/api/fairs/${fairId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user?.uid }),
      })
      loadFairs()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <Card sx={{ border: "1px solid rgba(176, 58, 108, 0.3)", mb: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <EventIcon sx={{ fontSize: 40, color: "#b03a6c" }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>Manage Career Fairs</Typography>
              <Typography variant="body2" color="text.secondary">Create and manage multiple concurrent fairs</Typography>
            </Box>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}
            sx={{ background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)" }}>
            New Fair
          </Button>
        </Box>

        {toggleError && <Alert severity="error" sx={{ mb: 2 }}>{toggleError}</Alert>}

        {loadingFairs && <CircularProgress size={24} />}
        {!loadingFairs && fairs.length === 0 && (
          <Typography color="text.secondary">No fairs created yet. Create your first fair above.</Typography>
        )}
        {!loadingFairs && fairs.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fair Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Start</TableCell>
                  <TableCell>End</TableCell>
                  <TableCell>Live</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fairs.map((fair) => {
                  const now = Date.now()
                  let statusLabel: string
                  if (fair.isLive) {
                    statusLabel = "Live"
                  } else if (fair.startTime && now < fair.startTime) {
                    statusLabel = "Upcoming"
                  } else if (fair.endTime && now > fair.endTime) {
                    statusLabel = "Ended"
                  } else {
                    statusLabel = "Scheduled"
                  }
                  let chipColor: "success" | "default" | "warning"
                  if (fair.isLive) {
                    chipColor = "success"
                  } else if (statusLabel === "Ended") {
                    chipColor = "default"
                  } else {
                    chipColor = "warning"
                  }
                  return (
                    <TableRow key={fair.id}>
                      <TableCell>{fair.name}</TableCell>
                      <TableCell>
                        <Chip label={statusLabel} size="small" color={chipColor} />
                      </TableCell>
                      <TableCell>{fair.startTime ? new Date(fair.startTime).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>{fair.endTime ? new Date(fair.endTime).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        <Switch
                          checked={fair.isLive || false}
                          onChange={() => handleToggleLive(fair.id)}
                          disabled={togglingFairId === fair.id}
                          size="small"
                          sx={{
                            "& .MuiSwitch-switchBase.Mui-checked": { color: "#388560" },
                            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "#388560" },
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => navigate(`/fair/${fair.id}/admin`)} sx={{ mr: 1 }}>
                          Manage
                        </Button>
                        <IconButton size="small" onClick={() => handleDeleteFair(fair.id, fair.name)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Fair</DialogTitle>
        <DialogContent>
          <TextField label="Fair Name" value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            fullWidth required sx={{ mt: 1, mb: 2 }} />
          <TextField label="Description" value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            fullWidth multiline rows={2} sx={{ mb: 2 }} />
          <TextField label="Start Time" type="datetime-local" value={createForm.startTime}
            onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
            fullWidth slotProps={{ inputLabel: { shrink: true } }} sx={{ mb: 2 }} />
          <TextField label="End Time" type="datetime-local" value={createForm.endTime}
            onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })}
            fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateFair} disabled={creating || !createForm.name.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }
    if (user?.role !== "administrator") {
      navigate("/dashboard")
    }
  }, [navigate, user?.role])

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
              <AdminPanelSettingsIcon sx={{ fontSize: 32, color: "white" }} />
              <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
                Administrator Dashboard
              </Typography>
            </Box>
            <ProfileMenu />
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Multi-Fair Management */}
        <FairsManagementPanel navigate={navigate} />

        {/* Quick Actions */}
        <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#1a1a1a" }}>
              Quick Actions
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                onClick={() => navigate("/fairs")}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": { borderColor: "#2d6b4d", bgcolor: "rgba(56, 133, 96, 0.05)" },
                }}
              >
                View All Fairs
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate("/dashboard")}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": { borderColor: "#2d6b4d", bgcolor: "rgba(56, 133, 96, 0.05)" },
                }}
              >
                Go to Dashboard
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}
