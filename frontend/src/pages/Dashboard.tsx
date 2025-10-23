"use client"

import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Container, Box, Typography, Button, Grid, Card, CardContent } from "@mui/material"
import { authUtils } from "../utils/auth"
import LogoutIcon from "@mui/icons-material/Logout"
import EventIcon from "@mui/icons-material/Event"
import BusinessIcon from "@mui/icons-material/Business"
import WorkIcon from "@mui/icons-material/Work"
import ShareIcon from "@mui/icons-material/Share"
import PeopleIcon from "@mui/icons-material/People"

export default function Dashboard() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/")
      return
    }
    
    // Additional role validation could be added here if needed
    // For now, the login functions handle role validation
  }, [navigate])

  const handleLogout = () => {
    authUtils.logout()
    navigate("/")
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
            <Button
              variant="outlined"
              onClick={handleLogout}
              startIcon={<LogoutIcon />}
              sx={{
                color: "white",
                borderColor: "white",
                "&:hover": {
                  borderColor: "white",
                  bgcolor: "rgba(255,255,255,0.1)",
                },
              }}
            >
              Logout
            </Button>
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
              Welcome back, {user.role === "employer" ? user.companyName : user.role === "representative" ? user.email : user.firstName ?? user.email}!
            </Typography>
            
            {/* Company name display for representatives */}
            {user.role === "representative" && user.companyName && (
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

          {/* Employer-specific section */}
          {user && user.role === "employer" && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
                Company Management
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
                        <ShareIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Invite Representatives
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Generate and manage invite codes for your company representatives.
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => navigate("/invite-code")}
                        sx={{
                          background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                          "&:hover": {
                            background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                          },
                        }}
                      >
                        Manage Invite Codes
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
                        <PeopleIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Team Members
                        </Typography>
                      </Box>
                      <Typography variant="h3" sx={{ fontWeight: 700, color: "#b03a6c", mb: 1 }}>
                        0
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Representatives registered
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Stats Cards */}
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
                    12
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Career sessions available
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
                    45
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
                    128
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Positions available
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  )
}
