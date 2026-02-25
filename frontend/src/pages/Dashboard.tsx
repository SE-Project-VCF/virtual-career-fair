import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Container, Box, Typography, Button, Grid, Card, CardContent, TextField, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Badge, Tooltip } from "@mui/material"
import { authUtils } from "../utils/auth"
import { collection, query, where, getDocs } from "firebase/firestore"
import { db, auth } from "../firebase"
import { API_URL } from "../config"
import EventIcon from "@mui/icons-material/Event"
import BusinessIcon from "@mui/icons-material/Business"
import WorkIcon from "@mui/icons-material/Work"
import ShareIcon from "@mui/icons-material/Share"
import PeopleIcon from "@mui/icons-material/People"
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth"
import MailIcon from "@mui/icons-material/Mail"
import ChatIcon from "@mui/icons-material/Chat"
import ProfileMenu from "./ProfileMenu"
import EventList from "../components/EventList"
import NotificationBell from "../components/NotificationBell"

// Helper function to get fair status message based on user role
function getFairStatusMessage(role: string | undefined): string {
  if (role === "student") {
    return "The career fair is not currently live. You will be able to browse all company booths once the fair goes live.";
  }
  if (role === "representative" || role === "companyOwner") {
    return "The career fair is not currently live. You can still view and edit your own booth, but you cannot browse other companies' booths until the fair goes live.";
  }
  return "The career fair is not currently live. Only company owners and representatives can view their own booths.";
}

// Helper function to get display name
function getDisplayName(user: ReturnType<typeof authUtils.getCurrentUser>): string {
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  if (firstName) {
    return firstName;
  }
  return user?.email || "User";
}

// Helper function to get job invitation text
function getJobInvitationText(newInvitationsCount: number): string {
  const invitationSuffix = newInvitationsCount === 1 ? "" : "s";
  return newInvitationsCount > 0 
    ? `${newInvitationsCount} new invitation${invitationSuffix}`
    : "Companies have invited you to apply";
}

