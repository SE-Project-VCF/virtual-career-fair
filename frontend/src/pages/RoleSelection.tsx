"use client"

import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import Badge from "@mui/icons-material/Badge"
import SchoolIcon from "@mui/icons-material/School"
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
            Welcome! Please select your role to continue
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Choose how you'd like to participate in the career fair
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
          {/* Student Card */}
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
            onClick={() => navigate("/student/register")}
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
              <SchoolIcon sx={{ fontSize: 48, color: "white" }} />
            </Box>

            <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 2, color: "#1a1a1a" }}>
              I'm a Student
            </Typography>

            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4, lineHeight: 1.7 }}>
              Explore career opportunities, connect with employers, and discover your next internship or full-time
              position
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
                  Browse job and internship opportunities
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
                  Connect with recruiters and employers
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
                  Attend virtual workshops and sessions
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
              Continue as Student
            </Button>
          </Paper>

          {/* Employer Card */}
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
            onClick={() => navigate("/employer/role-selection")}
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
              <Badge sx={{ fontSize: 48, color: "white" }} />
            </Box>

            <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 2, color: "#1a1a1a" }}>
              I'm an Employer
            </Typography>

            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4, lineHeight: 1.7 }}>
              Find talented candidates, showcase your company, and build your team with top students and graduates
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
                  Post job openings and internships
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
                  Connect with qualified candidates
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
                  Host virtual information sessions
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
              Continue as Employer
            </Button>
          </Paper>
        </Box>
      </Container>
    </Box>
  )
}
