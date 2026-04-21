import { useEffect, useState, useCallback } from "react"
import { Link as RouterLink } from "react-router-dom"
import { Box, Typography, IconButton, Paper, Link } from "@mui/material"
import { alpha } from "@mui/material/styles"
import CloseIcon from "@mui/icons-material/Close"
import CampaignIcon from "@mui/icons-material/Campaign"
import { waitForFirebaseUser } from "../firebase"
import { API_URL } from "../config"
import type { User } from "../utils/auth"

const DISMISS_PREFIX = "fairAnnouncementDismissed:"

type FairAnnouncementItem = {
  id: string
  fairId: string
  fairName: string | null
  title: string
  description: string
  published: boolean
  publishedAt: number | null
  fairStartTime?: number | null
  fairEndTime?: number | null
}

export default function FairAnnouncementsBanner({
  user,
}: Readonly<{
  user: User | null
}>) {
  const [items, setItems] = useState<FairAnnouncementItem[]>([])

  const dismissStorageKey = useCallback(
    (announcementId: string) => `${DISMISS_PREFIX}${user?.uid ?? ""}:${announcementId}`,
    [user?.uid],
  )

  const load = useCallback(async () => {
    if (!user?.uid) return
    if (user.role !== "companyOwner" && user.role !== "representative") return
    if (!user.companyId) return
    try {
      const firebaseUser = await waitForFirebaseUser()
      if (!firebaseUser) return
      const token = await firebaseUser.getIdToken()
      if (!token) return
      const res = await fetch(`${API_URL}/api/fairs/my-announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const list: FairAnnouncementItem[] = data.announcements || []
      const filtered = list.filter((a) => {
        try {
          return globalThis.localStorage.getItem(dismissStorageKey(a.id)) !== "1"
        } catch {
          return true
        }
      })
      setItems(filtered)
    } catch {
      /* ignore */
    }
  }, [user?.uid, user?.role, user?.companyId, dismissStorageKey])

  useEffect(() => {
    void load()
  }, [load])

  const dismiss = (announcementId: string) => {
    try {
      globalThis.localStorage.setItem(dismissStorageKey(announcementId), "1")
    } catch {
      /* ignore */
    }
    setItems((prev) => prev.filter((a) => a.id !== announcementId))
  }

  if (!user || items.length === 0) return null

  return (
    <Box sx={{ mb: 3, width: "100%" }}>
      {items.map((a) => (
        <Paper
          key={`${a.fairId}-${a.id}`}
          elevation={0}
          sx={{
            mb: 1,
            p: 1.5,
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            border: (theme) => `1px solid ${alpha(theme.palette.warning.main, 0.28)}`,
            bgcolor: (theme) => alpha(theme.palette.warning.main, 0.14),
            "&:last-of-type": { mb: 0 },
          }}
        >
          <CampaignIcon sx={{ color: "warning.dark", mt: 0.25, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
              {a.title}
            </Typography>
            {a.fairName ? (
              <Link
                component={RouterLink}
                to={`/fair/${a.fairId}`}
                variant="caption"
                sx={{
                  display: "block",
                  mt: 0.25,
                  fontWeight: 600,
                  color: "warning.dark",
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {a.fairName}
              </Link>
            ) : null}
            {a.description.trim() ? (
              <Typography variant="body2" sx={{ mt: 1, color: "text.primary" }}>
                {a.description}
              </Typography>
            ) : null}
          </Box>
          <IconButton
            size="small"
            aria-label="Dismiss announcement"
            onClick={() => dismiss(a.id)}
            sx={{ flexShrink: 0 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Paper>
      ))}
    </Box>
  )
}