// Component for Representative section
function RepresentativeSection({ navigate, user, isLive, setInviteCodeDialogOpen }: Readonly<{
  navigate: ReturnType<typeof useNavigate>
  user: any
  isLive: boolean
  setInviteCodeDialogOpen: (open: boolean) => void
}>) {
  return (
    <Box sx={{ mb: 6 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: "#1a1a1a" }}>
        💼 Company Management
      </Typography>
      <Grid container spacing={3}>
        {!user.companyId && (
          <Grid size={{ xs: 12 }}>
            <Card
              sx={{
                bgcolor: "white",
                border: "2px dashed rgba(56, 133, 96, 0.4)",
                borderRadius: 3,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "pointer",
                "&:hover": {
                  transform: "translateY(-6px)",
                  boxShadow: "0 16px 40px rgba(56, 133, 96, 0.2)",
                  borderColor: "rgba(56, 133, 96, 0.6)",
                },
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Box sx={{
                    p: 1.5,
                    bgcolor: "rgba(56, 133, 96, 0.1)",
                    borderRadius: 2,
                    mr: 2,
                  }}>
                    <BusinessIcon sx={{ fontSize: 32, color: "#388560" }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                    Link to Company
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 3, lineHeight: 1.6 }}>
                  Enter an invite code from your employer to link your account to a company.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => setInviteCodeDialogOpen(true)}
                  sx={{
                    background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                    fontWeight: 700,
                    py: 1.2,
                    px: 3,
                    borderRadius: 2,
                    textTransform: "none",
                    fontSize: "0.95rem",
                    transition: "all 0.3s ease",
                    boxShadow: "0 4px 12px rgba(56, 133, 96, 0.25)",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: "0 6px 20px rgba(56, 133, 96, 0.35)",
                    },
                  }}
                >
                  Enter Invite Code
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}
        {user.companyId && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Card
              sx={{
                bgcolor: "white",
                border: "1px solid rgba(56, 133, 96, 0.2)",
                borderRadius: 3,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  transform: "translateY(-6px)",
                  boxShadow: "0 16px 40px rgba(56, 133, 96, 0.15)",
                  borderColor: "rgba(56, 133, 96, 0.4)",
                },
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Box sx={{
                    p: 1.5,
                    bgcolor: "rgba(56, 133, 96, 0.1)",
                    borderRadius: 2,
                    mr: 2,
                  }}>
                    <BusinessIcon sx={{ fontSize: 32, color: "#388560" }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                    Manage Company
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
                  View and manage your company information and booth.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => {
                    if (user.companyId) {
                      navigate(`/company/${user.companyId}`)
                    } else {
                      navigate("/dashboard")
                    }
                  }}
                  sx={{
                    background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                    fontWeight: 700,
                    py: 1,
                    borderRadius: 2,
                    textTransform: "none",
                    boxShadow: "0 4px 12px rgba(56, 133, 96, 0.25)",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: "0 6px 20px rgba(56, 133, 96, 0.35)",
                    },
                  }}
                >
                  View Company
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(56, 133, 96, 0.15)",
                borderColor: "rgba(56, 133, 96, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Box sx={{
                  p: 1.5,
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                  borderRadius: 2,
                  mr: 2,
                }}>
                  <BusinessIcon sx={{ fontSize: 32, color: "#388560" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Browse All Booths
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
                {isLive
                  ? "Explore other companies' booths at the virtual career fair."
                  : "The career fair is not currently live. You can only view your own company's booth."}
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/booths")}
                disabled={!isLive}
                sx={{
                  background: isLive
                    ? "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)"
                    : "rgba(0, 0, 0, 0.12)",
                  color: isLive ? "white" : "rgba(0, 0, 0, 0.26)",
                  fontWeight: 700,
                  py: 1,
                  borderRadius: 2,
                  textTransform: "none",
                  boxShadow: isLive ? "0 4px 12px rgba(56, 133, 96, 0.25)" : "none",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    transform: isLive ? "translateY(-2px)" : "none",
                    boxShadow: isLive ? "0 6px 20px rgba(56, 133, 96, 0.35)" : "none",
                  },
                }}
              >
                View All Booths
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

function AdminSection({ navigate }: Readonly<{
  navigate: ReturnType<typeof useNavigate>
}>) {
  return (
    <Box sx={{ mb: 6 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: "#1a1a1a" }}>
        ⚙️ Administrator Controls
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(176, 58, 108, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(176, 58, 108, 0.15)",
                borderColor: "rgba(176, 58, 108, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Box sx={{
                  p: 1.5,
                  bgcolor: "rgba(176, 58, 108, 0.1)",
                  borderRadius: 2,
                  mr: 2,
                }}>
                  <EventIcon sx={{ fontSize: 32, color: "#b03a6c" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Manage Career Fair
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
                Control when the career fair is live and visible to all users.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/admin")}
                sx={{
                  background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                  fontWeight: 700,
                  py: 1,
                  borderRadius: 2,
                  textTransform: "none",
                  boxShadow: "0 4px 12px rgba(176, 58, 108, 0.25)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 6px 20px rgba(176, 58, 108, 0.35)",
                  },
                }}
              >
                Go to Admin Dashboard
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

// Helper to get browse booths description
function getBoothsDescription(isLive: boolean): string {
  return isLive
    ? "Explore opportunities from top companies at the virtual career fair."
    : "The career fair is not currently live. Check back later to browse company booths."
}

// Helper to get view booths button styles
function getViewBoothsButtonStyles(isLive: boolean) {
  return {
    background: isLive
      ? "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)"
      : "rgba(0, 0, 0, 0.12)",
    color: isLive ? "white" : "rgba(0, 0, 0, 0.26)",
    fontWeight: 700,
    py: 1,
    borderRadius: 2,
    textTransform: "none",
    boxShadow: isLive ? "0 4px 12px rgba(176, 58, 108, 0.25)" : "none",
    transition: "all 0.3s ease",
    "&:hover": {
      transform: isLive ? "translateY(-2px)" : "none",
      boxShadow: isLive ? "0 6px 20px rgba(176, 58, 108, 0.35)" : "none",
    },
  }
}

// Helper to get booth history button styles
function getBoothHistoryButtonStyles(isLive: boolean) {
  return {
    borderColor: isLive ? "rgba(176, 58, 108, 0.4)" : "rgba(0, 0, 0, 0.12)",
    color: isLive ? "#b03a6c" : "rgba(0, 0, 0, 0.26)",
    fontWeight: 700,
    borderWidth: "1.5px",
    transition: "all 0.3s ease",
    "&:hover": {
      borderColor: "#b03a6c",
      backgroundColor: "rgba(176, 58, 108, 0.08)",
      transform: isLive ? "translateY(-2px)" : "none",
    },
    "&:disabled": {
      borderColor: "rgba(0, 0, 0, 0.12)",
      color: "rgba(0, 0, 0, 0.26)",
    },
  }
}

// Helper to get invitations card styles
function getInvitationsCardStyles(newInvitationsCount: number) {
  const hasNewInvitations = newInvitationsCount > 0
  return {
    bgcolor: "white",
    border: hasNewInvitations 
      ? "2px solid rgba(176, 58, 108, 0.4)"
      : "1px solid rgba(176, 58, 108, 0.2)",
    borderRadius: 3,
    boxShadow: hasNewInvitations
      ? "0 8px 24px rgba(176, 58, 108, 0.15)"
      : "0 2px 8px rgba(0,0,0,0.08)",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    background: hasNewInvitations
      ? "linear-gradient(135deg, rgba(176, 58, 108, 0.02) 0%, rgba(255,255,255) 100%)"
      : "white",
    "&:hover": {
      transform: "translateY(-6px)",
      boxShadow: "0 16px 40px rgba(176, 58, 108, 0.15)",
      borderColor: "rgba(176, 58, 108, 0.4)",
    },
  }
}

// Helper to get view invitations button styles
function getViewInvitationsButtonStyles(jobInvitationsCount: number) {
  const hasInvitations = jobInvitationsCount > 0
  return {
    background: hasInvitations
      ? "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)"
      : "rgba(0, 0, 0, 0.12)",
    color: hasInvitations ? "white" : "rgba(0, 0, 0, 0.26)",
    fontWeight: 700,
    py: 1,
    borderRadius: 2,
    textTransform: "none",
    boxShadow: hasInvitations ? "0 4px 12px rgba(176, 58, 108, 0.25)" : "none",
    transition: "all 0.3s ease",
    "&:hover": {
      transform: hasInvitations ? "translateY(-2px)" : "none",
      boxShadow: hasInvitations ? "0 6px 20px rgba(176, 58, 108, 0.35)" : "none",
    },
  }
}

function StudentSection({
  navigate,
  isLive,
  jobInvitationsCount,
  newInvitationsCount,
  loadingInvitations,
}: Readonly<{
  navigate: ReturnType<typeof useNavigate>
  isLive: boolean
  jobInvitationsCount: number
  newInvitationsCount: number
  loadingInvitations: boolean
}>) {
  const boothsDescription = getBoothsDescription(isLive)
  const viewBoothsStyles = getViewBoothsButtonStyles(isLive)
  const boothHistoryStyles = getBoothHistoryButtonStyles(isLive)
  const invitationsCardStyles = getInvitationsCardStyles(newInvitationsCount)
  const viewInvitationsStyles = getViewInvitationsButtonStyles(jobInvitationsCount)

  return (
    <Box sx={{ mb: 6 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: "#1a1a1a" }}>
        🎯 Career Opportunities
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(56, 133, 96, 0.15)",
                borderColor: "rgba(56, 133, 96, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Box sx={{
                  p: 1.5,
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                  borderRadius: 2,
                  mr: 2,
                }}>
                  <EventIcon sx={{ fontSize: 32, color: "#388560" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Browse Career Fairs
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
                View all available virtual career fairs and browse company booths within each one.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/fairs")}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  fontWeight: 700,
                  py: 1,
                  borderRadius: 2,
                  textTransform: "none",
                  boxShadow: "0 4px 12px rgba(56, 133, 96, 0.25)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 6px 20px rgba(56, 133, 96, 0.35)",
                  },
                }}
              >
                View All Fairs
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(176, 58, 108, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(176, 58, 108, 0.15)",
                borderColor: "rgba(176, 58, 108, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Box sx={{
                  p: 1.5,
                  bgcolor: "rgba(176, 58, 108, 0.1)",
                  borderRadius: 2,
                  mr: 2,
                }}>
                  <BusinessIcon sx={{ fontSize: 32, color: "#b03a6c" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Browse Company Booths
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
                {boothsDescription}
              </Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  onClick={() => navigate("/booths")}
                  disabled={!isLive}
                  sx={viewBoothsStyles}
                >
                  View All Booths
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => navigate("/dashboard/booth-history")}
                  disabled={!isLive}
                  sx={boothHistoryStyles}
                >
                  View Booth History
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={invitationsCardStyles}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Box sx={{
                    p: 1.5,
                    bgcolor: "rgba(176, 58, 108, 0.1)",
                    borderRadius: 2,
                    mr: 2,
                  }}>
                    <MailIcon sx={{ fontSize: 32, color: "#b03a6c" }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                    Job Invitations
                  </Typography>
                </Box>
                {newInvitationsCount > 0 && (
                  <Badge 
                    badgeContent={newInvitationsCount} 
                    color="error"
                    sx={{
                      "& .MuiBadge-badge": {
                        background: "linear-gradient(135deg, #ff5252 0%, #ff1744 100%)",
                        boxShadow: "0 2px 8px rgba(255, 82, 82, 0.4)",
                      },
                    }}
                  />
                )}
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 800, background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 1 }}>
                {loadingInvitations ? "..." : jobInvitationsCount}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
                {getJobInvitationText(newInvitationsCount)}
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/dashboard/job-invitations")}
                disabled={jobInvitationsCount === 0}
                sx={viewInvitationsStyles}
              >
                View Invitations
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

function StatsSection({
  loadingStats,
  upcomingEventsCount,
  totalCompaniesCount,
  totalJobOpenings,
}: Readonly<{
  loadingStats: boolean
  upcomingEventsCount: number
  totalCompaniesCount: number
  totalJobOpenings: number
}>) {
  return (
    <Box sx={{ mt: 6, mb: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: "#1a1a1a" }}>
        📊 Quick Stats
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(176, 58, 108, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(176, 58, 108, 0.15)",
                borderColor: "rgba(176, 58, 108, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Box sx={{
                  p: 1.5,
                  bgcolor: "rgba(176, 58, 108, 0.1)",
                  borderRadius: 2,
                  mr: 2,
                }}>
                  <EventIcon sx={{ fontSize: 32, color: "#b03a6c" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Upcoming Events
                </Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 800, background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 1 }}>
                {loadingStats ? "..." : upcomingEventsCount}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Career fairs scheduled
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(56, 133, 96, 0.15)",
                borderColor: "rgba(56, 133, 96, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Box sx={{
                  p: 1.5,
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                  borderRadius: 2,
                  mr: 2,
                }}>
                  <BusinessIcon sx={{ fontSize: 32, color: "#388560" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Companies
                </Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 800, background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 1 }}>
                {loadingStats ? "..." : totalCompaniesCount}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Employers participating
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(176, 58, 108, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(176, 58, 108, 0.15)",
                borderColor: "rgba(176, 58, 108, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Box sx={{
                  p: 1.5,
                  bgcolor: "rgba(176, 58, 108, 0.1)",
                  borderRadius: 2,
                  mr: 2,
                }}>
                  <WorkIcon sx={{ fontSize: 32, color: "#b03a6c" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Job Openings
                </Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 800, background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 1 }}>
                {loadingStats ? "..." : totalJobOpenings}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Positions available
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

