"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Container, Box, Typography, Button, Grid, Card, CardContent, TextField, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material"
import { authUtils } from "../utils/auth"
import EventIcon from "@mui/icons-material/Event"
import BusinessIcon from "@mui/icons-material/Business"
import WorkIcon from "@mui/icons-material/Work"
import ShareIcon from "@mui/icons-material/Share"
import PeopleIcon from "@mui/icons-material/People"
import ProfileMenu from "./ProfileMenu";


export default function Dashboard() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [inviteCodeDialogOpen, setInviteCodeDialogOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
  const [inviteCodeError, setInviteCodeError] = useState("")
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/")
      return
    }
    
    // Additional role validation could be added here if needed
    // For now, the login functions handle role validation
  }, [navigate])

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
      // Refresh the page to update user data
      window.location.reload()
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
            <ProfileMenu />
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
              Welcome back, {(() => {
                const firstName = user?.firstName || "";
                const lastName = user?.lastName || "";
                if (firstName && lastName) {
                  return `${firstName} ${lastName}`;
                } else if (firstName) {
                  return firstName;
                } else {
                  return user?.email || "User";
                }
              })()}!
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

          {/* Company Owner-specific section */}
          {user && user.role === "companyOwner" && (
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
                        Company representatives registered
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Representative-specific section */}
          {user && user.role === "representative" && (
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
                            // Navigate to company page if companyId is available
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
                        Explore other companies' booths at the virtual career fair.
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => navigate("/booths")}
                        sx={{
                          background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                          "&:hover": {
                            background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
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
          )}

          {/* Student-specific section */}
          {user && user.role === "student" && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
                Career Opportunities
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
                        <BusinessIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Browse Company Booths
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Explore opportunities from top companies at the virtual career fair.
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => navigate("/booths")}
                        sx={{
                          background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                          "&:hover": {
                            background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                          },
                        }}
                      >
                        View All Booths
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
                        <WorkIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Job Opportunities
                        </Typography>
                      </Box>
                      <Typography variant="h3" sx={{ fontWeight: 700, color: "#b03a6c", mb: 1 }}>
                        0
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Available positions
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
            {linking ? "Linking..." : "Link Company"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
