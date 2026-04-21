import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { Link as RouterLink } from "react-router-dom"
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Container,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material"
import CampaignIcon from "@mui/icons-material/Campaign"
import BaseLayout from "../components/BaseLayout"
import { API_URL } from "../config"
import { waitForFirebaseUser } from "../firebase"
import { authUtils } from "../utils/auth"

type AnnouncementRow = {
  id: string
  fairId: string
  fairName: string | null
  title: string
  description: string
  publishedAt: number | null
  createdAt: number | null
  fairStartTime: number | null
  fairEndTime: number | null
}

function formatTs(ms: number | null): string {
  if (ms == null) return "—"
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return "—"
  }
}

function fairWindowLabel(start: number | null, end: number | null): string {
  if (start == null && end == null) return "—"
  const a = formatTs(start)
  const b = formatTs(end)
  if (start != null && end != null) return `${a} – ${b}`
  if (end != null) return `Ends ${b}`
  return `Starts ${a}`
}

function isPastFair(r: AnnouncementRow, now: number): boolean {
  return r.fairEndTime != null && r.fairEndTime < now
}

function AnnouncementTable(props: Readonly<{ rows: AnnouncementRow[]; emptyHint: string }>) {
  const { rows, emptyHint } = props
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        {emptyHint}
      </Typography>
    )
  }

  const now = Date.now()

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: "action.hover" }}>
            <TableCell>Fair</TableCell>
            <TableCell>Announcement</TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>Published</TableCell>
            <TableCell>Fair dates</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.fairId}-${r.id}`} hover>
              <TableCell sx={{ verticalAlign: "top" }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
                  <Link component={RouterLink} to={`/fair/${r.fairId}`} fontWeight={600} underline="hover">
                    {r.fairName || r.fairId}
                  </Link>
                  {isPastFair(r, now) ? (
                    <Chip size="small" label="Past fair" variant="outlined" sx={{ height: 22 }} />
                  ) : (
                    <Chip size="small" label="Active / upcoming" color="success" variant="outlined" sx={{ height: 22 }} />
                  )}
                </Box>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top", maxWidth: 360 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {r.title}
                </Typography>
                {r.description.trim() ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                    {r.description}
                  </Typography>
                ) : null}
              </TableCell>
              <TableCell sx={{ verticalAlign: "top", whiteSpace: "nowrap" }}>{formatTs(r.publishedAt)}</TableCell>
              <TableCell sx={{ verticalAlign: "top", color: "text.secondary", fontSize: "0.875rem" }}>
                {fairWindowLabel(r.fairStartTime, r.fairEndTime)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default function FairAnnouncementsPage() {
  const user = authUtils.getCurrentUser()
  const [rows, setRows] = useState<AnnouncementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canUsePage =
    user && (user.role === "companyOwner" || user.role === "representative")

  const load = useCallback(async () => {
    if (!user?.uid || !canUsePage) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const firebaseUser = await waitForFirebaseUser()
      if (!firebaseUser) {
        setError("Could not verify your session. Try refreshing the page.")
        return
      }
      const token = await firebaseUser.getIdToken()
      const res = await fetch(`${API_URL}/api/fairs/my-announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setError("Could not load announcements.")
        return
      }
      const data = await res.json()
      setRows(data.announcements || [])
    } catch {
      setError("Could not load announcements.")
    } finally {
      setLoading(false)
    }
  }, [user?.uid, canUsePage])

  useEffect(() => {
    void load()
  }, [load])

  const { pastRows, activeRows } = useMemo(() => {
    const t = Date.now()
    const past: AnnouncementRow[] = []
    const active: AnnouncementRow[] = []
    for (const r of rows) {
      if (isPastFair(r, t)) past.push(r)
      else active.push(r)
    }
    return { pastRows: past, activeRows: active }
  }, [rows])

  if (!user) return null

  let mainContent: ReactNode
  if (!canUsePage) {
    mainContent = <Alert severity="info">This page is available to company owners and representatives.</Alert>
  } else if (loading) {
    mainContent = (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    )
  } else if (error) {
    mainContent = <Alert severity="error">{error}</Alert>
  } else if (rows.length === 0) {
    mainContent = (
      <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
        <Typography variant="body1" color="text.secondary">
          No published announcements yet for your enrolled fairs.
        </Typography>
      </Paper>
    )
  } else {
    mainContent = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
            Upcoming and current fairs
          </Typography>
          <AnnouncementTable rows={activeRows} emptyHint="None in this section." />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
            Past fairs
          </Typography>
          <AnnouncementTable rows={pastRows} emptyHint="No announcements from past fairs yet." />
        </Box>
      </Box>
    )
  }

  return (
    <BaseLayout pageTitle="Fair announcements">
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 3, display: "flex", alignItems: "flex-start", gap: 1.5 }}>
          <CampaignIcon sx={{ color: "warning.dark", mt: 0.5 }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: "#1a1a1a", mb: 0.5 }}>
              Fair announcements
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Published announcements for career fairs your company is enrolled in. This list includes older fairs and
              announcements you may have closed on the dashboard.
            </Typography>
          </Box>
        </Box>

        {mainContent}
      </Container>
    </BaseLayout>
  )
}
