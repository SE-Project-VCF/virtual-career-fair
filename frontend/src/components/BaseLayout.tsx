import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  Typography,
  Button,
  Tooltip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Container,
} from "@mui/material"
import MenuIcon from "@mui/icons-material/Menu"
import CloseIcon from "@mui/icons-material/Close"
import ChatIcon from "@mui/icons-material/Chat"
import DashboardIcon from "@mui/icons-material/Dashboard"
import EventIcon from "@mui/icons-material/Event"
import PersonIcon from "@mui/icons-material/Person"
import MailIcon from "@mui/icons-material/Mail"
import DescriptionIcon from "@mui/icons-material/Description"
import HistoryIcon from "@mui/icons-material/History"
import BusinessIcon from "@mui/icons-material/Business"
import AssignmentIcon from "@mui/icons-material/Assignment"
import ShareIcon from "@mui/icons-material/Share"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import ApartmentIcon from "@mui/icons-material/Apartment"
import NotificationBell from "./NotificationBell"
import ProfileMenu from "../pages/ProfileMenu"
import { authUtils, type User } from "../utils/auth"

const DRAWER_WIDTH = 260

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
}

function getNavItems(user: User | null): NavItem[] {
  const common: NavItem[] = [
    { label: "Dashboard", path: "/dashboard", icon: <DashboardIcon /> },
    { label: "Browse Fairs", path: "/fairs", icon: <EventIcon /> },
    { label: "Chat", path: "/dashboard/chat", icon: <ChatIcon /> },
    { label: "Profile", path: "/profile", icon: <PersonIcon /> },
  ]

  const studentItems: NavItem[] = [
    { label: "Job Invitations", path: "/dashboard/job-invitations", icon: <MailIcon /> },
    { label: "Tailored Resumes", path: "/dashboard/tailored-resumes", icon: <DescriptionIcon /> },
    { label: "Booth History", path: "/dashboard/booth-history", icon: <HistoryIcon /> },
  ]

  // companyOwner manages companies and fairs at the org level
  const companyOwnerItems: NavItem[] = [
    { label: "Manage Companies", path: "/companies", icon: <ShareIcon /> },
    { label: "Browse Booths", path: "/booths", icon: <BusinessIcon /> },
  ]

  // representative links are dynamic — depend on their assigned companyId
  const representativeItems: NavItem[] = user?.companyId
    ? [
        { label: "Manage Booth", path: `/company/${user.companyId}/booth`, icon: <BusinessIcon /> },
        { label: "Submissions", path: `/company/${user.companyId}/submissions`, icon: <AssignmentIcon /> },
        { label: "Browse Booths", path: "/booths", icon: <EventIcon /> },
      ]
    : [
        { label: "Browse Booths", path: "/booths", icon: <BusinessIcon /> },
      ]

  const adminItems: NavItem[] = [
    { label: "Admin Panel", path: "/admin", icon: <AdminPanelSettingsIcon /> },
    { label: "Company Management", path: "/companies", icon: <ApartmentIcon /> },
  ]

  if (user?.role === "student") return [...common, ...studentItems]
  if (user?.role === "companyOwner") return [...common, ...companyOwnerItems]
  if (user?.role === "representative") return [...common, ...representativeItems]
  if (user?.role === "administrator") return [...common, ...adminItems]
  return common
}

export interface BaseLayoutProps {
  children: React.ReactNode
  showChat?: boolean
  pageTitle?: string
}

export default function BaseLayout({ children, showChat = true, pageTitle }: Readonly<BaseLayoutProps>) {
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const user = authUtils.getCurrentUser()
  const navItems = getNavItems(user)

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa" }}>
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 2,
          px: 2,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {/* Left: hamburger + branding + page title */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Tooltip title="Navigation menu">
                <IconButton
                  onClick={() => setDrawerOpen(true)}
                  sx={{
                    color: "white",
                    background: "rgba(255,255,255,0.15)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    width: 40,
                    height: 40,
                    "&:hover": {
                      background: "rgba(255,255,255,0.25)",
                      transform: "scale(1.05)",
                    },
                    transition: "all 0.2s ease",
                  }}
                >
                  <MenuIcon />
                </IconButton>
              </Tooltip>
              <Box
                sx={{ display: "flex", flexDirection: "column", cursor: "pointer" }}
                onClick={() => navigate("/dashboard")}
              >
                <Typography
                  variant="h5"
                  sx={{ fontWeight: 800, color: "white", letterSpacing: "-0.5px", lineHeight: 1.1 }}
                >
                  Job Goblin
                </Typography>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.9)", lineHeight: 1 }}>
                  Virtual Career Fair
                </Typography>
              </Box>
              {pageTitle && (
                <>
                  <Box sx={{ width: "1px", height: 32, bgcolor: "rgba(255,255,255,0.3)", mx: 0.5 }} />
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 600, color: "white", letterSpacing: "-0.3px" }}
                  >
                    {pageTitle}
                  </Typography>
                </>
              )}
            </Box>

            {/* Right: actions */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {showChat && (
                <Tooltip title="Open Chat">
                  <Button
                    onClick={() => navigate("/dashboard/chat")}
                    startIcon={<ChatIcon />}
                    sx={{
                      fontWeight: 700,
                      color: "white",
                      background: "rgba(255,255,255,0.15)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      backdropFilter: "blur(10px)",
                      transition: "all 0.3s ease",
                      "&:hover": {
                        background: "rgba(255,255,255,0.25)",
                        transform: "translateY(-2px)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                      },
                    }}
                  >
                    Chat
                  </Button>
                </Tooltip>
              )}
              <NotificationBell />
              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Navigation Drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: DRAWER_WIDTH,
            background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
            color: "white",
          },
        }}
      >
        {/* Drawer header */}
        <Box
          sx={{
            background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
            px: 2,
            py: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: "white", lineHeight: 1.1 }}>
              Job Goblin
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.85)" }}>
              Virtual Career Fair
            </Typography>
          </Box>
          <IconButton
            onClick={() => setDrawerOpen(false)}
            sx={{ color: "white", "&:hover": { background: "rgba(255,255,255,0.15)" } }}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        {/* User info chip */}
        {user && (
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.72rem" }}>
              Signed in as
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "white", fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {user.email}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textTransform: "capitalize",
                fontSize: "0.72rem",
              }}
            >
              {user.role}
            </Typography>
          </Box>
        )}

        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

        {/* Navigation items */}
        <List sx={{ px: 1, py: 1, flexGrow: 1 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.path}
              onClick={() => {
                navigate(item.path)
                setDrawerOpen(false)
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                color: "rgba(255,255,255,0.85)",
                "&:hover": {
                  background: "rgba(176, 58, 108, 0.25)",
                  color: "white",
                  "& .MuiListItemIcon-root": { color: "#e8a0be" },
                },
                transition: "all 0.2s ease",
              }}
            >
              <ListItemIcon
                sx={{
                  color: "rgba(255,255,255,0.5)",
                  minWidth: 36,
                  transition: "color 0.2s ease",
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: "0.9rem", fontWeight: 500 }}
              />
            </ListItemButton>
          ))}
        </List>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }}>
            Job Goblin &copy; {new Date().getFullYear()}
          </Typography>
        </Box>
      </Drawer>

      {/* Page content */}
      {children}
    </Box>
  )
}
