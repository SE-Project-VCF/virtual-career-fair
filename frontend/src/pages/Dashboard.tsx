import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Container, Box, Typography, Button, Grid, Card, CardContent, TextField, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Badge, Tooltip } from "@mui/material"
import { authUtils } from "../utils/auth"
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore"
import { db, auth } from "../firebase"
import { evaluateFairStatus } from "../utils/fairStatus"
import { API_URL } from "../config"
import EventIcon from "@mui/icons-material/Event"
import BusinessIcon from "@mui/icons-material/Business"
import WorkIcon from "@mui/icons-material/Work"
import ShareIcon from "@mui/icons-material/Share"
import PeopleIcon from "@mui/icons-material/People"
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
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Company Management
      </Typography>
      <Grid container spacing={3}>
        {!user.companyId && (
          <Grid size={{ xs: 12 }}>
            <Card
              sx={{
                bgcolor: "white",
                border: "2px dashed rgba(56, 133, 96, 0.3)",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <BusinessIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Link to Company
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Enter an invite code from your employer to link your account to a company.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => setInviteCodeDialogOpen(true)}
                  sx={{
                    background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
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
                border: "1px solid rgba(56, 133, 96, 0.3)",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <BusinessIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Manage Company
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
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
                    "&:hover": {
                      background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
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
              border: "1px solid rgba(56, 133, 96, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <BusinessIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Browse All Booths
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
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
                  "&:hover": {
                    background: isLive
                      ? "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)"
                      : "rgba(0, 0, 0, 0.12)",
                  },
                  "&:disabled": {
                    background: "rgba(0, 0, 0, 0.12)",
                    color: "rgba(0, 0, 0, 0.26)",
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
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Administrator Controls
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(176, 58, 108, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(176, 58, 108, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <EventIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Manage Career Fair
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Control when the career fair is live and visible to all users.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/admin")}
                sx={{
                  background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
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
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Career Opportunities
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <EventIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Browse Career Fairs
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                View all available virtual career fairs and browse company booths within each one.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/fairs")}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
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
              border: "1px solid rgba(176, 58, 108, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(176, 58, 108, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <BusinessIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Browse Company Booths
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {isLive
                  ? "Explore opportunities from top companies at the virtual career fair."
                  : "The career fair is not currently live. Check back later to browse company booths."}
              </Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  onClick={() => navigate("/booths")}
                  disabled={!isLive}
                  sx={{
                    background: isLive
                      ? "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)"
                      : "rgba(0, 0, 0, 0.12)",
                    color: isLive ? "white" : "rgba(0, 0, 0, 0.26)",
                    "&:hover": {
                      background: isLive
                        ? "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)"
                        : "rgba(0, 0, 0, 0.12)",
                    },
                    "&:disabled": {
                      background: "rgba(0, 0, 0, 0.12)",
                      color: "rgba(0, 0, 0, 0.26)",
                    },
                  }}
                >
                  View All Booths
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => navigate("/dashboard/booth-history")}
                  disabled={!isLive}
                  sx={{
                    borderColor: "rgba(176, 58, 108, 0.6)",
                    color: isLive ? "#b03a6c" : "rgba(0, 0, 0, 0.26)",
                    "&:hover": {
                      borderColor: "#b03a6c",
                      backgroundColor: "rgba(176, 58, 108, 0.08)",
                    },
                    "&:disabled": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                      color: "rgba(0, 0, 0, 0.26)",
                    },
                  }}
                >
                  View Booth History
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: newInvitationsCount > 0
                ? "2px solid rgba(176, 58, 108, 0.5)"
                : "1px solid rgba(176, 58, 108, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(176, 58, 108, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <MailIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Job Invitations
                  </Typography>
                </Box>
                {newInvitationsCount > 0 && (
                  <Badge badgeContent={newInvitationsCount} color="error" />
                )}
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 700, color: "#b03a6c", mb: 1 }}>
                {loadingInvitations ? "..." : jobInvitationsCount}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {getJobInvitationText(newInvitationsCount)}
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/dashboard/job-invitations")}
                disabled={jobInvitationsCount === 0}
                sx={{
                  background: jobInvitationsCount > 0
                    ? "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)"
                    : "rgba(0, 0, 0, 0.12)",
                  color: jobInvitationsCount > 0 ? "white" : "rgba(0, 0, 0, 0.26)",
                  "&:hover": {
                    background: jobInvitationsCount > 0
                      ? "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)"
                      : "rgba(0, 0, 0, 0.12)",
                  },
                  "&:disabled": {
                    background: "rgba(0, 0, 0, 0.12)",
                    color: "rgba(0, 0, 0, 0.26)",
                  },
                }}
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
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card
          sx={{
            bgcolor: "white",
            border: "1px solid rgba(176, 58, 108, 0.3)",
            transition: "transform 0.2s, box-shadow 0.2s",
            "&:hover": {
              transform: "translateY(-4px)",
              boxShadow: "0 8px 24px rgba(176, 58, 108, 0.3)",
            },
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <EventIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Upcoming Events
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ fontWeight: 700, color: "#b03a6c", mb: 1 }}>
              {loadingStats ? "..." : upcomingEventsCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Career fairs scheduled
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card
          sx={{
            bgcolor: "white",
            border: "1px solid rgba(56, 133, 96, 0.3)",
            transition: "transform 0.2s, box-shadow 0.2s",
            "&:hover": {
              transform: "translateY(-4px)",
              boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
            },
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <BusinessIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Companies
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ fontWeight: 700, color: "#388560", mb: 1 }}>
              {loadingStats ? "..." : totalCompaniesCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Employers participating
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card
          sx={{
            bgcolor: "white",
            border: "1px solid rgba(176, 58, 108, 0.3)",
            transition: "transform 0.2s, box-shadow 0.2s",
            "&:hover": {
              transform: "translateY(-4px)",
              boxShadow: "0 8px 24px rgba(176, 58, 108, 0.3)",
            },
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <WorkIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Job Openings
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ fontWeight: 700, color: "#b03a6c", mb: 1 }}>
              {loadingStats ? "..." : totalJobOpenings}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Positions available
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}

// Component for Company Owner section
function CompanyOwnerSection({ navigate, isLive, totalRepresentatives }: Readonly<{
  navigate: ReturnType<typeof useNavigate>
  isLive: boolean
  totalRepresentatives: number
}>) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Company Management
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <ShareIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Manage Companies
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Create and manage your companies.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/companies")}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                  },
                }}
              >
                Manage Companies
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(176, 58, 108, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(176, 58, 108, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <PeopleIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Team Members
                </Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 700, color: "#b03a6c", mb: 1 }}>
                {totalRepresentatives}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Company representatives registered
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: "white",
              border: "1px solid rgba(56, 133, 96, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <BusinessIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Browse All Booths
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {isLive
                  ? "Explore other companies' booths at the virtual career fair."
                  : "The career fair is not currently live. You can only view your own company's booth."}
              </Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  onClick={() => navigate("/booths")}
                  disabled={!isLive}
                  sx={{
                    background: isLive
                      ? "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)"
                      : "rgba(0, 0, 0, 0.12)",
                    color: isLive ? "white" : "rgba(0, 0, 0, 0.26)",
                    "&:hover": {
                      background: isLive
                        ? "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)"
                        : "rgba(0, 0, 0, 0.12)",
                    },
                    "&:disabled": {
                      background: "rgba(0, 0, 0, 0.12)",
                      color: "rgba(0, 0, 0, 0.26)",
                    },
                  }}
                >
                  View All Booths
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => navigate("/dashboard/booth-history")}
                  disabled={!isLive}
                  sx={{
                    borderColor: "rgba(56, 133, 96, 0.6)",
                    color: isLive ? "#388560" : "rgba(0, 0, 0, 0.26)",
                    "&:hover": {
                      borderColor: "#388560",
                      backgroundColor: "rgba(56, 133, 96, 0.08)",
                    },
                    "&:disabled": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                      color: "rgba(0, 0, 0, 0.26)",
                    },
                  }}
                >
                  View Booth History
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
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
  const [loadingFairStatus, setLoadingFairStatus] = useState(true)
  const [upcomingEventsCount, setUpcomingEventsCount] = useState(0)
  const [totalCompaniesCount, setTotalCompaniesCount] = useState(0)
  const [totalJobOpenings, setTotalJobOpenings] = useState(0)
  const [loadingStats, setLoadingStats] = useState(true)
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

  // Fetch fair status
  useEffect(() => {
    const fetchFairStatus = async () => {
      try {
        setLoadingFairStatus(true)
        const status = await evaluateFairStatus()
        setIsLive(status.isLive)
      } catch (err) {
        console.error("Error fetching fair status:", err)
      } finally {
        setLoadingFairStatus(false)
      }
    }

    fetchFairStatus()
  }, [])

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

        // Fetch upcoming events count (schedules that haven't ended)
        const schedulesSnapshot = await getDocs(collection(db, "fairSchedules"))
        const now = Date.now()
        let upcomingCount = 0
        schedulesSnapshot.forEach((doc) => {
          const data = doc.data()
          const endTime = data.endTime instanceof Timestamp
            ? data.endTime.toMillis()
            : data.endTime
          if (endTime && endTime > now) {
            upcomingCount++
          }
        })
        setUpcomingEventsCount(upcomingCount)

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
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 3,
          px: 4,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
              Job Goblin - Virtual Career Fair
            </Typography>
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
                    },
                  }}
                >
                  <Button
                    onClick={() => navigate("/dashboard/chat")}
                    startIcon={<ChatIcon />}
                    sx={{
                      fontWeight: 600,
                      color: "white",
                      background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      "&:hover": {
                        background: "linear-gradient(135deg, #388560 0%, #b03a6c 100%)",
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
              background: "linear-gradient(135deg, rgba(176, 58, 108, 0.1) 0%, rgba(56, 133, 96, 0.1) 100%)",
              border: "1px solid rgba(176, 58, 108, 0.3)",
              borderRadius: 2,
              p: 4,
              mb: 5,
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                mb: 1,
                background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Welcome back, {getDisplayName(user)}!
            </Typography>

            {/* Company name display for representatives - only show if they have a valid companyId */}
            {user.role === "representative" && user.companyId && user.companyName && (
              <Box sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                px: 2,
                py: 1,
                bgcolor: "rgba(56, 133, 96, 0.1)",
                borderRadius: 2,
                border: "1px solid rgba(56, 133, 96, 0.2)"
              }}>
                <BusinessIcon sx={{ fontSize: 20, color: "#388560" }} />
                <Typography variant="body1" sx={{ fontWeight: 500, color: "#388560" }}>
                  Representing {user.companyName}
                </Typography>
              </Box>
            )}

            <Typography variant="body1" color="text.secondary">
              You're all set to explore career opportunities at our virtual fair.
            </Typography>
          </Box>

          {/* Event List - Shows scheduled career fairs */}
          <EventList />

          {/* Fair Status Alert */}
          {!loadingFairStatus && !isLive && (
            <Alert
              severity="info"
              sx={{
                mb: 3,
                borderRadius: 2,
                bgcolor: "rgba(56, 133, 96, 0.1)",
                border: "1px solid rgba(56, 133, 96, 0.3)",
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                Career Fair is Not Currently Live
              </Typography>
              <Typography variant="body2">
                {getFairStatusMessage(user?.role)}
              </Typography>
            </Alert>
          )}

          {/* Company Owner-specific section */}
          {user?.role === "companyOwner" && (
            <CompanyOwnerSection 
              navigate={navigate}
              isLive={isLive}
              totalRepresentatives={totalRepresentatives}
            />
          )}
          {/* Representative-specific section */}
          {user?.role === "representative" && (
            <RepresentativeSection 
              navigate={navigate}
              user={user}
              isLive={isLive}
              setInviteCodeDialogOpen={setInviteCodeDialogOpen}
            />
          )}

          {/* Administrator-specific section */}
          {user?.role === "administrator" && (
            <AdminSection navigate={navigate} />
          )}

          {/* Student-specific section */}
          {user?.role === "student" && (
            <StudentSection 
              navigate={navigate}
              isLive={isLive}
              jobInvitationsCount={jobInvitationsCount}
              newInvitationsCount={newInvitationsCount}
              loadingInvitations={loadingInvitations}
            />
          )}

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