// Component for Company Owner section
function CompanyOwnerSection({ navigate, isLive, totalRepresentatives, enrolledFairCount }: Readonly<{
  navigate: ReturnType<typeof useNavigate>
  isLive: boolean
  totalRepresentatives: number
  enrolledFairCount: number
}>) {
  return (
    <Box sx={{ mb: 6 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: "#1a1a1a" }}>
        💼 Company Management
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              height: "100%",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(56, 133, 96, 0.15)",
                borderColor: "rgba(56, 133, 96, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4, display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                <Box sx={{
                  p: 2,
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                  borderRadius: 2.5,
                  mr: 2,
                }}>
                  <ShareIcon sx={{ fontSize: 28, color: "#388560" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Manage Companies
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3, flex: 1 }}>
                Create and manage your companies.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/companies")}
                fullWidth
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  fontWeight: 700,
                  py: 1.2,
                  borderRadius: 2,
                  textTransform: "none",
                  boxShadow: "0 4px 12px rgba(56, 133, 96, 0.25)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 6px 20px rgba(56, 133, 96, 0.35)",
                  },
                }}
              >
                Manage Companies
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              height: "100%",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(56, 133, 96, 0.15)",
                borderColor: "rgba(56, 133, 96, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4, display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                <Box sx={{
                  p: 2,
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                  borderRadius: 2.5,
                  mr: 2,
                }}>
                  <CalendarMonthIcon sx={{ fontSize: 28, color: "#388560" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Career Fairs
                </Typography>
              </Box>
              <Typography variant="h2" sx={{ fontWeight: 800, background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 1 }}>
                {enrolledFairCount}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3, flex: 1 }}>
                {enrolledFairCount === 1 ? "fair enrolled" : "fairs enrolled"}
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/fairs")}
                fullWidth
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  fontWeight: 700,
                  py: 1.2,
                  borderRadius: 2,
                  textTransform: "none",
                  boxShadow: "0 4px 12px rgba(56, 133, 96, 0.25)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 6px 20px rgba(56, 133, 96, 0.35)",
                  },
                }}
              >
                Browse Fairs
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(176, 58, 108, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              height: "100%",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(176, 58, 108, 0.15)",
                borderColor: "rgba(176, 58, 108, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                <Box sx={{
                  p: 2,
                  bgcolor: "rgba(176, 58, 108, 0.1)",
                  borderRadius: 2.5,
                  mr: 2,
                }}>
                  <PeopleIcon sx={{ fontSize: 28, color: "#b03a6c" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Team Members
                </Typography>
              </Box>
              <Typography variant="h2" sx={{ fontWeight: 800, background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 1 }}>
                {totalRepresentatives}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Company representatives registered
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.2)",
              borderRadius: 3,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              height: "100%",
              "&:hover": {
                transform: "translateY(-6px)",
                boxShadow: "0 16px 40px rgba(56, 133, 96, 0.15)",
                borderColor: "rgba(56, 133, 96, 0.4)",
              },
            }}
          >
            <CardContent sx={{ p: 4, display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                <Box sx={{
                  p: 2,
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                  borderRadius: 2.5,
                  mr: 2,
                }}>
                  <BusinessIcon sx={{ fontSize: 28, color: "#388560" }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Browse Booths
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3, flex: 1 }}>
                {isLive
                  ? "Explore other companies' booths at the virtual career fair."
                  : "The career fair is not currently live. You can only view your own company's booth."}
              </Typography>
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  onClick={() => navigate("/booths")}
                  disabled={!isLive}
                  size="small"
                  sx={{
                    background: isLive
                      ? "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)"
                      : "rgba(0, 0, 0, 0.12)",
                    color: isLive ? "white" : "rgba(0, 0, 0, 0.26)",
                    fontWeight: 700,
                    borderRadius: 1.5,
                    textTransform: "none",
                    boxShadow: isLive ? "0 4px 12px rgba(56, 133, 96, 0.25)" : "none",
                    transition: "all 0.3s ease",
                    "&:hover": {
                      transform: isLive ? "translateY(-2px)" : "none",
                      boxShadow: isLive ? "0 6px 20px rgba(56, 133, 96, 0.35)" : "none",
                    },
                  }}
                >
                  View Booths
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => navigate("/dashboard/booth-history")}
                  disabled={!isLive}
                  size="small"
                  sx={{
                    borderColor: isLive ? "rgba(56, 133, 96, 0.4)" : "rgba(0, 0, 0, 0.12)",
                    color: isLive ? "#388560" : "rgba(0, 0, 0, 0.26)",
                    fontWeight: 700,
                    borderWidth: "1.5px",
                    borderRadius: 1.5,
                    textTransform: "none",
                    transition: "all 0.3s ease",
                    "&:hover": {
                      borderColor: "#388560",
                      backgroundColor: "rgba(56, 133, 96, 0.08)",
                      transform: isLive ? "translateY(-2px)" : "none",
                    },
                    "&:disabled": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                      color: "rgba(0, 0, 0, 0.26)",
                    },
                  }}
                >
                  Booth History
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

