"use client"

import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import PersonAddIcon from "@mui/icons-material/PersonAdd"
import LoginIcon from "@mui/icons-material/Login"
import { Box, Button, Container, Paper, Typography } from "@mui/material"
import { useNavigate } from "react-router-dom"

export default function RoleSelection() {
  const navigate = useNavigate()

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)",
        p: 4,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography
            variant="h2"
            sx={{
              fontWeight: 700,
              mb: 2,
              background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Job Goblin - Virtual Career Fair
          </Typography>
          <Typography variant="h5" color="text.secondary" sx={{ mb: 1 }}>
            Welcome! Get started with your account
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Register for a new account or sign in to continue
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 4,
            maxWidth: "900px",
            mx: "auto",
          }}
        >
          {/* Register Card */}
          <Paper
            elevation={0}
            sx={{
              p: 5,
              borderRadius: 3,
              background: "white",
              border: "2px solid transparent",
              transition: "all 0.3s ease",
              cursor: "pointer",
              "&:hover": {
                borderColor: "#b03a6c",
                transform: "translateY(-8px)",
                boxShadow: "0 12px 24px rgba(176, 58, 108, 0.2)",
              },
            }}
            onClick={() => navigate("/register")}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 3,
              }}
            >
              <PersonAddIcon sx={{ fontSize: 48, color: "white" }} />
            </Box>

            <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 2, color: "#1a1a1a" }}>
              Create Account
            </Typography>

            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4, lineHeight: 1.7 }}>
              Join our platform as a student, company owner, or representative and start connecting with career opportunities
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#b03a6c",
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Register as student, employer, or representative
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#b03a6c",
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Access exclusive career opportunities
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#b03a6c",
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Connect with top employers and talented candidates
                </Typography>
              </Box>
            </Box>

            <Button
              fullWidth
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              sx={{
                py: 1.5,
                borderRadius: 2,
                background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                fontSize: "1rem",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                },
              }}
            >
              Register Now
            </Button>
          </Paper>

          {/* Login Card */}
          <Paper
            elevation={0}
            sx={{
              p: 5,
              borderRadius: 3,
              background: "white",
              border: "2px solid transparent",
              transition: "all 0.3s ease",
              cursor: "pointer",
              "&:hover": {
                borderColor: "#388560",
                transform: "translateY(-8px)",
                boxShadow: "0 12px 24px rgba(56, 133, 96, 0.2)",
              },
            }}
            onClick={() => navigate("/login")}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 3,
              }}
            >
              <LoginIcon sx={{ fontSize: 48, color: "white" }} />
            </Box>

            <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 2, color: "#1a1a1a" }}>
              Sign In
            </Typography>

            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4, lineHeight: 1.7 }}>
              Access your existing account and continue your journey with our virtual career fair platform
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#388560",
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Quick and secure login for all account types
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#388560",
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Access your dashboard and saved opportunities
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#388560",
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Continue where you left off
                </Typography>
              </Box>
            </Box>

            <Button
              fullWidth
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              sx={{
                py: 1.5,
                borderRadius: 2,
                background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                fontSize: "1rem",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                },
              }}
            >
              Sign In Now
            </Button>
          </Paper>
        </Box>
      </Container>
    </Box>
  )
}
