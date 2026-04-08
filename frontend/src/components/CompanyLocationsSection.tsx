import { useState, useEffect, useCallback } from "react"
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  IconButton,
  Tooltip,
  Autocomplete,
  Chip,
  CircularProgress,
  Grid,
} from "@mui/material"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import AddIcon from "@mui/icons-material/Add"
import EditIcon from "@mui/icons-material/Edit"
import DeleteIcon from "@mui/icons-material/Delete"
import { API_URL } from "../config"
import { auth } from "../firebase"
import { useGeocodeSuggest } from "../hooks/useGeocodeSuggest"

export interface CompanyLocationRow {
  id: string
  label: string | null
  venueCity: string
  venueState: string
  venueZip: string | null
  venueCountry: string | null
  venueGeo: { latitude: number; longitude: number } | null
  createdAt: number | null
  updatedAt: number | null
}

function formatAddress(loc: CompanyLocationRow): string {
  const parts = [[loc.venueCity, loc.venueState].filter(Boolean).join(", "), loc.venueZip].filter(Boolean)
  return parts.join(" ").trim()
}

type PickedHub = { label: string; city: string; state: string; zip: string }

export default function CompanyLocationsSection({
  companyId,
  canManage,
}: Readonly<{ companyId: string; canManage: boolean }>) {
  const [locations, setLocations] = useState<CompanyLocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CompanyLocationRow | null>(null)
  const [label, setLabel] = useState("")
  const [hubSearch, setHubSearch] = useState("")
  const [pickedHub, setPickedHub] = useState<PickedHub | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const { options: hubOptions, loading: hubLoading } = useGeocodeSuggest(hubSearch, dialogOpen)

  const loadLocations = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      const res = await fetch(`${API_URL}/api/companies/${companyId}/locations`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load locations")
      setLocations(Array.isArray(data.locations) ? data.locations : [])
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load locations")
      setLocations([])
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void loadLocations()
  }, [loadLocations])

  const openAdd = () => {
    setEditing(null)
    setLabel("")
    setHubSearch("")
    setPickedHub(null)
    setFormError("")
    setDialogOpen(true)
  }

  const openEdit = (loc: CompanyLocationRow) => {
    setEditing(loc)
    setLabel(loc.label ?? "")
    const line = formatAddress(loc)
    setHubSearch(line)
    setPickedHub({
      label: line,
      city: loc.venueCity,
      state: loc.venueState,
      zip: loc.venueZip ?? "",
    })
    setFormError("")
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setFormError("")
  }

  const buildHubPayload = (): Record<string, string> => {
    const fromPick =
      pickedHub &&
      (pickedHub.city.trim() || pickedHub.state.trim() || pickedHub.zip.trim())
    if (fromPick) {
      return {
        venueCity: pickedHub.city.trim(),
        venueState: pickedHub.state.trim(),
        venueZip: pickedHub.zip.trim(),
      }
    }
    if (hubSearch.trim()) {
      return { venueGeocodeQuery: hubSearch.trim() }
    }
    return {}
  }

  const handleSave = async () => {
    const hub = buildHubPayload()
    if (!("venueGeocodeQuery" in hub) && !("venueCity" in hub && hub.venueCity)) {
      setFormError("Search for a place or enter a location, then pick a suggestion or type a verified query.")
      return
    }
    setSaving(true)
    setFormError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error("Not signed in")
      const body = {
        ...hub,
        label: label.trim() || null,
      }
      const url =
        editing == null
          ? `${API_URL}/api/companies/${companyId}/locations`
          : `${API_URL}/api/companies/${companyId}/locations/${editing.id}`
      const res = await fetch(url, {
        method: editing == null ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")
      closeDialog()
      await loadLocations()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (loc: CompanyLocationRow) => {
    if (!globalThis.confirm(`Remove this location (${formatAddress(loc)})?`)) return
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) return
      const res = await fetch(`${API_URL}/api/companies/${companyId}/locations/${loc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Delete failed")
      await loadLocations()
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Delete failed")
    }
  }

  return (
    <Grid size={{ xs: 12 }}>
      <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
              <LocationOnIcon sx={{ color: "#388560" }} />
              Office locations
            </Typography>
            {canManage && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={openAdd}
                sx={{ borderColor: "#388560", color: "#388560" }}
              >
                Add location
              </Button>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add one or more verified office addresses using the same Mapbox-backed flow as career fair venues (search or
            city / state / ZIP). The public locations API can be used to show these anywhere your company appears.
          </Typography>

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {loadError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {loadError}
            </Alert>
          )}

          {!loading && locations.length === 0 && (
            <Typography color="text.secondary">No locations added yet.</Typography>
          )}

          {!loading && locations.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {locations.map((loc) => (
                <Box
                  key={loc.id}
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 2,
                    p: 1.5,
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 2,
                  }}
                >
                  <Box>
                    {loc.label && (
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {loc.label}
                      </Typography>
                    )}
                    <Typography variant="body2">{formatAddress(loc)}</Typography>
                  </Box>
                  {canManage && (
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(loc)} sx={{ color: "#388560" }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => void handleDelete(loc)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit location" : "Add office location"}</DialogTitle>
        <DialogContent>
          <TextField
            label="Label (optional)"
            placeholder="e.g. Headquarters, Charlotte office"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            fullWidth
            sx={{ mt: 1, mb: 2 }}
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Search for a place or type city / ZIP. Pick a suggestion so we can verify the address with Mapbox.
          </Typography>
          {pickedHub && (
            <Box sx={{ mb: 2 }}>
              <Chip
                label={pickedHub.label}
                onDelete={() => {
                  setPickedHub(null)
                  setHubSearch("")
                }}
                color="secondary"
                variant="outlined"
              />
            </Box>
          )}
          <Autocomplete
            freeSolo
            size="small"
            options={hubOptions}
            loading={hubLoading}
            filterOptions={(opts) => opts}
            getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
            isOptionEqualToValue={(a, b) =>
              typeof a === "object" && typeof b === "object" && Boolean(a.id && b.id && a.id === b.id)
            }
            inputValue={hubSearch}
            onInputChange={(_, newInputValue, reason) => {
              if (reason === "reset") {
                setHubSearch(newInputValue)
                return
              }
              setHubSearch(newInputValue)
              if (reason === "input") setPickedHub(null)
            }}
            onChange={(_, newValue) => {
              if (!newValue || typeof newValue !== "object" || !("lat" in newValue)) return
              const o = newValue as Record<string, unknown>
              setPickedHub({
                label: typeof o.label === "string" ? o.label : "",
                city: typeof o.city === "string" ? o.city : "",
                state: typeof o.state === "string" ? o.state : "",
                zip: typeof o.zip === "string" ? o.zip : "",
              })
              setHubSearch(typeof o.label === "string" ? o.label : "")
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search places"
                placeholder="City, ZIP, or address"
              />
            )}
          />
          {formError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {formError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  )
}