function renderRoleSection(
  role: string | undefined,
  navigate: ReturnType<typeof useNavigate>,
  props: {
    isLive: boolean
    totalRepresentatives: number
    enrolledFairCount: number
    user: ReturnType<typeof authUtils.getCurrentUser>
    jobInvitationsCount: number
    newInvitationsCount: number
    loadingInvitations: boolean
    setInviteCodeDialogOpen: (open: boolean) => void
  }
) {
  switch (role) {
    case "companyOwner":
      return (
        <CompanyOwnerSection
          navigate={navigate}
          isLive={props.isLive}
          totalRepresentatives={props.totalRepresentatives}
          enrolledFairCount={props.enrolledFairCount}
        />
      )
    case "representative":
      return (
        <RepresentativeSection 
          navigate={navigate}
          user={props.user}
          isLive={props.isLive}
          setInviteCodeDialogOpen={props.setInviteCodeDialogOpen}
        />
      )
    case "administrator":
      return <AdminSection navigate={navigate} />
    case "student":
      return (
        <StudentSection 
          navigate={navigate}
          isLive={props.isLive}
          jobInvitationsCount={props.jobInvitationsCount}
          newInvitationsCount={props.newInvitationsCount}
          loadingInvitations={props.loadingInvitations}
        />
      )
    default:
      return null
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(authUtils.getCurrentUser())
  const [inviteCodeDialogOpen, setInviteCodeDialogOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
  const [inviteCodeError, setInviteCodeError] = useState("")
  const [linking, setLinking] = useState(false)
  const [totalRepresentatives, setTotalRepresentatives] = useState(0)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [isLive, setIsLive] = useState(false)
  const [upcomingEventsCount, setUpcomingEventsCount] = useState(0)
  const [totalCompaniesCount, setTotalCompaniesCount] = useState(0)
  const [totalJobOpenings, setTotalJobOpenings] = useState(0)
  const [loadingStats, setLoadingStats] = useState(true)
  const [enrolledFairCount, setEnrolledFairCount] = useState(0)
  const [jobInvitationsCount, setJobInvitationsCount] = useState(0)
  const [newInvitationsCount, setNewInvitationsCount] = useState(0)
  const [loadingInvitations, setLoadingInvitations] = useState(false)

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/")
    }

    // Additional role validation could be added here if needed
    // For now, the login functions handle role validation
  }, [navigate])

  // Fetch unread chat count and keep it updated
  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    const fetchUnread = async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch(
          `${API_URL}/api/stream-unread`,
          {
            headers: { Authorization: `Bearer ${idToken}` },
          }
        );

        if (!res.ok) {
          console.error("Unread API error:", res.status);
          return;
        }

        const data = await res.json();

        if (!cancelled && typeof data.unread === "number") {
          setUnreadCount(data.unread);
        }
      } catch (err) {
        console.error("Failed to fetch unread count:", err);
      }
    };

    void fetchUnread().catch((err) => {
      console.error("Initial unread count fetch failed:", err);
    });

    const interval = setInterval(() => {
      void fetchUnread().catch((err) => {
        console.error("Periodic unread count fetch failed:", err);
      });
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.uid]);

  // Fetch total representatives count for company owners
  useEffect(() => {
    const fetchTotalRepresentatives = async () => {
      if (user?.role === "companyOwner" && user?.uid) {
        try {
          const companiesRef = collection(db, "companies")
          const q = query(companiesRef, where("ownerId", "==", user.uid))
          const querySnapshot = await getDocs(q)

          let totalCount = 0
          querySnapshot.forEach((doc) => {
            const data = doc.data()
            const representativeIDs = data.representativeIDs || []
            totalCount += representativeIDs.length
          })

          setTotalRepresentatives(totalCount)
        } catch (err) {
          console.error("Error fetching representatives count:", err);
        }
      }
    }

    fetchTotalRepresentatives()
  }, [user?.uid, user?.role])

  const fetchJobInvitations = useCallback(async () => {
    const currentUser = authUtils.getCurrentUser();
    if (!currentUser || currentUser?.role !== "student") return;

    try {
      setLoadingInvitations(true);
      const response = await fetch(
        `${API_URL}/api/job-invitations/received?userId=${currentUser.uid}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const invitations = data.invitations || [];
        setJobInvitationsCount(invitations.length);
        setNewInvitationsCount(invitations.filter((inv: any) => inv.status === "sent").length);
      }
    } catch (err) {
      console.error("Error fetching job invitations:", err);
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  // Fetch job invitations for students
  useEffect(() => {
    if (user?.uid && user?.role === "student") {
      fetchJobInvitations();

      const interval = setInterval(fetchJobInvitations, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.uid, user?.role, fetchJobInvitations]);

  // Fetch dashboard statistics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoadingStats(true)

        // Fetch fairs — derive upcoming count and live status
        const fairsRes = await fetch(`${API_URL}/api/fairs`)
        if (fairsRes.ok) {
          const fairsData = await fairsRes.json()
          const fairs = fairsData.fairs || []
          const now = Date.now()
          setUpcomingEventsCount(fairs.filter((f: any) => !f.endTime || f.endTime > now).length)
          setIsLive(fairs.some((f: any) => f.isLive))
        }

        // Fetch enrollment count for company users
        if (user?.role === "companyOwner" || user?.role === "representative") {
          const token = await auth.currentUser?.getIdToken()
          if (token) {
            const enrollRes = await fetch(`${API_URL}/api/fairs/my-enrollments`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (enrollRes.ok) {
              const enrollData = await enrollRes.json()
              setEnrolledFairCount((enrollData.enrollments || []).length)
            }
          }
        }

        // Fetch total companies count
        const companiesSnapshot = await getDocs(collection(db, "companies"))
        setTotalCompaniesCount(companiesSnapshot.size)

        // Fetch total job openings (count of all job postings)
        const jobsSnapshot = await getDocs(collection(db, "jobs"))
        setTotalJobOpenings(jobsSnapshot.size)
      } catch (err) {
        console.error("Error fetching stats:", err)
      } finally {
        setLoadingStats(false)
      }
    }

    fetchStats()
  }, [])



  const handleLinkInviteCode = async () => {
    if (!inviteCode.trim()) {
      setInviteCodeError("Please enter an invite code")
      return
    }

    if (!user?.uid) {
      setInviteCodeError("User not found")
      return
    }

    setLinking(true)
    setInviteCodeError("")

    const result = await authUtils.linkRepresentativeToCompany(inviteCode.trim(), user.uid)

    if (result.success) {
      setInviteCodeDialogOpen(false)
      setInviteCode("")
      // Update user state with fresh data from localStorage
      const updatedUser = authUtils.getCurrentUser()
      if (updatedUser) {
        setUser(updatedUser)
      }
    } else {
      setInviteCodeError(result.error || "Failed to link invite code")
    }

    setLinking(false)
  }

  if (!user) return null

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fafafa" }}>
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 4,
          px: 4,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: "white", letterSpacing: "-0.5px" }}>
                Job Goblin
              </Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.9)" }}>
                Virtual Career Fair
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {/* ✅ Chat Button with Unread Badge */}
              <Tooltip title="Open Chat">
                <Badge
                  color="error"
                  badgeContent={unreadCount > 0 ? unreadCount : null}
                  overlap="circular"
                  anchorOrigin={{
                    vertical: "top",
                    horizontal: "right",
                  }}
                  sx={{
                    "& .MuiBadge-badge": {
                      fontSize: "0.875rem",
                      height: "20px",
                      minWidth: "20px",
                      padding: "0 6px",
                      right: "4px",
                      top: "4px",
                      background: "#ff5252",
                      boxShadow: "0 0 0 2px #b03a6c",
                    },
                  }}
                >
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
                        backdropFilter: "blur(10px)",
                        transform: "translateY(-2px)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                      },
                    }}
                  >
                    Chat
                  </Button>
                </Badge>
              </Tooltip>

              <NotificationBell />

              <ProfileMenu />
            </Box>

          </Box>
        </Container>
      </Box>
      <Container maxWidth="lg">
        <Box sx={{ py: 6 }}>
          {/* Welcome Section */}
          <Box
            sx={{
              background: "linear-gradient(135deg, rgba(176, 58, 108, 0.08) 0%, rgba(56, 133, 96, 0.08) 100%)",
              border: "2px solid rgba(176, 58, 108, 0.15)",
              borderRadius: 3,
              p: { xs: 3, md: 5 },
              mb: 6,
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
              position: "relative",
              overflow: "hidden",
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                right: 0,
                width: "300px",
                height: "300px",
                background: "radial-gradient(circle, rgba(56, 133, 96, 0.1) 0%, transparent 70%)",
                borderRadius: "50%",
                pointerEvents: "none",
              },
            }}
          >
            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 800,
                  mb: 2,
                  background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.5px",
                }}
              >
                Welcome back, {getDisplayName(user)}!
              </Typography>

              {/* Company name display for representatives - only show if they have a valid companyId */}
              {user.role === "representative" && user.companyId && user.companyName && (
                <Box sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 1.5,
                  mb: 3,
                  px: 3,
                  py: 1.5,
                  bgcolor: "rgba(56, 133, 96, 0.12)",
                  borderRadius: 2.5,
                  border: "1.5px solid rgba(56, 133, 96, 0.3)",
                  backdropFilter: "blur(10px)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    bgcolor: "rgba(56, 133, 96, 0.18)",
                    borderColor: "rgba(56, 133, 96, 0.5)",
                  },
                }}>
                  <BusinessIcon sx={{ fontSize: 20, color: "#388560", fontWeight: 700 }} />
                  <Typography variant="body1" sx={{ fontWeight: 600, color: "#2d6b4d" }}>
                    Representing <strong>{user.companyName}</strong>
                  </Typography>
                </Box>
              )}

              <Typography variant="body1" sx={{ color: "text.secondary", fontSize: "1.05rem", lineHeight: 1.6 }}>
                You're all set to explore career opportunities at our virtual fair. Start by browsing companies or checking your invitations.
              </Typography>
            </Box>
          </Box>

          {/* Event List - Shows scheduled career fairs */}
          <EventList />

          {/* Fair Status Alert */}
          {!loadingStats && !isLive && (
            <Alert
              severity="info"
              sx={{
                mb: 4,
                borderRadius: 2.5,
                bgcolor: "rgba(56, 133, 96, 0.08)",
                border: "2px solid rgba(56, 133, 96, 0.25)",
                "& .MuiAlert-icon": {
                  color: "#388560",
                },
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5, color: "#2d6b4d" }}>
                Career Fair is Not Currently Live
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {getFairStatusMessage(user?.role)}
              </Typography>
            </Alert>
          )}

          {/* Role-specific sections */}
          {renderRoleSection(user?.role, navigate, {
            isLive,
            totalRepresentatives,
            enrolledFairCount,
            user,
            jobInvitationsCount,
            newInvitationsCount,
            loadingInvitations,
            setInviteCodeDialogOpen,
          })}

          {/* Stats Cards */}
          <StatsSection
            loadingStats={loadingStats}
            upcomingEventsCount={upcomingEventsCount}
            totalCompaniesCount={totalCompaniesCount}
            totalJobOpenings={totalJobOpenings}
          />
        </Box>
      </Container>

      {/* Invite Code Dialog */}
      <Dialog
        open={inviteCodeDialogOpen}
        onClose={() => {
          setInviteCodeDialogOpen(false)
          setInviteCode("")
          setInviteCodeError("")
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Enter Invite Code</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the invite code provided by your employer to link your account to their company.
          </Typography>
          {inviteCodeError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {inviteCodeError}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Invite Code"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.toUpperCase())
              setInviteCodeError("")
            }}
            placeholder="Enter invite code"
            disabled={linking}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setInviteCodeDialogOpen(false)
              setInviteCode("")
              setInviteCodeError("")
            }}
            disabled={linking}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLinkInviteCode}
            variant="contained"
            disabled={linking || !inviteCode.trim()}
            sx={{
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            {linking ? "Joining..." : "Join Company"}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  )
}
