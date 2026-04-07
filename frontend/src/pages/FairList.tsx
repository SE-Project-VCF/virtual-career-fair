import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import EventIcon from "@mui/icons-material/Event"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import MyLocationIcon from "@mui/icons-material/MyLocation"
import MapIcon from "@mui/icons-material/Map"
import TravelExploreIcon from "@mui/icons-material/TravelExplore"
import BaseLayout from "../components/BaseLayout"
import FairsMapView, { filterFairsForMapView } from "../components/FairsMapView"
import { API_URL } from "../config"
import { authUtils } from "../utils/auth"
import { auth } from "../firebase"
import { useGeocodeSuggest } from "../hooks/useGeocodeSuggest"

function waitForFirebaseUser(): Promise<typeof auth.currentUser> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000)
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        clearTimeout(timer)
        unsub()
        resolve(u)
      }
    })
  })
}

export interface Fair {
  id: string
  name: string
  description: string | null
  isLive: boolean
  startTime: number | null
  endTime: number | null
  venueCity?: string | null
  venueState?: string | null
  venueZip?: string | null
  venueGeo?: { latitude: number; longitude: number } | null
  distanceMiles?: number
}

function getFairStatus(fair: Fair): { label: string; color: "success" | "secondary" | "warning" | "default" } {
  const now = Date.now()
  if (fair.isLive) return { label: "Live Now", color: "success" }
  if (fair.startTime && now < fair.startTime) return { label: "Upcoming", color: "secondary" }
  if (fair.endTime && now > fair.endTime) return { label: "Ended", color: "default" }
  return { label: "Scheduled", color: "warning" }
}

