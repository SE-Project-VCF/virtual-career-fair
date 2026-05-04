import { useState, useEffect, type ElementType, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Paper,
  Stack,
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import BusinessIcon from "@mui/icons-material/Business"
import PeopleIcon from "@mui/icons-material/People"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import { useFair } from "../contexts/FairContext"
import { authUtils } from "../utils/auth"
import { INDUSTRY_LABELS } from "../utils/boothConstants"
import { fetchFairBoothsForFair } from "../utils/fairBoothsApi"

const ACCENT_GREEN = "#388560"

interface Booth {
  id: string
  companyName: string
  industry: string | null
  companySize: string | null
  location: string | null
  logoUrl?: string | null
  companyId: string
}

const META_ROW_SX = {
  display: "flex",
  alignItems: "center",
  gap: 0.5,
  color: "text.secondary",
  mb: 0.5,
} as const

function BoothMetaRow({ Icon, label }: Readonly<{ Icon: ElementType; label: ReactNode }>) {
  return (
    <Box sx={META_ROW_SX}>
      <Icon fontSize="small" />
      <Typography variant="body2">{label}</Typography>
    </Box>
  )
}

function FairBoothCard({ booth, fairId }: Readonly<{ booth: Booth; fairId: string }>) {
  const navigate = useNavigate()
  const boothPath = `/fair/${fairId}/booth/${booth.id}`
  const goToBooth = () => navigate(boothPath)

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        cursor: "pointer",
        overflow: "hidden",
        transition: "box-shadow 0.2s ease",
        "&:hover": {
          boxShadow: 3,
          borderColor: alpha(ACCENT_GREEN, 0.45),
        },
      }}
      onClick={goToBooth}
    >
      <Box
        sx={{
          height: 88,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "grey.50",
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 2,
        }}
      >
        {booth.logoUrl ? (
          <img
            src={booth.logoUrl}
            alt={booth.companyName}
            style={{ maxHeight: 56, maxWidth: "100%", objectFit: "contain" }}
          />
        ) : (
          <BusinessIcon sx={{ fontSize: 40, color: "grey.300" }} aria-hidden />
        )}
      </Box>

      <CardContent sx={{ flexGrow: 1, pt: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom component="div">
          {booth.companyName}
        </Typography>

        {booth.industry && (
          <BoothMetaRow Icon={BusinessIcon} label={INDUSTRY_LABELS[booth.industry] ?? booth.industry} />
        )}
        {booth.companySize && <BoothMetaRow Icon={PeopleIcon} label={booth.companySize} />}
        {booth.location && <BoothMetaRow Icon={LocationOnIcon} label={booth.location} />}
      </CardContent>

      <Box sx={{ px: 2, pb: 2, pt: 0 }}>
        <Button
          variant="contained"
          fullWidth
          disableElevation
          endIcon={<ArrowForwardIcon />}
          onClick={(e) => {
            e.stopPropagation()
            goToBooth()
          }}
          sx={{
            background: `linear-gradient(135deg, ${ACCENT_GREEN} 0%, #2d6b4d 100%)`,
            "&:hover": {
              background: `linear-gradient(135deg, #2f7351 0%, #245339 100%)`,
            },
          }}
        >
          View Booth
        </Button>
      </Box>
    </Card>
  )
}

function resolveBoothCountLine(loading: boolean, error: string, boothCount: number): string | undefined {
  if (loading || error) return undefined
  return boothCount === 1 ? "1 company" : `${boothCount} companies`
}

function resolveFairBoothSubtitle(isLive: boolean, fairLoading: boolean, isAdmin: boolean): string | undefined {
  if (fairLoading) return undefined
  if (isLive) return "Browse exhibitors and visit company booths."
  if (!isAdmin) return "Booths unlock when the fair goes live."
  return undefined
}

export interface FairBoothGridSectionProps {
  /** Heading above the grid (default: "{fair name} — Booths") */
  sectionTitle?: string
}

export default function FairBoothGridSection({ sectionTitle }: Readonly<FairBoothGridSectionProps>) {
  const { fair, isLive, loading: fairLoading, fairId } = useFair()
  const user = authUtils.getCurrentUser()
  const [booths, setBooths] = useState<Booth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (fairLoading || !fairId) return
    fetchBooths()
  }, [fairLoading, fairId])

  const fetchBooths = async () => {
    setLoading(true)
    setError("")
    try {
      const result = await fetchFairBoothsForFair<Booth>(fairId!)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setBooths(result.booths)
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = user?.role === "administrator"
  const heading =
    sectionTitle ?? `${fair?.name ?? "Career Fair"} — Booths`

  const boothCountLine = resolveBoothCountLine(loading, error, booths.length)

  const subtitle = resolveFairBoothSubtitle(isLive, fairLoading, isAdmin)

  const secondaryHeadingLines = [boothCountLine, subtitle].filter(
    (line): line is string => Boolean(line)
  )

  return (
    <Box sx={{ mt: 4 }}>
      <Stack spacing={0.75} sx={{ mb: 2 }}>
        <Typography variant="h5" component="h2" fontWeight={700}>
          {heading}
        </Typography>
        {secondaryHeadingLines.map((line) => (
          <Typography key={line} variant="body2" color="text.secondary">
            {line}
          </Typography>
        ))}
      </Stack>

      {!fairLoading && !isLive && !isAdmin && (
        <Alert severity="info" sx={{ mb: 3 }}>
          This fair is not currently live. Booths will be visible when the fair begins.
        </Alert>
      )}

      {(loading || fairLoading) && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: ACCENT_GREEN }} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {!loading && !error && booths.length === 0 && (isLive || isAdmin) && (
        <Paper
          variant="outlined"
          sx={{
            textAlign: "center",
            py: 6,
            px: 2,
            borderRadius: 2,
            bgcolor: alpha(ACCENT_GREEN, 0.04),
            borderColor: "divider",
          }}
        >
          <BusinessIcon sx={{ fontSize: 56, color: "text.disabled", mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No booths yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Check back soon for participating employers.
          </Typography>
        </Paper>
      )}

      <Grid container spacing={3}>
        {fairId &&
          booths.map((booth) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={booth.id}>
              <FairBoothCard booth={booth} fairId={fairId} />
            </Grid>
          ))}
      </Grid>
    </Box>
  )
}
