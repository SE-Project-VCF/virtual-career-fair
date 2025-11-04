"use client"

import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Box, TextField, Button, Typography, Alert, Paper } from "@mui/material"
import { authUtils } from "../utils/auth"
import PeopleIcon from "@mui/icons-material/People"
import EventIcon from "@mui/icons-material/Event"
import LoginIcon from "@mui/icons-material/Login"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import { Badge } from "@mui/icons-material"

export default function EmployerLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
  
    if (!email || !password) {
      setError("All fields are required.")
      return
    }

    // ✅ Use the unified login system for companyOwner role
    const result = await authUtils.loginUser(email, password, "companyOwner")

    if (result.success) {
      navigate("/dashboard")
    } else {
      if (result.needsVerification) {
        setError("Please verify your email before logging in. Check your inbox for a verification link.")
      } else {
        setError(result.error || "Login failed.")
      }
    }
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Box
        sx={{
          flex: 1,
          background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
          color: "white",
          p: 6,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
            top: "-100px",
            right: "-100px",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.05)",
            bottom: "-50px",
            left: "-50px",
          }}
        />

        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 3 }}>
            Welcome Back, Employer!
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Continue building your team with top talent
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <PeopleIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Find Candidates
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Browse qualified student profiles
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <EventIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Host Events
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Organize virtual sessions
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <TrendingUpIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Grow Your Team
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Post jobs and internships
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 4,
          bgcolor: "#f5f5f5",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: 3,
            background: "rgba(255, 255, 255, 0.98)",
            width: "100%",
            maxWidth: "450px",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <Box
              sx={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Badge sx={{ fontSize: 32, color: "white" }} />
            </Box>
          </Box>

          <Box sx={{ mb: 4 }}>
            <Typography
              variant="h4"
              align="center"
              sx={{
                fontWeight: 700,
                mb: 1,
                color: "#1a1a1a",
              }}
            >
              Employer Sign In
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center">
              Access your employer dashboard
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              sx={{
                mb: 2,
                "& .MuiOutlinedInput-root": {
                  bgcolor: "white",
                  borderRadius: 2,
                  "&:hover fieldset": {
                    borderColor: "#388560",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#388560",
                  },
                },
                "& .MuiInputLabel-root.Mui-focused": {
                  color: "#388560",
                },
              }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              sx={{
                mb: 3,
                "& .MuiOutlinedInput-root": {
                  bgcolor: "white",
                  borderRadius: 2,
                  "&:hover fieldset": {
                    borderColor: "#388560",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#388560",
                  },
                },
                "& .MuiInputLabel-root.Mui-focused": {
                  color: "#388560",
                },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              startIcon={<LoginIcon />}
              sx={{
                py: 1.5,
                borderRadius: 2,
                background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                fontSize: "1.1rem",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "0 4px 12px rgba(56, 133, 96, 0.3)",
                "&:hover": {
                  background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                  boxShadow: "0 6px 16px rgba(56, 133, 96, 0.4)",
                },
              }}
            >
              Sign In
            </Button>
          </form>

          <Box sx={{ textAlign: "center", mt: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Don't have an account?{" "}
              <Link
                to="/employer/register"
                style={{
                  color: "#b03a6c",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Register here
              </Link>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <Link
                to="/"
                style={{
                  color: "#666",
                  textDecoration: "none",
                }}
              >
                ← Back to role selection
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