function formatDate(ms: number | null): string {
  if (!ms) return "TBD"
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function FairList() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const isCompanyUser = user?.role === "companyOwner" || user?.role === "representative"

  const [fairs, setFairs] = useState<Fair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // enrolledMap: fairId → boothId (null if enrolled but no booth yet)
  const [enrolledMap, setEnrolledMap] = useState<Record<string, string | null>>({})

  // Join dialog state
  const [joinDialogFairId, setJoinDialogFairId] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")

  // Leave dialog state
  const [leaveDialogFairId, setLeaveDialogFairId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState("")

  const [geoFilterActive, setGeoFilterActive] = useState(false)
  const [geoSearchSummary, setGeoSearchSummary] = useState<{
    locationLabel: string
    radiusMiles: number
  } | null>(null)
  const [searchAddress, setSearchAddress] = useState("")
  const [radiusMiles, setRadiusMiles] = useState("50")
  const [browserCoords, setBrowserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoHint, setGeoHint] = useState("")
  const [selectedPlace, setSelectedPlace] = useState<{
    placeName: string
    lat: number
    lng: number
  } | null>(null)
  const [exploreView, setExploreView] = useState<"search" | "map">("search")

  const { options: locationOptions, loading: locationSuggestLoading } = useGeocodeSuggest(
    searchAddress,
    !browserCoords,
  )

  const loadFairsFromUrl = async (url: string, options?: { geo?: boolean }) => {
    const res = await fetch(url)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "Failed to load fairs")
    setFairs(data.fairs || [])
    if (options?.geo === true) setGeoFilterActive(true)
    else setGeoFilterActive(false)
    if (!options?.geo) {
      setBrowserCoords(null)
      setSelectedPlace(null)
      setGeoSearchSummary(null)
    }
  }

  useEffect(() => {
    async function loadFairs() {
      try {
        setError("")
        await loadFairsFromUrl(`${API_URL}/api/fairs`)
      } catch (err: any) {
        console.error(err)
        setError(err?.message || "Failed to load career fairs")
      } finally {
        setLoading(false)
      }
    }
    loadFairs()
  }, [])

  useEffect(() => {
    if (exploreView !== "map") return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`${API_URL}/api/fairs`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Failed to load fairs")
        if (cancelled) return
        setFairs(data.fairs || [])
        setGeoFilterActive(false)
        setBrowserCoords(null)
        setSelectedPlace(null)
        setGeoSearchSummary(null)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load career fairs")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [exploreView])

  const mapEligibleFairs = useMemo((): Fair[] => filterFairsForMapView(fairs), [fairs])
  const displayFairs: Fair[] = exploreView === "map" ? mapEligibleFairs : fairs

  const executeGeoSearch = async (
    location: { kind: "coords"; lat: number; lng: number } | { kind: "address"; address: string },
    locationLabelForBanner: string,
  ) => {
    const r = Number.parseFloat(radiusMiles)
    if (!Number.isFinite(r) || r <= 0) {
      setGeoHint("Choose a valid radius.")
      return
    }
    let qs = `radiusMiles=${encodeURIComponent(String(r))}`
    if (location.kind === "coords") {
      qs += `&lat=${encodeURIComponent(String(location.lat))}&lng=${encodeURIComponent(String(location.lng))}`
    } else {
      qs += `&address=${encodeURIComponent(location.address.trim())}`
    }
    setLoading(true)
    setError("")
    setGeoHint("")
    try {
      await loadFairsFromUrl(`${API_URL}/api/fairs?${qs}`, { geo: true })
      setGeoSearchSummary({ locationLabel: locationLabelForBanner, radiusMiles: r })
    } catch (err: any) {
      setError(err?.message || "Search failed")
    } finally {
      setLoading(false)
    }
  }

  const handleUseMyLocation = () => {
    setGeoHint("")
    if (!navigator.geolocation) {
      setGeoHint("Location is not available in this browser.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setBrowserCoords({ lat, lng })
        setSearchAddress("")
        void executeGeoSearch({ kind: "coords", lat, lng }, "Your current location")
      },
      () => setGeoHint("Could not read your location. Check browser permissions."),
      { enableHighAccuracy: false, timeout: 15000 },
    )
  }

  const handleSearchByDistance = () => {
    if (browserCoords) {
      void executeGeoSearch(
        { kind: "coords", lat: browserCoords.lat, lng: browserCoords.lng },
        "Your current location",
      )
    } else if (
      searchAddress.trim() === selectedPlace?.placeName?.trim() &&
      selectedPlace
    ) {
      void executeGeoSearch(
        {
          kind: "coords",
          lat: selectedPlace.lat,
          lng: selectedPlace.lng,
        },
        selectedPlace.placeName,
      )
    } else if (searchAddress.trim()) {
      void executeGeoSearch(
        { kind: "address", address: searchAddress.trim() },
        searchAddress.trim(),
      )
    } else {
      setGeoHint("Enter a location or use your current location.")
    }
  }

  const handleClearGeoFilter = async () => {
    setSearchAddress("")
    setBrowserCoords(null)
    setSelectedPlace(null)
    setGeoHint("")
    setLoading(true)
    setError("")
    try {
      await loadFairsFromUrl(`${API_URL}/api/fairs`)
    } catch (err: any) {
      setError(err?.message || "Failed to load career fairs")
    } finally {
      setLoading(false)
    }
  }

  // Load enrollment status for company users
  useEffect(() => {
    if (!isCompanyUser) return
    async function loadEnrollments() {
      try {
        // auth.currentUser may be null on first render if Firebase hasn't restored
        // the session yet — wait up to 3s for it to become available
        const firebaseUser = auth.currentUser ?? await waitForFirebaseUser()
        if (!firebaseUser) {
          console.warn("loadEnrollments: no Firebase user after waiting")
          return
        }
        const token = await firebaseUser.getIdToken()
        const res = await fetch(`${API_URL}/api/fairs/my-enrollments`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          console.error("loadEnrollments: API returned", res.status, await res.text().catch(() => ""))
          return
        }
        const data = await res.json()
        const map: Record<string, string | null> = {}
        for (const e of data.enrollments || []) {
          map[e.fairId] = e.boothId
        }
        setEnrolledMap(map)
      } catch (err) {
        console.error("Error loading enrollments:", err)
      }
    }
    loadEnrollments()
  }, [isCompanyUser])

  const handleOpenJoinDialog = (fairId: string) => {
    setJoinDialogFairId(fairId)
    setInviteCode("")
    setJoinError("")
  }

  const handleCloseJoinDialog = () => {
    setJoinDialogFairId(null)
    setInviteCode("")
    setJoinError("")
  }

  const handleJoinFair = async () => {
    if (!inviteCode.trim() || !joinDialogFairId) return
    setJoining(true)
    setJoinError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${joinDialogFairId}/enroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to join fair")

      // Update local enrollment state and close dialog — user can click Edit Booth when ready
      setEnrolledMap((prev) => ({ ...prev, [joinDialogFairId]: data.boothId || null }))
      handleCloseJoinDialog()
    } catch (err: any) {
      setJoinError(err.message)
    } finally {
      setJoining(false)
    }
  }

  const handleLeaveFair = async () => {
    if (!leaveDialogFairId) return
    setLeaving(true)
    setLeaveError("")
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/${leaveDialogFairId}/leave`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to leave fair")

      setEnrolledMap((prev) => {
        const next = { ...prev }
        delete next[leaveDialogFairId]
        return next
      })
      setLeaveDialogFairId(null)
    } catch (err: any) {
      setLeaveError(err.message)
    } finally {
      setLeaving(false)
    }
  }

  const joinDialogFair = fairs.find((f) => f.id === joinDialogFairId)
  const leaveDialogFair = fairs.find((f) => f.id === leaveDialogFairId)

  const handleExploreViewChange = (_: unknown, next: "search" | "map" | null) => {
    if (next !== null) setExploreView(next)
  }

  return (
    <BaseLayout pageTitle="Career Fairs">
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Box
          sx={{
            mb: 3,
            pb: 3,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="h5"
            component="p"
            sx={{
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "text.primary",
              mb: 1,
            }}
          >
            Discover virtual career fairs
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 560, lineHeight: 1.65 }}>
            Browse events, search by distance or open the map for live and upcoming fairs with a saved location, and join
            with an invite code from the organizer.
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress color="primary" />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        <Card
          elevation={0}
          sx={{
            mb: 3,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            background: (theme) =>
              `linear-gradient(145deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.07)} 100%)`,
          }}
        >
          <Box
            sx={{
              px: 2.5,
              py: 1.75,
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { xs: "stretch", sm: "flex-start" },
                justifyContent: "space-between",
                gap: 1.5,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {exploreView === "search" ? "Find fairs by distance" : "Fair locations on the map"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {exploreView === "search"
                    ? "Choose a suggestion to search immediately, or type an address and press Search. My location also searches right away (uses the radius below)."
                    : "Pins show live and upcoming fairs that have a hub location saved. Click a pin for details."}
                </Typography>
              </Box>
              <ToggleButtonGroup
                value={exploreView}
                exclusive
                onChange={handleExploreViewChange}
                size="small"
                aria-label="Explore fairs by search or map"
                sx={{ flexShrink: 0, alignSelf: { xs: "stretch", sm: "center" } }}
              >
                <ToggleButton value="search" aria-label="Search by distance">
                  <TravelExploreIcon sx={{ mr: 0.75, fontSize: 20 }} />
                  Search
                </ToggleButton>
                <ToggleButton value="map" aria-label="Map view">
                  <MapIcon sx={{ mr: 0.75, fontSize: 20 }} />
                  Map
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
          {exploreView === "search" ? (
          <CardContent sx={{ pt: 2.5 }}>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid size={{ xs: 12, md: 5 }}>
                <Autocomplete
                  freeSolo
                  size="small"
                  options={locationOptions}
                  loading={locationSuggestLoading}
                  filterOptions={(opts) => opts}
                  getOptionLabel={(option) =>
                    typeof option === "string" ? option : option.label
                  }
                  isOptionEqualToValue={(a, b) =>
                    typeof a === "object" &&
                    typeof b === "object" &&
                    Boolean(a.id && b.id && a.id === b.id)
                  }
                  inputValue={searchAddress}
                  onInputChange={(_, newInputValue, reason) => {
                    if (reason === "reset") {
                      setSearchAddress(newInputValue)
                      return
                    }
                    setSearchAddress(newInputValue)
                    setBrowserCoords(null)
                    setGeoHint("")
                    if (reason === "input" || reason === "clear") {
                      setSelectedPlace(null)
                    }
                  }}
                  onChange={(_, newValue) => {
                    if (newValue && typeof newValue === "object" && "lat" in newValue) {
                      setSelectedPlace({
                        placeName: newValue.label,
                        lat: newValue.lat,
                        lng: newValue.lng,
                      })
                      setSearchAddress(newValue.label)
                      void executeGeoSearch(
                        {
                          kind: "coords",
                          lat: newValue.lat,
                          lng: newValue.lng,
                        },
                        newValue.label,
                      )
                    }
                  }}
                  disabled={!!browserCoords}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="City, address, or ZIP"
                      placeholder={
                        browserCoords ? "Using your location" : "Start typing for suggestions"
                      }
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="fair-radius-label">Radius</InputLabel>
                  <Select
                    labelId="fair-radius-label"
                    label="Radius"
                    value={radiusMiles}
                    onChange={(e) => setRadiusMiles(e.target.value)}
                  >
                    <MenuItem value="10">10 miles</MenuItem>
                    <MenuItem value="25">25 miles</MenuItem>
                    <MenuItem value="50">50 miles</MenuItem>
                    <MenuItem value="100">100 miles</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={<LocationOnIcon />}
                    onClick={handleSearchByDistance}
                    disabled={loading}
                  >
                    Search
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<MyLocationIcon />}
                    onClick={handleUseMyLocation}
                    disabled={loading}
                  >
                    My location
                  </Button>
                  {geoFilterActive && (
                    <Button variant="text" color="inherit" onClick={handleClearGeoFilter} disabled={loading}>
                      Clear filters
                    </Button>
                  )}
                </Box>
              </Grid>
            </Grid>
            {geoHint && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {geoHint}
              </Typography>
            )}
          </CardContent>
          ) : (
            <FairsMapView fairs={fairs} />
          )}
        </Card>

        {exploreView === "search" && geoFilterActive && geoSearchSummary && (
          <Box
            sx={(theme) => ({
              mb: 3,
              px: 2,
              py: 1.5,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: alpha(theme.palette.secondary.main, 0.08),
              display: "flex",
              alignItems: "flex-start",
              gap: 1.25,
            })}
          >
            <LocationOnIcon sx={{ color: "secondary.main", mt: 0.15 }} fontSize="small" />
            <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.5 }}>
              Showing results for{" "}
              <Box component="span" fontWeight={700}>
                {geoSearchSummary.locationLabel}
              </Box>
              {" "}
              within{" "}
              <Box component="span" fontWeight={700}>
                {geoSearchSummary.radiusMiles}
              </Box>{" "}
              {geoSearchSummary.radiusMiles === 1 ? "mile" : "miles"}.
            </Typography>
          </Box>
        )}

        {!loading && !error && exploreView === "search" && fairs.length === 0 && geoFilterActive && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <LocationOnIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No fairs found within this distance.
            </Typography>
            <Typography color="text.secondary" mt={1}>
              Try a larger radius, a different location, or clear filters.
            </Typography>
            <Button sx={{ mt: 2 }} variant="outlined" onClick={handleClearGeoFilter}>
              Clear filters
            </Button>
          </Box>
        )}

        {!loading &&
          !error &&
          fairs.length === 0 &&
          !(exploreView === "search" && geoFilterActive) && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <EventIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No career fairs available
            </Typography>
            <Typography color="text.secondary" mt={1}>
              Check back soon for upcoming events
            </Typography>
          </Box>
        )}

        <Grid container spacing={3}>
          {displayFairs.length > 0 && displayFairs.map((fair) => {
            const status = getFairStatus(fair)
            const isEnded = fair.endTime !== null && Date.now() > fair.endTime
            const isEnrolled = fair.id in enrolledMap
            const boothId = enrolledMap[fair.id]

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={fair.id}>
                <Card sx={(theme) => ({
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: isEnrolled ? theme.palette.secondary.main : theme.palette.divider,
                  boxShadow: "none",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  "&:hover": {
                    borderColor: isEnrolled ? theme.palette.secondary.dark : alpha(theme.palette.primary.main, 0.45),
                    boxShadow: `0 10px 28px ${alpha(theme.palette.common.black, 0.07)}`,
                  },
                  ...(isEnrolled && {
                    bgcolor: alpha(theme.palette.secondary.main, 0.06),
                  }),
                })}>
                  {isEnrolled && (
                    <Box sx={(theme) => ({
                      background: `linear-gradient(90deg, ${theme.palette.secondary.dark} 0%, ${theme.palette.secondary.main} 100%)`,
                      color: theme.palette.secondary.contrastText,
                      px: 2,
                      py: 0.75,
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    })}>
                      <CheckCircleIcon sx={{ fontSize: 16 }} />
                      <Typography variant="caption" fontWeight="bold" sx={{ letterSpacing: 0.5 }}>
                        {user?.companyName ? `${user.companyName} is enrolled` : "Your company is enrolled"}
                      </Typography>
                    </Box>
                  )}
                  <CardContent sx={{ flexGrow: 1, pt: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1, gap: 1 }}>
                      <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: "-0.02em", lineHeight: 1.25 }}>
                        {fair.name}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                        <Chip label={status.label} color={status.color} size="small" />
                      </Box>
                    </Box>

                    {fair.description && (
                      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                        {fair.description}
                      </Typography>
                    )}

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
                      <EventIcon fontSize="small" />
                      <Typography variant="body2">
                        {fair.startTime ? formatDate(fair.startTime) : "Date TBD"}
                        {fair.endTime ? ` – ${formatDate(fair.endTime)}` : ""}
                      </Typography>
                    </Box>

                    {(fair.venueCity || fair.venueState || fair.venueZip || fair.distanceMiles !== undefined) && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", mt: 1 }}>
                        <LocationOnIcon fontSize="small" />
                        <Typography variant="body2">
                          {[
                            [fair.venueCity, fair.venueState].filter(Boolean).join(", "),
                            fair.venueZip,
                          ].filter(Boolean).join(" ")
                            || "Location set"}
                          {fair.distanceMiles === undefined ? "" : ` · ${fair.distanceMiles} mi away`}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0, flexWrap: "wrap", gap: 1 }}>
                    <Button
                      variant={isEnrolled ? "outlined" : "contained"}
                      endIcon={<ArrowForwardIcon />}
                      onClick={() => navigate(`/fair/${fair.id}`)}
                      fullWidth={!isCompanyUser || isEnded}
                      sx={{ flexGrow: 1 }}
                    >
                      View Fair
                    </Button>

                    {isCompanyUser && !isEnded && (
                      isEnrolled ? (
                        <>
                          <Button
                            variant="contained"
                            color="secondary"
                            onClick={() =>
                              navigate(
                                boothId && user?.companyId
                                  ? `/fair/${fair.id}/company/${user.companyId}/booth?bid=${boothId}`
                                  : `/fair/${fair.id}`
                              )
                            }
                            sx={{ flexGrow: 1 }}
                          >
                            Edit Booth
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={() => { setLeaveDialogFairId(fair.id); setLeaveError("") }}
                            sx={{ flexGrow: 1 }}
                          >
                            Leave Fair
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outlined"
                          color="primary"
                          onClick={() => handleOpenJoinDialog(fair.id)}
                          sx={{ flexGrow: 1 }}
                        >
                          Join Fair
                        </Button>
                      )
                    )}
                  </CardActions>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      </Container>

      {/* Join Fair dialog */}
      <Dialog
        open={joinDialogFairId !== null}
        onClose={handleCloseJoinDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Join {joinDialogFair?.name ?? "Fair"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the invite code provided by the event organizer.
          </Typography>
          <TextField
            label="Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 12))}
            fullWidth
            autoFocus
            slotProps={{ htmlInput: { maxLength: 12, style: { textTransform: "uppercase", letterSpacing: 2 } } }}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoinFair() }}
          />
          {joinError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {joinError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseJoinDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleJoinFair}
            disabled={joining || !inviteCode.trim()}
          >
            {joining ? "Joining..." : "Join Fair"}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Leave Fair confirmation dialog */}
      <Dialog
        open={leaveDialogFairId !== null}
        onClose={() => setLeaveDialogFairId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Leave {leaveDialogFair?.name ?? "Fair"}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your company's booth and job listings will be removed from this fair. You will need a new invite code to rejoin.
          </Typography>
          {leaveError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {leaveError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveDialogFairId(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleLeaveFair}
            disabled={leaving}
          >
            {leaving ? "Leaving..." : "Leave Fair"}
          </Button>
        </DialogActions>
      </Dialog>
    </BaseLayout>
  )
}
