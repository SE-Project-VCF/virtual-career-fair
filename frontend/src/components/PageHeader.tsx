import { Box, Typography } from "@mui/material"
import NotificationBell from "./NotificationBell"
import ProfileMenu from "../pages/ProfileMenu"

export default function PageHeader() {
  return (
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
      <Typography variant="h6" fontWeight="bold">
        Virtual Career Fair
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <NotificationBell />
        <ProfileMenu />
      </Box>
    </Box>
  )
}
