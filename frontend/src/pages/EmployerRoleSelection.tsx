"use client"

import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import Badge from "@mui/icons-material/Badge"
import BusinessIcon from "@mui/icons-material/Business"
import PersonIcon from "@mui/icons-material/Person"
import { Box, Button, Container, Paper, Typography } from "@mui/material"
import { useNavigate } from "react-router-dom"

export default function EmployerRoleSelection() {
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
            Employer Portal
          </Typography>
          <Typography variant="h5" color="text.secondary" sx={{ mb: 1 }}>
            Choose your role to continue
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Select whether you're the company owner or a representative
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
          {/* Company Owner Card */}
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
            onClick={() => navigate("/employer/register")}
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
              <BusinessIcon sx={{ fontSize: 48, color: "white" }} />
            </Box>

            <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 2, color: "#1a1a1a" }}>
              Company Owner
            </Typography>

            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4, lineHeight: 1.7 }}>
              Create and manage your company account, invite representatives, and oversee all recruitment activities
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
                  Create company profile and manage settings
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
                  Invite and manage team representatives
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
                  Full access to all company features
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
              Continue as Company Owner
            </Button>
          </Paper>

          {/* Representative Card */}
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
            onClick={() => navigate("/representative/register")}
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
              <PersonIcon sx={{ fontSize: 48, color: "white" }} />
            </Box>

            <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 2, color: "#1a1a1a" }}>
              Company Representative
            </Typography>

            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4, lineHeight: 1.7 }}>
              Join your company's recruitment team as a representative to help find and connect with talented candidates
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
                  Connect with students and candidates
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
                  Participate in virtual events and sessions
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
                  Help with recruitment activities
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
              Continue as Representative
            </Button>
          </Paper>
        </Box>

        <Box sx={{ textAlign: "center", mt: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Already have an account?{" "}
            <Typography
              component="span"
              sx={{
                color: "#388560",
                cursor: "pointer",
                fontWeight: 600,
                textDecoration: "underline",
              }}
              onClick={() => navigate("/employer/login")}
            >
              Sign in as Employer
            </Typography>
            {" or "}
            <Typography
              component="span"
              sx={{
                color: "#b03a6c",
                cursor: "pointer",
                fontWeight: 600,
                textDecoration: "underline",
              }}
              onClick={() => navigate("/representative/login")}
            >
              Sign in as Representative
            </Typography>
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate("/")}
          >
            ← Back to role selection
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}

