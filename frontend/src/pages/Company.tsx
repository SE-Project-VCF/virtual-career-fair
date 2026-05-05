import { useState, useEffect, useMemo, type Dispatch, type SetStateAction } from "react"
import { getRepresentativeName } from "../utils/representativeUtils"
import { useNavigate, useParams } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
  Grid,
  TextField,
  Chip,
  Rating,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { fetchJobInvitationStats } from "../utils/jobInvitationStatsFetch"
import { API_URL } from "../config"
import { doc, getDoc, arrayRemove, updateDoc } from "firebase/firestore"
import { db, auth } from "../firebase"
import BusinessIcon from "@mui/icons-material/Business"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import PeopleIcon from "@mui/icons-material/People"
import EditIcon from "@mui/icons-material/Edit"
import DeleteIcon from "@mui/icons-material/Delete"
import RefreshIcon from "@mui/icons-material/Refresh"
import SaveIcon from "@mui/icons-material/Save"
import CancelIcon from "@mui/icons-material/Cancel"
import WorkIcon from "@mui/icons-material/Work"
import AddIcon from "@mui/icons-material/Add"
import LaunchIcon from "@mui/icons-material/Launch"
import SendIcon from "@mui/icons-material/Send"
import BarChartIcon from "@mui/icons-material/BarChart"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import DescriptionIcon from "@mui/icons-material/Description"
import AssignmentIcon from "@mui/icons-material/Assignment"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep"
import BaseLayout from "../components/BaseLayout"
import { useGeocodeSuggest, type LocationSuggestOption } from "../hooks/useGeocodeSuggest"
import JobInviteDialog from "../components/JobInviteDialog"
import JobInviteStatsDialog from "../components/JobInviteStatsDialog"
import ApplicationFormBuilderDialog from "../components/ApplicationFormBuilderDialog"
import type { ApplicationForm } from "../types/applicationForm"
import {
  compareJobsByDate,
  formatJobLocationLine,
  getSaveButtonLabel,
} from "../utils/companyJobHelpers"
import {
  ensureCompanyViewerAccess,
  logClientError,
  mapApiRecordToJob,
  validateCompanyJobForm,
} from "../utils/companyPageUtils"
import List from "@mui/material/List"
import ListItem from "@mui/material/ListItem"
import ListItemText from "@mui/material/ListItemText"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"

export type OfficeLocationRow = {
  id: string
  label: string
  city?: string
  state?: string
  zip?: string | null
}

interface Company {
  id: string
  companyName: string
  representativeIDs: string[]
  boothId?: string
  ownerId: string
  remoteEmployer?: boolean
  officeLocations?: OfficeLocationRow[]
}

interface Representative {
  uid: string
  email: string
  firstName?: string
  lastName?: string
}

interface Job {
  id: string
  companyId: string
  name: string
  description: string
  majorsAssociated: string
  applicationLink: string | null
  createdAt: number | null
  locationIsRemote?: boolean
  locationCity?: string | null
  locationState?: string | null
  location?: string | null
  applicationForm?: ApplicationForm
}

interface JobInvitationStats {
  totalSent: number
  totalViewed: number
  totalClicked: number
  viewRate: string
  clickRate: string
}

