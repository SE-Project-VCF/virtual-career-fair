import { useState, useEffect, useMemo } from "react"
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
  Autocomplete,
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
  TableSortLabel,
  Paper,
  IconButton,
  Chip,
  InputAdornment,
  Badge,
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import EventIcon from "@mui/icons-material/Event"
import DeleteIcon from "@mui/icons-material/Delete"
import AddIcon from "@mui/icons-material/Add"
import SearchIcon from "@mui/icons-material/Search"
import ClearIcon from "@mui/icons-material/Clear"
import { API_URL } from "../config"
import BaseLayout from "../components/BaseLayout"
import { useGeocodeSuggest } from "../hooks/useGeocodeSuggest"

type FairStatus = "Live" | "Upcoming" | "Ended"
type SortColumn = "name" | "status" | "startTime" | "endTime"
type SortDirection = "asc" | "desc"

const getFairStatus = (fair: any): FairStatus => {
  const now = Date.now()
  if (fair.isLive) return "Live"
  if (fair.startTime && now < fair.startTime) return "Upcoming"
  return "Ended"
}

const STATUS_ORDER: Record<FairStatus, number> = { Live: 0, Upcoming: 1, Ended: 2 }

/* -------------------------------------------------------
   Inline component: Manage Fairs panel for AdminDashboard
------------------------------------------------------- */
function FairsManagementPanel({ navigate }: Readonly<{ navigate: ReturnType<typeof useNavigate> }>) {
  const user = authUtils.getCurrentUser()
  const [fairs, setFairs] = useState<any[]>([])
  const [loadingFairs, setLoadingFairs] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    startTime: "",
    endTime: "",
  })
  const [createHubSearch, setCreateHubSearch] = useState("")
  const [createPickedHub, setCreatePickedHub] = useState<{
    label: string
    city: string
    state: string
    zip: string
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [togglingFairId, setTogglingFairId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeStatuses, setActiveStatuses] = useState<Set<FairStatus>>(new Set(["Live", "Upcoming", "Ended"] as FairStatus[]))
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [sortColumn, setSortColumn] = useState<SortColumn>("status")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [pendingRequestCounts, setPendingRequestCounts] = useState<Record<string, number>>({})

  const totalPendingEnrollmentRequests = useMemo(
    () => Object.values(pendingRequestCounts).reduce((a, n) => a + n, 0),
    [pendingRequestCounts],
  )

  const toggleStatus = (status: FairStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  const clearFilters = () => {
    setSearchQuery("")
    setActiveStatuses(new Set(["Live", "Upcoming", "Ended"] as FairStatus[]))
    setDateFrom("")
    setDateTo("")
    setSortColumn("status")
    setSortDirection("asc")
  }

  const hasActiveFilters = searchQuery !== "" || activeStatuses.size < 3 || dateFrom !== "" || dateTo !== ""

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const filteredFairs = useMemo(() => {
    return fairs
      .filter((fair) => {
        const status = getFairStatus(fair)
        if (!activeStatuses.has(status)) return false
        if (searchQuery && !fair.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
        if (dateFrom) {
          const fromTs = new Date(dateFrom).getTime()
          if (!fair.startTime || fair.startTime < fromTs) return false
        }
        if (dateTo) {
          const toTs = new Date(dateTo).getTime() + 86400000 // end of day
          if (!fair.endTime || fair.endTime > toTs) return false
        }
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        switch (sortColumn) {
          case "name":
            cmp = (a.name || "").localeCompare(b.name || "")
            break
          case "status":
            cmp = STATUS_ORDER[getFairStatus(a)] - STATUS_ORDER[getFairStatus(b)]
            if (cmp === 0) cmp = (a.startTime || 0) - (b.startTime || 0)
            break
          case "startTime":
            cmp = (a.startTime || 0) - (b.startTime || 0)
            break
          case "endTime":
            cmp = (a.endTime || 0) - (b.endTime || 0)
            break
        }
        return sortDirection === "asc" ? cmp : -cmp
      })
  }, [fairs, activeStatuses, searchQuery, dateFrom, dateTo, sortColumn, sortDirection])

  const { options: createHubOptions, loading: createHubLoading } = useGeocodeSuggest(
    createHubSearch,
    createDialogOpen,
  )

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
      const token = await auth.currentUser?.getIdToken()
      if (token) {
        const cRes = await fetch(`${API_URL}/api/fairs/pending-enrollment-request-counts`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cRes.ok) {
          const cData = await cRes.json()
          setPendingRequestCounts(cData.counts && typeof cData.counts === "object" ? cData.counts : {})
        } else {
          setPendingRequestCounts({})
        }
      } else {
        setPendingRequestCounts({})
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
      const fromPick =
        createPickedHub &&
        (createPickedHub.city.trim() ||
          createPickedHub.state.trim() ||
          createPickedHub.zip.trim())
      const hub: Record<string, string> = fromPick
        ? {
            venueCity: createPickedHub.city.trim(),
            venueState: createPickedHub.state.trim(),
            venueZip: createPickedHub.zip.trim(),
          }
        : createHubSearch.trim()
          ? { venueGeocodeQuery: createHubSearch.trim() }
          : {}
      const res = await fetch(`${API_URL}/api/fairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: user?.uid,
          name: createForm.name,
          description: createForm.description,
          startTime: createForm.startTime ? new Date(createForm.startTime).toISOString() : null,
          endTime: createForm.endTime ? new Date(createForm.endTime).toISOString() : null,
          ...hub,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create fair")
      setCreateDialogOpen(false)
      setCreateForm({
        name: "",
        description: "",
        startTime: "",
        endTime: "",
      })
      setCreateHubSearch("")
      setCreatePickedHub(null)
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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setCreatePickedHub(null)
              setCreateHubSearch("")
              setCreateError("")
              setCreateDialogOpen(true)
            }}
            sx={{ background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)" }}>
            New Fair
          </Button>
        </Box>

        {toggleError && <Alert severity="error" sx={{ mb: 2 }}>{toggleError}</Alert>}

        {!loadingFairs && totalPendingEnrollmentRequests > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {totalPendingEnrollmentRequests} pending enrollment request
            {totalPendingEnrollmentRequests === 1 ? "" : "s"} across fairs — open <strong>Manage</strong> for a fair to review.
          </Alert>
        )}

        {loadingFairs && <CircularProgress size={24} />}
        {!loadingFairs && fairs.length === 0 && (
          <Typography color="text.secondary">No fairs created yet. Create your first fair above.</Typography>
        )}
        {!loadingFairs && fairs.length > 0 && (
          <>
            {/* Filter bar */}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, alignItems: "center" }}>
              <TextField
                size="small"
                placeholder="Search fairs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearchQuery("")}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  },
                }}
                sx={{ minWidth: 200 }}
              />
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                {(["Live", "Upcoming", "Ended"] as FairStatus[]).map((status) => {
                  const colorMap: Record<FairStatus, "success" | "primary" | "warning" | "default"> = {
                    Live: "success", Upcoming: "primary", Ended: "default",
                  }
                  return (
                    <Chip
                      key={status}
                      label={status}
                      size="small"
                      variant={activeStatuses.has(status) ? "filled" : "outlined"}
                      color={colorMap[status]}
                      onClick={() => toggleStatus(status)}
                      sx={{ cursor: "pointer" }}
                    />
                  )
                })}
              </Box>
              <TextField
                size="small"
                label="From"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 150 }}
              />
              <TextField
                size="small"
                label="To"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 150 }}
              />
              {hasActiveFilters && (
                <Button size="small" onClick={clearFilters} startIcon={<ClearIcon fontSize="small" />}
                  sx={{ color: "#b03a6c" }}>
                  Clear
                </Button>
              )}
            </Box>

            {/* Results count */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Showing {filteredFairs.length} of {fairs.length} fair{fairs.length !== 1 ? "s" : ""}
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, overflow: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel active={sortColumn === "name"} direction={sortColumn === "name" ? sortDirection : "asc"}
                        onClick={() => handleSort("name")}>
                        Fair Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel active={sortColumn === "status"} direction={sortColumn === "status" ? sortDirection : "asc"}
                        onClick={() => handleSort("status")}>
                        Status
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel active={sortColumn === "startTime"} direction={sortColumn === "startTime" ? sortDirection : "asc"}
                        onClick={() => handleSort("startTime")}>
                        Start
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel active={sortColumn === "endTime"} direction={sortColumn === "endTime" ? sortDirection : "asc"}
                        onClick={() => handleSort("endTime")}>
                        End
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Live</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredFairs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">No fairs match your filters</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFairs.map((fair) => {
                      const status = getFairStatus(fair)
                      const chipColor: Record<FairStatus, "success" | "primary" | "warning" | "default"> = {
                        Live: "success", Upcoming: "primary", Ended: "default",
                      }
                      return (
                        <TableRow key={fair.id}>
                          <TableCell>
                            <Badge
                              color="error"
                              badgeContent={pendingRequestCounts[fair.id] || 0}
                              invisible={(pendingRequestCounts[fair.id] || 0) === 0}
                              sx={{
                                "& .MuiBadge-badge": {
                                  fontWeight: 700,
                                  right: -10,
                                  top: 4,
                                },
                              }}
                            >
                              <Typography component="span" sx={{ pr: (pendingRequestCounts[fair.id] || 0) > 0 ? 1.5 : 0 }}>
                                {fair.name}
                              </Typography>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Chip label={status} size="small" color={chipColor[status]} />
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
                            <Button size="small" onClick={() => navigate(`/admin/fairs/${fair.id}`)} sx={{ mr: 1 }}>
                              Reviews
                            </Button>
                            <Button size="small" onClick={() => navigate(`/fair/${fair.id}/admin`)} sx={{ mr: 1 }}>
                              Manage
                            </Button>
                            <IconButton size="small" onClick={() => handleDeleteFair(fair.id, fair.name)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </CardContent>

      <Dialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false)
          setCreateError("")
        }}
        maxWidth="sm"
        fullWidth
      >
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
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
            Fair location (optional)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Search for a place, city, or ZIP. Pick a suggestion or type a query—the server verifies it with Mapbox. Remove
            the chip to clear.
          </Typography>
          {createPickedHub && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Location to add
              </Typography>
              <Chip
                label={createPickedHub.label}
                onDelete={() => {
                  setCreatePickedHub(null)
                  setCreateHubSearch("")
                }}
                color="secondary"
                variant="outlined"
              />
            </Box>
          )}
          <Autocomplete
            freeSolo
            size="small"
            options={createHubOptions}
            loading={createHubLoading}
            filterOptions={(opts) => opts}
            getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
            isOptionEqualToValue={(a, b) =>
              typeof a === "object" &&
              typeof b === "object" &&
              Boolean(a.id && b.id && a.id === b.id)
            }
            inputValue={createHubSearch}
            onInputChange={(_, newInputValue, reason) => {
              if (reason === "reset") {
                setCreateHubSearch(newInputValue)
                return
              }
              setCreateHubSearch(newInputValue)
              if (reason === "input") setCreatePickedHub(null)
            }}
            onChange={(_, newValue) => {
              if (newValue && typeof newValue === "object" && "lat" in newValue) {
                setCreatePickedHub({
                  label: typeof newValue.label === "string" ? newValue.label : "",
                  city: typeof newValue.city === "string" ? newValue.city : "",
                  state: typeof newValue.state === "string" ? newValue.state : "",
                  zip: typeof newValue.zip === "string" ? newValue.zip : "",
                })
                setCreateHubSearch(
                  typeof newValue.label === "string" ? newValue.label : "",
                )
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search places"
                placeholder="City, ZIP, or address — pick a suggestion or type and create"
                sx={{ mb: 0 }}
              />
            )}
          />
          {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreateDialogOpen(false)
              setCreateError("")
            }}
          >
            Cancel
          </Button>
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
    <BaseLayout pageTitle="Administrator Dashboard">
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
    </BaseLayout>
  )
}
