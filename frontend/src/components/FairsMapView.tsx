import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import Map, { Marker, NavigationControl, Popup, type MapRef } from "react-map-gl/mapbox"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Alert, Box, Button, Typography } from "@mui/material"
import { MAPBOX_ACCESS_TOKEN, MAPBOX_TOKEN_LOOKS_PUBLIC } from "../config"

/** Minimal fair shape for map pins (matches API list items). */
export interface FairMapItem {
  id: string
  name: string
  startTime: number | null
  endTime: number | null
  venueGeo?: { latitude: number; longitude: number } | null
}

function formatWhen(ms: number | null): string {
  if (!ms) return "TBD"
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function filterFairsForMapView<T extends FairMapItem>(fairs: T[]): T[] {
  const now = Date.now()
  return fairs.filter((f) => {
    const g = f.venueGeo
    if (!g || typeof g.latitude !== "number" || typeof g.longitude !== "number") return false
    if (f.endTime !== null && now > f.endTime) return false
    return true
  })
}

const DEFAULT_CENTER = { longitude: -98.35, latitude: 39.5 }
const DEFAULT_ZOOM = 3.2

type Props = {
  fairs: FairMapItem[]
}

export default function FairsMapView({ fairs }: Readonly<Props>) {
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)
  const [mapReady, setMapReady] = useState(false)
  const [popupFair, setPopupFair] = useState<FairMapItem | null>(null)
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)

  const mappable = useMemo(() => filterFairsForMapView(fairs), [fairs])

  useEffect(() => {
    if (!MAPBOX_TOKEN_LOOKS_PUBLIC) return
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
  }, [])

  const fitMapToFairs = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map || mappable.length === 0) return

    if (mappable.length === 1) {
      const { longitude, latitude } = mappable[0].venueGeo!
      map.easeTo({ center: [longitude, latitude], zoom: 8, duration: 0 })
      return
    }

    const bounds = new mapboxgl.LngLatBounds()
    for (const f of mappable) {
      const g = f.venueGeo!
      bounds.extend([g.longitude, g.latitude])
    }
    map.fitBounds(bounds, { padding: 72, maxZoom: 11, duration: 0 })
  }, [mappable])

  const onMapLoad = useCallback(() => {
    setMapReady(true)
  }, [])

  useEffect(() => {
    if (!mapReady) return
    fitMapToFairs()
  }, [mapReady, fitMapToFairs])

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Map view needs a Mapbox token. Set{" "}
        <Box component="code" sx={{ px: 0.5 }}>VITE_MAPBOX_ACCESS_TOKEN</Box> in{" "}
        <Box component="code" sx={{ px: 0.5 }}>.env</Box> and restart the dev server.
      </Alert>
    )
  }

  if (!MAPBOX_TOKEN_LOOKS_PUBLIC) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <Typography variant="body2" component="div" sx={{ mb: 1 }}>
          Mapbox returned 401 when the token does not look like a{" "}
          <strong>public</strong> access token. Browser maps must use a token that starts with{" "}
          <Box component="code" sx={{ px: 0.5 }}>pk.</Box> from{" "}
          <Box component="code" sx={{ px: 0.5 }}>Account → Access tokens</Box> in Mapbox.
        </Typography>
        <Typography variant="body2" component="div" color="text.secondary">
          Do not use a secret token (<Box component="code" sx={{ px: 0.5 }}>sk.</Box>) in{" "}
          <Box component="code" sx={{ px: 0.5 }}>.env</Box>. Remove quotes around the value, save, and restart{" "}
          <Box component="code" sx={{ px: 0.5 }}>npm run dev</Box>. If it still fails, create a new public token or
          check URL restrictions allow your dev origin (e.g. <Box component="code" sx={{ px: 0.5 }}>http://localhost:5173</Box>
          ).
        </Typography>
      </Alert>
    )
  }

  if (mappable.length === 0) {
    return (
      <Box sx={{ px: 2.5, py: 4, textAlign: "center" }}>
        <Typography variant="body1" color="text.secondary">
          No live or upcoming fairs with a saved location to show on the map yet.
        </Typography>
      </Box>
    )
  }

  if (mapLoadError) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <Typography variant="body2" component="div" sx={{ mb: 1 }}>
          Mapbox could not load the map: {mapLoadError}
        </Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          Copy a fresh <Box component="code" sx={{ px: 0.5 }}>pk.</Box> token from Mapbox → Access tokens. Ensure{" "}
          <Box component="code" sx={{ px: 0.5 }}>VITE_MAPBOX_ACCESS_TOKEN</Box> in{" "}
          <Box component="code" sx={{ px: 0.5 }}>frontend/.env</Box> has no extra spaces or line breaks, then restart Vite.
          If the token uses URL restrictions, allow this origin (e.g. port{" "}
          <Box component="code" sx={{ px: 0.5 }}>5173</Box>).
        </Typography>
      </Alert>
    )
  }

  return (
    <Box sx={{ position: "relative", width: "100%", minHeight: { xs: 320, sm: 420 }, height: { sm: 480 } }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        initialViewState={{
          ...DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
        }}
        style={{ width: "100%", height: "100%" }}
        onLoad={onMapLoad}
        onError={(e) => {
          const err = e.error
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : "Invalid or unauthorized Mapbox access token."
          setMapLoadError(msg)
        }}
      >
        <NavigationControl position="top-right" />
        {mappable.map((fair) => {
          const g = fair.venueGeo!
          return (
            <Marker
              key={fair.id}
              longitude={g.longitude}
              latitude={g.latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                setPopupFair(fair)
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  bgcolor: "secondary.main",
                  border: "2px solid white",
                  boxShadow: 1,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "secondary.dark" },
                }}
              />
            </Marker>
          )
        })}
        {popupFair && popupFair.venueGeo && (
          <Popup
            longitude={popupFair.venueGeo.longitude}
            latitude={popupFair.venueGeo.latitude}
            anchor="top"
            onClose={() => setPopupFair(null)}
            closeOnClick={false}
            maxWidth="280px"
          >
            <Box sx={{ p: 0.5 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                {popupFair.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                {formatWhen(popupFair.startTime)}
                {popupFair.endTime ? ` – ${formatWhen(popupFair.endTime)}` : ""}
              </Typography>
              <Button size="small" variant="contained" onClick={() => navigate(`/fair/${popupFair.id}`)}>
                View fair
              </Button>
            </Box>
          </Popup>
        )}
      </Map>
    </Box>
  )
}