function CompanyInfoCard({
  company,
  inviteCode,
  isOwner,
  editingInviteCode,
  editedInviteCode,
  updatingInviteCode,
  setEditingInviteCode,
  setEditedInviteCode,
  handleRegenerateInviteCode,
  handleSaveInviteCode,
  copyToClipboard,
}: Readonly<{
  company: Company
  inviteCode: string
  isOwner: boolean
  editingInviteCode: boolean
  editedInviteCode: string
  updatingInviteCode: boolean
  setEditingInviteCode: (value: boolean) => void
  setEditedInviteCode: (value: string) => void
  handleRegenerateInviteCode: () => void
  handleSaveInviteCode: () => void
  copyToClipboard: (text: string) => void
}>) {
  return (
    <Grid size={{ xs: 12, md: 6 }}>
      <Card sx={{ height: "100%", border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <BusinessIcon sx={{ color: "#388560" }} />
            Company Information
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Company Name
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {company.companyName}
            </Typography>
          </Box>

          {isOwner && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Invite Code
                </Typography>
                {editingInviteCode ? (
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Save">
                      <IconButton
                        onClick={() => handleSaveInviteCode()}
                        size="small"
                        disabled={updatingInviteCode}
                        sx={{ color: "#388560" }}
                      >
                        <SaveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancel">
                      <IconButton
                        onClick={() => {
                          setEditingInviteCode(false)
                          setEditedInviteCode("")
                        }}
                        size="small"
                        sx={{ color: "#666" }}
                      >
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Regenerate invite code">
                      <IconButton
                        onClick={() => handleRegenerateInviteCode()}
                        size="small"
                        disabled={updatingInviteCode}
                        sx={{ color: "#388560" }}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit invite code">
                      <IconButton
                        onClick={() => {
                          setEditingInviteCode(true)
                          setEditedInviteCode(inviteCode)
                        }}
                        size="small"
                        sx={{ color: "#388560" }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {editingInviteCode ? (
                  <TextField
                    fullWidth
                    id="invite-code"
                    label="Invite Code"
                    slotProps={{ htmlInput: { name: "inviteCode" } }}
                    value={editedInviteCode}
                    onChange={(e) => {
                      setEditedInviteCode(e.target.value.toUpperCase().replaceAll(/[^A-Z0-9]/g, ""))
                    }}
                    disabled={updatingInviteCode}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        fontFamily: "monospace",
                        fontWeight: 600,
                      },
                    }}
                    helperText="4-20 characters, letters and numbers only"
                  />
                ) : (
                  <>
                    <Typography variant="body1" sx={{ fontFamily: "monospace", fontWeight: 600, flex: 1 }}>
                      {inviteCode}
                    </Typography>
                    <Tooltip title="Copy invite code">
                      <IconButton onClick={() => copyToClipboard(inviteCode)} size="small">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Box>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <PeopleIcon sx={{ fontSize: 20, color: "#b03a6c" }} />
            <Typography variant="body2" color="text.secondary">
              {company.representativeIDs?.length || 0} Representative{company.representativeIDs?.length === 1 ? "" : "s"}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Grid>
  )
}

function RepresentativesSection({
  isOwner,
  loadingRepresentatives,
  representatives,
  handleDeleteClick,
}: Readonly<{
  isOwner: boolean
  loadingRepresentatives: boolean
  representatives: Representative[]
  handleDeleteClick: (rep: Representative) => void
}>) {
  if (!isOwner) return null

  return (
    <Grid size={{ xs: 12 }}>
      <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <PeopleIcon sx={{ color: "#b03a6c" }} />
            Representatives
          </Typography>

          {loadingRepresentatives && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!loadingRepresentatives && representatives.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No representatives have joined this company yet.
            </Typography>
          )}
          {!loadingRepresentatives && representatives.length > 0 && (
            <List>
              {representatives.map((rep) => (
                <ListItem
                  key={rep.uid}
                  secondaryAction={
                    <Tooltip title="Remove representative">
                      <IconButton
                        edge="end"
                        onClick={() => handleDeleteClick(rep)}
                        sx={{ color: "#d32f2f" }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  }
                  sx={{
                    borderBottom: "1px solid rgba(0,0,0,0.1)",
                    "&:last-child": {
                      borderBottom: "none"
                    }
                  }}
                >
                  <ListItemText
                    primary={getRepresentativeName(rep)}
                    secondary={rep.firstName ? rep.email : undefined}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Grid>
  )
}

function newLocationId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) {
    return c.randomUUID()
  }
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(8)
    c.getRandomValues(bytes)
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    return `loc-${Date.now()}-${hex}`
  }
  throw new Error("Web Crypto API is required to generate office location IDs")
}

function normalizeOfficeLocationsFromDb(raw: unknown): OfficeLocationRow[] {
  if (!Array.isArray(raw)) return []
  const out: OfficeLocationRow[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : ""
    const city = typeof o.city === "string" ? o.city : ""
    const state = typeof o.state === "string" ? o.state : ""
    const label =
      typeof o.label === "string" && o.label.trim()
        ? o.label.trim()
        : [city, state].filter(Boolean).join(", ")
    if (!id || !label) continue
    out.push({
      id,
      label,
      city: city || undefined,
      state: state || undefined,
      zip: typeof o.zip === "string" ? o.zip : typeof o.zip === "number" ? String(o.zip) : null,
    })
  }
  return out
}

function officeLocationsListFingerprint(rows: OfficeLocationRow[]): string {
  return JSON.stringify(
    rows
      .map((r) => ({
        id: r.id,
        label: (r.label || "").trim(),
        city: (r.city || "").trim(),
        state: (r.state || "").trim(),
        zip: r.zip == null ? "" : String(r.zip).trim(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
}

/** True when draft remote flag or office list differs from what is stored on `company`. */
function isOfficeLocationsDirty(
  company: Company,
  officeDraftRemote: boolean,
  officeDraftList: OfficeLocationRow[],
): boolean {
  const savedRemote = company.remoteEmployer === true
  if (officeDraftRemote !== savedRemote) return true
  if (savedRemote) return false
  const savedRows = normalizeOfficeLocationsFromDb(company.officeLocations)
  return officeLocationsListFingerprint(savedRows) !== officeLocationsListFingerprint(officeDraftList)
}

function OfficeLocationsReadOnly({ company }: Readonly<{ company: Company }>) {
  if (company.remoteEmployer === true) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Chip label="Remote employer" color="primary" size="small" variant="outlined" />
      </Box>
    )
  }
  const rows = normalizeOfficeLocationsFromDb(company.officeLocations)
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No office locations on file. The company owner can add verified locations here.
      </Typography>
    )
  }
  return (
    <List dense disablePadding>
      {rows.map((r) => (
        <ListItem key={r.id} disableGutters>
          <ListItemText primary={r.label} secondary={[r.city, r.state].filter(Boolean).join(", ") || undefined} />
        </ListItem>
      ))}
    </List>
  )
}

function OfficeLocationsOwnerCard({
  officeDraftRemote,
  setOfficeDraftRemote,
  officeDraftList,
  setOfficeDraftList,
  officeSearchInput,
  setOfficeSearchInput,
  suggestOptions,
  suggestLoading,
  savingOfficeLocations,
  officeLocationsDirty,
  onSave,
}: Readonly<{
  officeDraftRemote: boolean
  setOfficeDraftRemote: (v: boolean) => void
  officeDraftList: OfficeLocationRow[]
  setOfficeDraftList: Dispatch<SetStateAction<OfficeLocationRow[]>>
  officeSearchInput: string
  setOfficeSearchInput: (v: string) => void
  suggestOptions: LocationSuggestOption[]
  suggestLoading: boolean
  savingOfficeLocations: boolean
  officeLocationsDirty: boolean
  onSave: () => void
}>) {
  const handleAddSuggestion = (opt: LocationSuggestOption | null) => {
    if (!opt || typeof opt !== "object" || !("lat" in opt)) return
    const label = typeof opt.label === "string" ? opt.label.trim() : ""
    if (!label) return
    const id = newLocationId()
    const city = typeof opt.city === "string" ? opt.city : ""
    const state = typeof opt.state === "string" ? opt.state : ""
    const zip = typeof opt.zip === "string" ? opt.zip : null
    setOfficeDraftList((prev) => {
      if (prev.some((p) => p.label === label)) return prev
      return [...prev, { id, label, city: city || undefined, state: state || undefined, zip }]
    })
    setOfficeSearchInput("")
  }

  return (
    <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <LocationOnIcon sx={{ color: "#388560" }} />
          Office locations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Search for places (Mapbox). Each location is verified on save. These appear on your fair booths and public booth
          listing.
        </Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={officeDraftRemote}
              onChange={(_, checked) => {
                setOfficeDraftRemote(checked)
                if (checked) setOfficeDraftList([])
              }}
            />
          }
          label="Remote employer (no physical office list)"
          sx={{ mb: 2, display: "block" }}
        />

        {!officeDraftRemote && (
          <>
            <Autocomplete
              freeSolo
              size="small"
              options={suggestOptions}
              loading={suggestLoading}
              filterOptions={(opts) => opts}
              getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
              isOptionEqualToValue={(a, b) =>
                typeof a === "object" && typeof b === "object" && Boolean(a.id && b.id && a.id === b.id)
              }
              inputValue={officeSearchInput}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === "reset") {
                  setOfficeSearchInput(newInputValue)
                  return
                }
                setOfficeSearchInput(newInputValue)
              }}
              onChange={(_, newValue) => {
                if (newValue && typeof newValue === "object" && "lat" in newValue) {
                  handleAddSuggestion(newValue)
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search places to add"
                  placeholder="City, ZIP, or address — pick a suggestion"
                  sx={{ mb: 2 }}
                />
              )}
            />

            {officeDraftList.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  {officeLocationsDirty
                    ? `Locations to save (${officeDraftList.length})`
                    : `Saved office locations (${officeDraftList.length})`}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {officeDraftList.map((row) => (
                    <Chip
                      key={row.id}
                      label={row.label}
                      onDelete={() => setOfficeDraftList((prev) => prev.filter((p) => p.id !== row.id))}
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}

        <Button
          variant="contained"
          onClick={onSave}
          disabled={savingOfficeLocations || !officeLocationsDirty}
          sx={{ mt: 1 }}
        >
          {savingOfficeLocations ? "Saving..." : "Save locations"}
        </Button>
      </CardContent>
    </Card>
  )
}

function BoothManagementCard({ companyId, legacyBoothId, navigate }: Readonly<{
  companyId: string
  /** Fallback when /api/booths returns no rows but company still has legacy boothId */
  legacyBoothId?: string | null
  navigate: ReturnType<typeof useNavigate>
}>) {
  const [booths, setBooths] = useState<{ id: string; boothName?: string; industry?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDeleteBooth = async (boothId: string) => {
    if (!globalThis.confirm("Are you sure you want to delete this booth?")) return
    setDeleting(boothId)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) {
        alert("Session expired. Please log in again.")
        return
      }
      const res = await fetch(`${API_URL}/api/booths/${boothId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setBooths((prev) => prev.filter((b) => b.id !== boothId))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || "Failed to delete booth")
      }
    } catch (err) {
      console.error("Error deleting booth:", err)
      alert("Failed to delete booth. Please try again.")
    } finally {
      setDeleting(null)
    }
  }

  useEffect(() => {
    const fetchBooths = async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch(`${API_URL}/api/booths?companyId=${companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setBooths(data.booths || [])
        }
      } catch (err) {
        console.error("Error fetching booths:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchBooths()
  }, [companyId])

  return (
    <Grid size={{ xs: 12, md: 6 }}>
      <Card sx={{ height: "100%", border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <EditIcon sx={{ color: "#388560" }} />
            Booth Management
          </Typography>

          {loading && <CircularProgress size={24} />}

          {!loading && booths.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No booths created yet. Create your first booth to get started.
            </Typography>
          )}

          <Box sx={{ maxHeight: 210, overflowY: "auto" }}>
          {!loading && booths.map((booth) => (
            <Box
              key={booth.id}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: 1.5,
                mb: 1,
                border: "1px solid #e0e0e0",
                borderRadius: 1,
              }}
            >
              <Box>
                <Typography variant="body1" fontWeight={600}>
                  {booth.boothName || "Untitled Booth"}
                </Typography>
                {booth.industry && (
                  <Typography variant="body2" color="text.secondary">
                    {booth.industry}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => navigate(`/company/${companyId}/booth/${booth.id}`)}
                  sx={{ color: "#388560" }}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  startIcon={<BarChartIcon />}
                  onClick={() => navigate(`/booth/${booth.id}/visitors`)}
                  sx={{ color: "#388560" }}
                >
                  Visitor analytics
                </Button>
                <Button
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={() => handleDeleteBooth(booth.id)}
                  disabled={deleting === booth.id}
                  sx={{ color: "#d32f2f" }}
                >
                  {deleting === booth.id ? "..." : "Delete"}
                </Button>
              </Box>
            </Box>
          ))}
          </Box>

          <Button
            variant="contained"
            onClick={() => navigate(`/company/${companyId}/booth`)}
            sx={{
              mt: 2,
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            Create New Booth
          </Button>

        </CardContent>
      </Card>
    </Grid>
  )
}

function DeleteCompanyCard({ isOwner, handleDeleteCompanyClick }: Readonly<{
  isOwner: boolean
  handleDeleteCompanyClick: () => void
}>) {
  if (!isOwner) return null

  return (
    <Grid size={{ xs: 12 }}>
      <Card sx={{ border: "2px solid rgba(211, 47, 47, 0.3)" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#d32f2f", display: "flex", alignItems: "center", gap: 1 }}>
            <DeleteIcon />
            Danger Zone
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Permanently delete this company. This action cannot be undone and will remove all company data, unlink representatives, and delete the associated booth.
          </Typography>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleDeleteCompanyClick}
            sx={{
              "&:hover": {
                bgcolor: "#c62828",
              },
            }}
          >
            Delete Company
          </Button>
        </CardContent>
      </Card>
    </Grid>
  )
}

const JOB_FIELDS = [
  { id: "job-title", name: "jobTitle", label: "Job Title *", key: "title" as const, placeholder: "e.g., Software Engineer Intern" },
  { id: "job-description", name: "jobDescription", label: "Description *", key: "description" as const, multiline: true, rows: 4, placeholder: "Describe the role, responsibilities, and requirements..." },
  { id: "job-skills", name: "jobSkills", label: "Required Skills *", key: "skills" as const, placeholder: "e.g., JavaScript, React, Python, Communication", helperText: "List the skills or qualifications required" },
  { id: "job-application-link", name: "jobApplicationLink", label: "Application URL (Optional)", key: "applicationLink" as const, placeholder: "https://company.com/apply", helperText: "External link where students can apply directly" },
]

type BoothRating = {
  rating: number
  comment: string | null
  createdAt: number | null
  fairId?: string
  fairName?: string
  fairStartTime?: number | null
}

type AnnotatedRating = BoothRating & { boothId: string; boothName: string }

function BoothReviewsSection({ companyId }: Readonly<{ companyId: string }>) {
  const [allRatings, setAllRatings] = useState<AnnotatedRating[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFair, setExpandedFair] = useState<string | false>(false)

  useEffect(() => {
    const load = async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        const boothsRes = await fetch(`${API_URL}/api/booths?companyId=${companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!boothsRes.ok) return
        const { booths } = (await boothsRes.json()) as { booths: { id: string; boothName?: string }[] }

        const ratingsResults = await Promise.all(
          booths.map(async (booth) => {
            const res = await fetch(`${API_URL}/api/booths/${booth.id}/ratings`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) return []
            const data = (await res.json()) as { ratings: BoothRating[] }
            return (data.ratings ?? []).map((r) => ({
              ...r,
              boothId: booth.id,
              boothName: booth.boothName || "Untitled Booth",
            }))
          }),
        )
        setAllRatings(ratingsResults.flat())
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [companyId])

  const fairGroups = useMemo(() => {
    const map = new Map<string, { fairName: string; fairStartTime: number | null; ratings: AnnotatedRating[] }>()
    for (const r of allRatings) {
      const key = r.fairId ?? "other"
      if (!map.has(key)) map.set(key, { fairName: r.fairName ?? "Other", fairStartTime: r.fairStartTime ?? null, ratings: [] })
      map.get(key)!.ratings.push(r)
    }
    return Array.from(map.entries()).sort(([aKey, aVal], [bKey, bVal]) => {
      if (aKey === "other") return 1
      if (bKey === "other") return -1
      return (bVal.fairStartTime ?? 0) - (aVal.fairStartTime ?? 0)
    })
  }, [allRatings])

  return (
    <Grid size={{ xs: 12 }}>
      <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", mt: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <BarChartIcon sx={{ color: "#388560" }} />
            Booth Reviews
          </Typography>

          {loading && <CircularProgress size={24} />}

          {!loading && allRatings.length === 0 && (
            <Typography color="text.secondary">No reviews yet.</Typography>
          )}

          {!loading && fairGroups.map(([fairKey, { fairName, fairStartTime, ratings }]) => {
            const fairAvg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
            const boothMap = new Map<string, { boothName: string; ratings: AnnotatedRating[] }>()
            for (const r of ratings) {
              if (!boothMap.has(r.boothId)) boothMap.set(r.boothId, { boothName: r.boothName, ratings: [] })
              boothMap.get(r.boothId)!.ratings.push(r)
            }
            const boothEntries = Array.from(boothMap.entries())

            return (
              <Accordion
                key={fairKey}
                data-testid="review-fair-group-header"
                expanded={expandedFair === fairKey}
                onChange={(_, isExpanded) => setExpandedFair(isExpanded ? fairKey : false)}
                sx={{
                  mb: 1,
                  border: "1px solid rgba(56, 133, 96, 0.25)",
                  borderRadius: "8px !important",
                  "&:before": { display: "none" },
                  boxShadow: "0 1px 4px rgba(56,133,96,0.06)",
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ color: "#388560" }} />}
                  sx={{
                    borderRadius: 2,
                    background: "linear-gradient(135deg, rgba(56,133,96,0.07) 0%, rgba(45,107,77,0.04) 100%)",
                    "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1.5 },
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1a3d2b" }}>
                      {fairName}
                    </Typography>
                    {fairStartTime && (
                      <Typography variant="caption" color="text.secondary">
                        {new Date(fairStartTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 1 }}>
                    <Rating value={fairAvg} readOnly precision={0.1} size="small" />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#388560" }}>
                      {fairAvg.toFixed(1)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({ratings.length} review{ratings.length === 1 ? "" : "s"})
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 1.5, pb: 2, px: 2 }}>
                  {boothEntries.map(([boothId, { boothName, ratings: boothRatings }], boothIdx) => {
                    const boothAvg = boothRatings.reduce((s, r) => s + r.rating, 0) / boothRatings.length
                    return (
                      <Box key={boothId}>
                        {boothIdx > 0 && <Divider sx={{ mb: 2 }} />}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: "#1a3d2b" }}>
                            {boothName}
                          </Typography>
                          <Rating value={boothAvg} readOnly precision={0.1} size="small" />
                          <Typography variant="caption" sx={{ color: "#388560", fontWeight: 600 }}>
                            {boothAvg.toFixed(1)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ({boothRatings.length})
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pl: 1, mb: 1.5 }}>
                          {boothRatings.map((review) => (
                            <Box
                              key={review.createdAt ?? `${review.rating}-${review.comment}`}
                              sx={{ p: 1.5, border: "1px solid rgba(0,0,0,0.06)", borderRadius: 2, background: "rgba(56,133,96,0.02)" }}
                            >
                              <Rating value={review.rating} readOnly size="small" />
                              {review.comment && (
                                <Typography variant="body2" sx={{ mt: 0.5 }}>{review.comment}</Typography>
                              )}
                              {review.createdAt && (
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(review.createdAt).toLocaleDateString()}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )
                  })}
                </AccordionDetails>
              </Accordion>
            )
          })}
        </CardContent>
      </Card>
    </Grid>
  )
}

export default function Company() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const user = authUtils.getCurrentUser()
  const [company, setCompany] = useState<Company | null>(null)
  const [representatives, setRepresentatives] = useState<Representative[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRepresentatives, setLoadingRepresentatives] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [representativeToDelete, setRepresentativeToDelete] = useState<Representative | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteCompanyDialogOpen, setDeleteCompanyDialogOpen] = useState(false)
  const [deletingCompany, setDeletingCompany] = useState(false)
  const [editingInviteCode, setEditingInviteCode] = useState(false)
  const [editedInviteCode, setEditedInviteCode] = useState("")
  const [updatingInviteCode, setUpdatingInviteCode] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
  const [jobs, setJobs] = useState<Job[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [jobForm, setJobForm] = useState({
    title: "",
    description: "",
    skills: "",
    applicationLink: "",
    locationIsRemote: true,
    locationInput: "",
    locationPick: null as LocationSuggestOption | null,
  })
  const [jobErrors, setJobErrors] = useState<{
    title?: string
    description?: string
    skills?: string
    applicationLink?: string
    location?: string
  }>({})
  const [savingJob, setSavingJob] = useState(false)
  const [deleteJobDialogOpen, setDeleteJobDialogOpen] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [selectedJobForInvite, setSelectedJobForInvite] = useState<Job | null>(null)
  const [jobStats, setJobStats] = useState<Record<string, JobInvitationStats>>({})
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null)
  const [deletingJob, setDeletingJob] = useState(false)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)
  const [selectedJobForStats, setSelectedJobForStats] = useState<Job | null>(null)
  const [applicationFormDialogOpen, setApplicationFormDialogOpen] = useState(false)
  const [selectedJobForForm, setSelectedJobForForm] = useState<Job | null>(null)
  const [deleteFormDialogOpen, setDeleteFormDialogOpen] = useState(false)
  const [jobToDeleteForm, setJobToDeleteForm] = useState<Job | null>(null)
  const [deletingForm, setDeletingForm] = useState(false)
  const [officeDraftRemote, setOfficeDraftRemote] = useState(false)
  const [officeDraftList, setOfficeDraftList] = useState<OfficeLocationRow[]>([])
  const [officeSearchInput, setOfficeSearchInput] = useState("")
  const [savingOfficeLocations, setSavingOfficeLocations] = useState(false)

  const userId = useMemo(() => user?.uid, [user?.uid])
  const userRole = useMemo(() => user?.role, [user?.role])

  const officeLocationsDirty = useMemo(() => {
    if (!company) return false
    return isOfficeLocationsDirty(company, officeDraftRemote, officeDraftList)
  }, [company, officeDraftRemote, officeDraftList])

  const ownerEditingOfficeLocations = Boolean(
    company && userRole === "companyOwner" && company.ownerId === userId,
  )
  const { options: officeSuggestOptions, loading: officeSuggestLoading } = useGeocodeSuggest(
    officeSearchInput,
    ownerEditingOfficeLocations && !officeDraftRemote,
  )

  const { options: jobLocationOptions, loading: jobLocationSuggestLoading } = useGeocodeSuggest(
    jobForm.locationInput,
    !jobForm.locationIsRemote && jobDialogOpen,
  )

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }

    if (!id) {
      navigate("/companies")
      return
    }

    fetchCompany()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, id, userId, userRole])

  const validateUserAccess = (companyInfo: Company): boolean =>
    ensureCompanyViewerAccess(companyInfo, userId, userRole, { setError, navigate })

  const fetchCompany = async () => {
    if (!id) return

    try {
      setLoading(true)
      setError("")

      const companyDoc = await getDoc(doc(db, "companies", id))

      if (!companyDoc.exists()) {
        setError("Company not found")
        setLoading(false)
        return
      }

      const companyData = companyDoc.data() as Omit<Company, "id">
      const companyInfo: Company = {
        id: companyDoc.id,
        ...companyData
      }

      const hasAccess = validateUserAccess(companyInfo)
      if (!hasAccess) return

      setCompany(companyInfo)
      setOfficeDraftRemote(companyInfo.remoteEmployer === true)
      setOfficeDraftList(normalizeOfficeLocationsFromDb(companyInfo.officeLocations))
      setOfficeSearchInput("")

      fetchRepresentatives(companyInfo.representativeIDs ?? [])
      fetchJobs(companyInfo.id)
      if (userRole === "companyOwner" && companyInfo.ownerId === userId) {
        fetchInviteCode(companyInfo.id)
      }
    } catch (error: unknown) {
      logClientError("Error fetching company", error)
      setError("Failed to load company")
    } finally {
      setLoading(false)
    }
  }

  const fetchInviteCode = async (companyId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) return
      const response = await fetch(`${API_URL}/api/companies/${companyId}/invite-code`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setInviteCode(data.inviteCode ?? "")
      }
    } catch (error: unknown) {
      logClientError("Error fetching invite code", error)
    }
  }

  const handleSaveOfficeLocations = async () => {
    if (!company || !auth.currentUser) return
    try {
      setSavingOfficeLocations(true)
      setError("")
      const token = await auth.currentUser.getIdToken()
      const body = officeDraftRemote
        ? { remoteEmployer: true }
        : {
            remoteEmployer: false,
            officeLocations: officeDraftList.map((r) => ({
              id: r.id,
              label: r.label,
              geocodeQuery: r.label.trim(),
              city: r.city ?? "",
              state: r.state ?? "",
              zip: r.zip ?? "",
            })),
          }
      const res = await fetch(`${API_URL}/api/companies/${company.id}/locations`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        hint?: string
        remoteEmployer?: boolean
        officeLocations?: OfficeLocationRow[]
      }
      if (!res.ok) {
        const base =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : "Failed to save office locations"
        const withHint =
          data.code === "COMPANY_DOC_MISSING" && typeof data.hint === "string" && data.hint.trim()
            ? `${base} ${data.hint.trim()}`
            : base
        throw new Error(withHint)
      }
      setCompany((c) =>
        c
          ? {
              ...c,
              remoteEmployer: Boolean(data.remoteEmployer),
              officeLocations: Array.isArray(data.officeLocations) ? data.officeLocations : [],
            }
          : c,
      )
      setOfficeDraftRemote(Boolean(data.remoteEmployer))
      setOfficeDraftList(normalizeOfficeLocationsFromDb(data.officeLocations))
      setOfficeSearchInput("")
      setSuccess("Office locations updated.")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save office locations")
    } finally {
      setSavingOfficeLocations(false)
    }
  }

  const fetchRepresentatives = async (representativeIDs: string[]) => {
    try {
      setLoadingRepresentatives(true)
      const repPromises = representativeIDs.map(async (repId) => {
        const userDoc = await getDoc(doc(db, "users", repId))
        if (userDoc.exists()) {
          const data = userDoc.data()
          return {
            uid: repId,
            email: data.email || "",
            firstName: data.firstName,
            lastName: data.lastName,
          } as Representative
        }
        return null
      })

      const reps = (await Promise.all(repPromises)).filter((rep): rep is Representative => rep !== null)
      setRepresentatives(reps)
    } catch (error: unknown) {
      logClientError("Error fetching representatives", error)
    } finally {
      setLoadingRepresentatives(false)
    }
  }

  const fetchJobs = async (companyId: string) => {
    try {
      setLoadingJobs(true)

      const response = await fetch(`${API_URL}/api/jobs?companyId=${encodeURIComponent(companyId)}`)
      if (!response.ok) {
        throw new Error("Failed to fetch jobs")
      }
      const data = await response.json()
      const raw = data.jobs || []
      const jobsList: Job[] = raw.map((j: Record<string, unknown>) => mapApiRecordToJob(j))

      jobsList.sort(compareJobsByDate)

      setJobs(jobsList)

      if (userId) {
        jobsList.forEach((job) => {
          fetchJobStats(job.id)
        })
      }
    } catch (error: unknown) {
      logClientError("Error fetching jobs", error)
      setError(`Failed to load job postings: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setLoadingJobs(false)
    }
  }

  const fetchJobStats = async (jobId: string) => {
    try {
      const result = await fetchJobInvitationStats<JobInvitationStats>(
        API_URL,
        jobId,
        userId || "",
        () => authUtils.getIdToken()
      )
      if (result.ok) {
        setJobStats((prev) => ({ ...prev, [jobId]: result.stats }))
      }
    } catch (error: unknown) {
      logClientError("Error fetching job invitation stats", error)
    }
  }

  const handleInviteStudentsClick = (job: Job) => {
    setSelectedJobForInvite(job)
    setInviteDialogOpen(true)
  }

  const handleInviteSuccess = () => {
    // Refresh stats after sending invitations
    if (selectedJobForInvite) {
      fetchJobStats(selectedJobForInvite.id)
    }
  }

  const handleViewStatsClick = (job: Job) => {
    setSelectedJobForStats(job)
    setStatsDialogOpen(true)
  }

  const resetJobForm = () => {
    setJobDialogOpen(false)
    setEditingJob(null)
    setJobForm({
      title: "",
      description: "",
      skills: "",
      applicationLink: "",
      locationIsRemote: true,
      locationInput: "",
      locationPick: null,
    })
    setJobErrors({})
  }

  const handleManageApplicationFormClick = (job: Job) => {
    setSelectedJobForForm(job)
    setApplicationFormDialogOpen(true)
  }

  const handleDeleteFormClick = (job: Job) => {
    setJobToDeleteForm(job)
    setDeleteFormDialogOpen(true)
  }

  const handleDeleteFormConfirm = async () => {
    if (!jobToDeleteForm) return

    if (!auth.currentUser) {
      setError("Your session has expired. Please log in again.")
      setTimeout(() => navigate("/login"), 1500)
      return
    }

    try {
      setDeletingForm(true)
      setError("")

      const token = await auth.currentUser.getIdToken()
      const response = await fetch(
        `${API_URL}/api/jobs/${jobToDeleteForm.id}/form`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete form.")
      }

      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobToDeleteForm.id ? { ...job, applicationForm: undefined } : job
        )
      )
      setSuccess("Application form deleted.")
      setDeleteFormDialogOpen(false)
      setJobToDeleteForm(null)
    } catch (error: unknown) {
      logClientError("Error deleting application form", error)
      setError(error instanceof Error ? error.message : "Failed to delete application form.")
    } finally {
      setDeletingForm(false)
    }
  }

  const handleCreateJobClick = () => {
    setEditingJob(null)
    setJobForm({
      title: "",
      description: "",
      skills: "",
      applicationLink: "",
      locationIsRemote: true,
      locationInput: "",
      locationPick: null,
    })
    setJobErrors({})
    setJobDialogOpen(true)
  }

  const handleEditJobClick = (job: Job) => {
    const isRemote =
      job.locationIsRemote === true ||
      (job.locationIsRemote !== false && !(job.locationCity || job.locationState))

    let pick: LocationSuggestOption | null = null
    let locInput = ""
    if (!isRemote && (job.locationCity || job.locationState)) {
      const label =
        job.location ||
        [job.locationCity, job.locationState].filter(Boolean).join(", ")
      pick = {
        id: `saved-${job.id}`,
        label,
        lat: 0,
        lng: 0,
        city: job.locationCity ?? undefined,
        state: job.locationState ?? undefined,
      }
      locInput = label
    }

    setEditingJob(job)
    setJobForm({
      title: job.name,
      description: job.description,
      skills: job.majorsAssociated,
      applicationLink: job.applicationLink || "",
      locationIsRemote: isRemote,
      locationInput: locInput,
      locationPick: pick,
    })
    setJobErrors({})
    setJobDialogOpen(true)
  }

  const handleDeleteJobClick = (job: Job) => {
    setJobToDelete(job)
    setDeleteJobDialogOpen(true)
  }

  const saveJobToDatabase = async (companyId: string, applicationLink: string | null) => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error("Not authenticated")

    const base: Record<string, unknown> = {
      name: jobForm.title.trim(),
      description: jobForm.description.trim(),
      majorsAssociated: jobForm.skills.trim(),
      applicationLink,
    }

    if (jobForm.locationIsRemote) {
      base.locationIsRemote = true
    } else {
      const pick = jobForm.locationPick
      if (!pick?.city?.trim() || !pick?.state?.trim()) {
        throw new Error("Location is required for on-site jobs")
      }
      base.locationIsRemote = false
      base.locationCity = pick.city
      base.locationState = pick.state
      base.location = pick.label
    }

    if (editingJob) {
      const response = await fetch(`${API_URL}/api/jobs/${editingJob.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(base),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || "Failed to update job")
      }
      setSuccess("Job posting updated successfully!")
    } else {
      const response = await fetch(`${API_URL}/api/jobs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...base }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || "Failed to create job")
      }
      setSuccess("Job posting created successfully!")
    }
  }

  const handleSaveJob = async () => {
    if (!company) return

    // Check if user is authenticated with Firebase
    if (!auth.currentUser) {
      setError("Your session has expired. Please log in again.")
      setTimeout(() => {
        navigate("/login")
      }, 1500)
      return
    }

    // Reset errors
    setJobErrors({})
    const errors = validateCompanyJobForm(jobForm)

    if (Object.keys(errors).length > 0) {
      setJobErrors(errors)
      return
    }

    setSavingJob(true)
    const applicationLink = jobForm.applicationLink.trim() || null

    try {
      await saveJobToDatabase(company.id, applicationLink)
      fetchJobs(company.id)
      setJobDialogOpen(false)
    } catch (error: unknown) {
      logClientError("Error saving job", error)
      setError("Failed to save job posting. Please try again.")
    } finally {
      setSavingJob(false)
    }
  }

  const handleDeleteJobConfirm = async () => {
    if (!jobToDelete || !company) return

    // Check if user is authenticated with Firebase
    if (!auth.currentUser) {
      setError("Your session has expired. Please log in again.")
      setTimeout(() => {
        navigate("/login")
      }, 1500)
      return
    }

    try {
      setDeletingJob(true)
      setError("")

      const token = await auth.currentUser.getIdToken()
      const response = await fetch(`${API_URL}/api/jobs/${jobToDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || "Failed to delete job")
      }

      setSuccess("Job posting deleted successfully!")
      fetchJobs(company.id)
      setDeleteJobDialogOpen(false)
      setJobToDelete(null)
    } catch (error: unknown) {
      logClientError("Error deleting job", error)
      setError("Failed to delete job posting")
    } finally {
      setDeletingJob(false)
    }
  }

  const handleDeleteClick = (rep: Representative) => {
    setRepresentativeToDelete(rep)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!representativeToDelete || !company || !isOwner) return

    // Check if user is authenticated with Firebase
    if (!auth.currentUser) {
      setError("Your session has expired. Please log in again.")
      setTimeout(() => {
        navigate("/login")
      }, 1500)
      return
    }

    try {
      setDeleting(true)
      setError("")

      // Remove representative from company's representativeIDs array
      await updateDoc(doc(db, "companies", company.id), {
        representativeIDs: arrayRemove(representativeToDelete.uid)
      })

      // Remove companyId and companyName from representative's user document
      const representativeUserRef = doc(db, "users", representativeToDelete.uid)
      await updateDoc(representativeUserRef, {
        companyId: null,
        companyName: null,
      })

      // Update local state
      setRepresentatives(representatives.filter(rep => rep.uid !== representativeToDelete.uid))
      setCompany({
        ...company,
        representativeIDs: company.representativeIDs.filter(id => id !== representativeToDelete.uid)
      })

      setSuccess(`${getRepresentativeName(representativeToDelete)} has been removed from the company`)
      setTimeout(() => setSuccess(""), 3000)
      setDeleteDialogOpen(false)
      setRepresentativeToDelete(null)
    } catch (error: unknown) {
      logClientError("Error deleting representative", error)
      setError("Failed to remove representative")
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteCompanyClick = () => {
    setDeleteCompanyDialogOpen(true)
  }

  const handleDeleteCompanyConfirm = async () => {
    if (!company || !userId || !isOwner) return

    // Check if user is authenticated with Firebase
    if (!auth.currentUser) {
      setError("Your session has expired. Please log in again.")
      setTimeout(() => {
        navigate("/login")
      }, 1500)
      return
    }

    try {
      setDeletingCompany(true)
      setError("")

      const result = await authUtils.deleteCompany(company.id, userId)

      if (result.success) {
        navigate("/companies")
      } else {
        setError(result.error || "Failed to delete company")
      }
    } catch (error: unknown) {
      logClientError("Error deleting company", error)
      setError("Failed to delete company")
    } finally {
      setDeletingCompany(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess("Invite code copied to clipboard!")
      setTimeout(() => setSuccess(""), 3000)
    } catch (error: unknown) {
      logClientError("Failed to copy to clipboard", error)
      setError("Failed to copy to clipboard")
    }
  }

  const handleRegenerateInviteCode = async () => {
    if (!company || !userId) return

    // Check if user is authenticated with Firebase
    if (!auth.currentUser) {
      setError("Your session has expired. Please log in again.")
      setTimeout(() => {
        navigate("/login")
      }, 1500)
      return
    }

    try {
      setUpdatingInviteCode(true)
      setError("")

      const result = await authUtils.updateInviteCode(company.id, userId)

      if (result.success && result.inviteCode) {
        setInviteCode(result.inviteCode)
        setSuccess("Invite code regenerated successfully!")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.error || "Failed to regenerate invite code")
      }
    } catch (error: unknown) {
      logClientError("Error regenerating invite code", error)
      setError("Failed to regenerate invite code")
    } finally {
      setUpdatingInviteCode(false)
    }
  }

  const handleSaveInviteCode = async () => {
    if (!company || !userId) return

    const trimmedCode = editedInviteCode.trim()
    if (!trimmedCode || trimmedCode.length < 4 || trimmedCode.length > 20) {
      setError("Invite code must be 4-20 characters")
      return
    }

    // Check if user is authenticated with Firebase
    if (!auth.currentUser) {
      setError("Your session has expired. Please log in again.")
      setTimeout(() => {
        navigate("/login")
      }, 1500)
      return
    }

    try {
      setUpdatingInviteCode(true)
      setError("")

      const result = await authUtils.updateInviteCode(company.id, userId, trimmedCode)

      if (result.success && result.inviteCode) {
        setInviteCode(result.inviteCode)
        setSuccess("Invite code updated successfully!")
        setEditingInviteCode(false)
        setEditedInviteCode("")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.error || "Failed to update invite code")
      }
    } catch (error: unknown) {
      logClientError("Error updating invite code", error)
      setError("Failed to update invite code")
    } finally {
      setUpdatingInviteCode(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error && !company) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Card sx={{ p: 4, maxWidth: 500 }}>
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          <Button onClick={() => navigate("/companies")} variant="contained">
            Go Back
          </Button>
        </Card>
      </Box>
    )
  }
  if (!company) return null

  const isOwner = userRole === "companyOwner" && company.ownerId === userId
  const saveButtonLabel = getSaveButtonLabel(savingJob, editingJob)

  return (
    <BaseLayout pageTitle={company.companyName}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(isOwner ? "/companies" : "/dashboard")} sx={{ mb: 3 }}>
          {"Companies"}
        </Button>
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSuccess("")}>
            {success}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Company Information Card */}
          <CompanyInfoCard
            company={company}
            inviteCode={inviteCode}
            isOwner={isOwner}
            editingInviteCode={editingInviteCode}
            editedInviteCode={editedInviteCode}
            updatingInviteCode={updatingInviteCode}
            setEditingInviteCode={setEditingInviteCode}
            setEditedInviteCode={setEditedInviteCode}
            handleRegenerateInviteCode={handleRegenerateInviteCode}
            handleSaveInviteCode={handleSaveInviteCode}
            copyToClipboard={copyToClipboard}
          />

          {/* Booth Management Card */}
          <BoothManagementCard
            companyId={company.id}
            legacyBoothId={company.boothId}
            navigate={navigate}
          />

          {/* Booth Reviews Section */}
          <BoothReviewsSection companyId={company.id} />

          {isOwner ? (
            <Grid size={{ xs: 12 }}>
              <OfficeLocationsOwnerCard
                officeDraftRemote={officeDraftRemote}
                setOfficeDraftRemote={setOfficeDraftRemote}
                officeDraftList={officeDraftList}
                setOfficeDraftList={setOfficeDraftList}
                officeSearchInput={officeSearchInput}
                setOfficeSearchInput={setOfficeSearchInput}
                suggestOptions={officeSuggestOptions}
                suggestLoading={officeSuggestLoading}
                savingOfficeLocations={savingOfficeLocations}
                officeLocationsDirty={officeLocationsDirty}
                onSave={handleSaveOfficeLocations}
              />
            </Grid>
          ) : (
            <Grid size={{ xs: 12 }}>
              <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 600, mb: 2, display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <LocationOnIcon sx={{ color: "#388560" }} />
                    Office locations
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Only the company owner can edit locations. This is what students see on your booth.
                  </Typography>
                  <OfficeLocationsReadOnly company={company} />
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Representatives List Card */}
          <RepresentativesSection
            isOwner={isOwner}
            loadingRepresentatives={loadingRepresentatives}
            representatives={representatives}
            handleDeleteClick={handleDeleteClick}
          />

          {/* Job Postings Card */}
          <Grid size={{ xs: 12 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
                    <WorkIcon sx={{ color: "#388560" }} />
                    Job Postings ({jobs.length})
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreateJobClick}
                    sx={{
                      background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                      "&:hover": {
                        background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                      },
                    }}
                  >
                    Create Job Posting
                  </Button>
                </Box>

                {loadingJobs && (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                    <CircularProgress size={24} />
                  </Box>
                )}
                {!loadingJobs && jobs.length === 0 && (
                  <Box sx={{ textAlign: "center", py: 4 }}>
                    <WorkIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                      No job postings yet. Create your first job posting to attract students!
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleCreateJobClick}
                      sx={{
                        borderColor: "#388560",
                        color: "#388560",
                        "&:hover": {
                          borderColor: "#2d6b4d",
                          bgcolor: "rgba(56, 133, 96, 0.05)",
                        },
                      }}
                    >
                      Create Job Posting
                    </Button>
                  </Box>
                )}
                {!loadingJobs && jobs.length > 0 && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {jobs.map((job) => (
                      <Card
                        key={job.id}
                        sx={{
                          border: "1px solid rgba(56, 133, 96, 0.2)",
                          borderRadius: 2,
                          transition: "box-shadow 0.2s",
                          "&:hover": {
                            boxShadow: "0 4px 12px rgba(56, 133, 96, 0.15)",
                          },
                        }}
                      >
                        <CardContent sx={{ p: 2.5 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1.5 }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                {job.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}>
                                {job.description}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                <strong>Location:</strong> {formatJobLocationLine(job)}
                              </Typography>
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, color: "#388560" }}>
                                  Required Skills:
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {job.majorsAssociated}
                                </Typography>
                              </Box>
                              {job.applicationLink && (
                                <Chip
                                  icon={<LaunchIcon sx={{ fontSize: 16 }} />}
                                  label="Application Link Available"
                                  size="small"
                                  sx={{
                                    bgcolor: "rgba(56, 133, 96, 0.1)",
                                    color: "#388560",
                                    fontWeight: 500,
                                  }}
                                />
                              )}
                            </Box>
                            <Box sx={{ display: "flex", gap: 1, ml: 2, flexDirection: "column" }}>
                              <Box sx={{ display: "flex", gap: 1 }}>
                                <Tooltip title="Invite students to apply">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleInviteStudentsClick(job)}
                                    sx={{ 
                                      color: "#388560",
                                      bgcolor: "rgba(56, 133, 96, 0.08)",
                                      "&:hover": {
                                        bgcolor: "rgba(56, 133, 96, 0.15)",
                                      }
                                    }}
                                  >
                                    <SendIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Edit job posting">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleEditJobClick(job)}
                                    sx={{ color: "#388560" }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={job.applicationForm ? "Edit application form" : "Create application form"}>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleManageApplicationFormClick(job)}
                                    sx={{ color: job.applicationForm ? "#388560" : "text.secondary" }}
                                  >
                                    <DescriptionIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {job.applicationForm && (
                                  <Tooltip title="View submissions">
                                    <IconButton
                                      size="small"
                                      onClick={() => navigate(`/company/${company?.id}/submissions`)}
                                      sx={{ color: "#388560" }}
                                    >
                                      <AssignmentIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                {job.applicationForm && (
                                  <Tooltip title="Remove form">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDeleteFormClick(job)}
                                      sx={{ color: "#d32f2f" }}
                                    >
                                      <DeleteSweepIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title="Delete job posting">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteJobClick(job)}
                                    sx={{ color: "#d32f2f" }}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </Box>
                          </Box>
                          
                          {job.applicationForm && (
                            <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                              <Chip
                                icon={<DescriptionIcon sx={{ fontSize: 16 }} />}
                                label={
                                  job.applicationForm.status === "published"
                                    ? "Application Form: Published"
                                    : "Application Form: Draft"
                                }
                                size="small"
                                sx={{
                                  bgcolor:
                                    job.applicationForm.status === "published"
                                      ? "rgba(56, 133, 96, 0.1)"
                                      : "rgba(0, 0, 0, 0.04)",
                                  color: job.applicationForm.status === "published" ? "#388560" : "text.secondary",
                                  fontWeight: 500,
                                }}
                              />
                            </Box>
                          )}

                          {/* Job Invitation Stats */}
                          {jobStats[job.id] && jobStats[job.id].totalSent > 0 && (
                            <Box 
                              sx={{ 
                                mt: 2, 
                                pt: 2, 
                                borderTop: "1px solid rgba(56, 133, 96, 0.15)",
                                display: "flex",
                                gap: 3,
                                alignItems: "center",
                                justifyContent: "space-between"
                              }}
                            >
                              <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                  <BarChartIcon sx={{ fontSize: 18, color: "#388560" }} />
                                  <Typography variant="caption" fontWeight="600" color="text.secondary">
                                    Invitation Stats:
                                  </Typography>
                                </Box>
                                <Box sx={{ display: "flex", gap: 2 }}>
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      Sent: <strong>{jobStats[job.id].totalSent}</strong>
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      Viewed: <strong>{jobStats[job.id].totalViewed}</strong> ({jobStats[job.id].viewRate}%)
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      Clicked: <strong>{jobStats[job.id].totalClicked}</strong> ({jobStats[job.id].clickRate}%)
                                    </Typography>
                                  </Box>
                                </Box>
                              </Box>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleViewStatsClick(job)}
                                sx={{
                                  borderColor: "#388560",
                                  color: "#388560",
                                  fontSize: "0.75rem",
                                  "&:hover": {
                                    borderColor: "#2d6b4d",
                                    bgcolor: "rgba(56, 133, 96, 0.05)",
                                  },
                                }}
                              >
                                View Details
                              </Button>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Delete Company Card (Owner only) */}
          <DeleteCompanyCard
            isOwner={isOwner}
            handleDeleteCompanyClick={handleDeleteCompanyClick}
          />
        </Grid>
      </Container>

      {/* Delete Representative Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Remove Representative</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove {representativeToDelete ? getRepresentativeName(representativeToDelete) : "this representative"} from {company?.companyName}?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            They will no longer have access to manage this company.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deleting ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Company Confirmation Dialog */}
      <Dialog
        open={deleteCompanyDialogOpen}
        onClose={() => !deletingCompany && setDeleteCompanyDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Company</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone. This will permanently delete the company and all associated data.
          </Alert>
          <Typography variant="body1">
            Are you sure you want to delete <strong>{company?.companyName}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will:
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>Remove the company permanently</li>
              <li>Unlink all representatives from this company</li>
              <li>Delete the associated booth (if any)</li>
            </ul>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteCompanyDialogOpen(false)
            }}
            disabled={deletingCompany}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteCompanyConfirm}
            variant="contained"
            color="error"
            disabled={deletingCompany}
            startIcon={deletingCompany ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deletingCompany ? "Deleting..." : "Delete Company"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Job Posting Dialog */}
      <Dialog
        open={jobDialogOpen}
        onClose={() => !savingJob && resetJobForm()}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingJob ? "Edit Job Posting" : "Create Job Posting"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Fill in the details for your job posting. Title, description, skills, and location are required.
          </Typography>

          {(jobErrors.title || jobErrors.description || jobErrors.skills || jobErrors.location) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {jobErrors.title || jobErrors.description || jobErrors.skills || jobErrors.location}
            </Alert>
          )}

          {JOB_FIELDS.map(({ id, name, label, key, multiline, rows, placeholder, helperText }) => (
            <TextField
              key={id}
              fullWidth
              id={id}
              label={label}
              multiline={multiline}
              rows={rows}
              slotProps={{ htmlInput: { name } }}
              value={jobForm[key]}
              onChange={(e) => {
                setJobForm((prev) => ({ ...prev, [key]: e.target.value }))
                if (jobErrors[key]) setJobErrors((prev) => ({ ...prev, [key]: undefined }))
              }}
              placeholder={placeholder}
              error={!!jobErrors[key]}
              helperText={jobErrors[key] || helperText}
              disabled={savingJob}
              sx={{ mb: 2 }}
            />
          ))}

          <FormControlLabel
            control={
              <Checkbox
                checked={jobForm.locationIsRemote}
                onChange={(_, checked) => {
                  setJobForm((prev) => ({
                    ...prev,
                    locationIsRemote: checked,
                    ...(checked ? { locationInput: "", locationPick: null } : {}),
                  }))
                  if (jobErrors.location) setJobErrors((prev) => ({ ...prev, location: undefined }))
                }}
                disabled={savingJob}
              />
            }
            label="Remote position (work from anywhere)"
            sx={{ mb: 1, display: "block" }}
          />

          {!jobForm.locationIsRemote && (
            <Autocomplete
              size="small"
              options={jobLocationOptions}
              loading={jobLocationSuggestLoading}
              filterOptions={(opts) => opts}
              value={jobForm.locationPick}
              inputValue={jobForm.locationInput}
              onInputChange={(_, v, reason) => {
                setJobForm((prev) => ({
                  ...prev,
                  locationInput: v,
                  ...(reason === "input" || reason === "clear" ? { locationPick: null } : {}),
                }))
                if (jobErrors.location) setJobErrors((prev) => ({ ...prev, location: undefined }))
              }}
              onChange={(_, newValue) => {
                if (newValue && typeof newValue === "object" && "lat" in newValue) {
                  setJobForm((prev) => ({
                    ...prev,
                    locationPick: newValue,
                    locationInput: newValue.label,
                  }))
                } else {
                  setJobForm((prev) => ({ ...prev, locationPick: null }))
                }
                if (jobErrors.location) setJobErrors((prev) => ({ ...prev, location: undefined }))
              }}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
              isOptionEqualToValue={(a, b) =>
                typeof a === "object" &&
                typeof b === "object" &&
                Boolean(a?.id && b?.id && a.id === b.id)
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Job location *"
                  placeholder="Start typing for suggestions"
                  error={!!jobErrors.location}
                  helperText={jobErrors.location || "Pick a place from the list"}
                />
              )}
              sx={{ mb: 2 }}
              disabled={savingJob}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={resetJobForm} disabled={savingJob}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveJob}
            variant="contained"
            disabled={savingJob}
            sx={{
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            {saveButtonLabel}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Job Confirmation Dialog */}
      <Dialog
        open={deleteJobDialogOpen}
        onClose={() => !deletingJob && setDeleteJobDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Job Posting</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the job posting <strong>"{jobToDelete?.name}"</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action cannot be undone. Students will no longer be able to see this job posting.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteJobDialogOpen(false)} disabled={deletingJob}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteJobConfirm}
            variant="contained"
            color="error"
            disabled={deletingJob}
            startIcon={deletingJob ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deletingJob ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Job Invite Dialog */}
      {selectedJobForInvite && (
        <JobInviteDialog
          open={inviteDialogOpen}
          onClose={() => {
            setInviteDialogOpen(false)
            setSelectedJobForInvite(null)
          }}
          jobId={selectedJobForInvite.id}
          jobTitle={selectedJobForInvite.name}
          boothId={company?.boothId}
          onSuccess={handleInviteSuccess}
        />
      )}

      {/* Job Invite Stats Dialog */}
      {selectedJobForStats && (
        <JobInviteStatsDialog
          open={statsDialogOpen}
          onClose={() => {
            setStatsDialogOpen(false)
            setSelectedJobForStats(null)
          }}
          jobId={selectedJobForStats.id}
          jobTitle={selectedJobForStats.name}
        />
      )}

      {/* Application Form Builder Dialog */}
      {selectedJobForForm && (
        <ApplicationFormBuilderDialog
          open={applicationFormDialogOpen}
          onClose={() => {
            setApplicationFormDialogOpen(false)
            setSelectedJobForForm(null)
          }}
          jobId={selectedJobForForm.id}
          jobName={selectedJobForForm.name}
          initialForm={selectedJobForForm.applicationForm}
          onSaved={(updatedForm) => {
            setJobs((prev) =>
              prev.map((job) =>
                job.id === selectedJobForForm.id ? { ...job, applicationForm: updatedForm } : job
              )
            )
          }}
        />
      )}

      {/* Delete Application Form Confirmation Dialog */}
      <Dialog open={deleteFormDialogOpen} onClose={() => { if (!deletingForm) { setDeleteFormDialogOpen(false); setJobToDeleteForm(null) } }}>
        <DialogTitle>Delete Application Form</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the application form for <strong>{jobToDeleteForm?.name}</strong>? This action cannot be undone and students will no longer be able to apply through this form.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteFormDialogOpen(false); setJobToDeleteForm(null) }} disabled={deletingForm}>
            Cancel
          </Button>
          <Button onClick={handleDeleteFormConfirm} color="error" variant="contained" disabled={deletingForm}>
            {deletingForm ? "Deleting..." : "Delete Form"}
          </Button>
        </DialogActions>
      </Dialog>

    </BaseLayout>
  )
}

