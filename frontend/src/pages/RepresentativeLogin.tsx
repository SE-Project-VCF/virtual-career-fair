"use client"

import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Box, TextField, Button, Typography, Alert, Paper } from "@mui/material"
import { authUtils } from "../utils/auth"
import PeopleIcon from "@mui/icons-material/People"
import EventIcon from "@mui/icons-material/Event"
import LoginIcon from "@mui/icons-material/Login"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import PersonIcon from "@mui/icons-material/Person"
import GoogleIcon from "@mui/icons-material/Google"

export default function RepresentativeLogin() {
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

    const result = await authUtils.loginUser(email, password, "representative")

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

  // ✅ UPDATED: Handle Google login with role argument
  const handleGoogleLogin = async () => {
    setError("")
    const result = await authUtils.loginWithGoogle("representative")
    if (result.success) {
      navigate("/dashboard")
    } else {
      setError(result.error || "Google sign-in failed.")
    }
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Left gradient panel */}
      <Box
        sx={{
          flex: 1,
          background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
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
            Welcome Back, Representative!
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Continue helping your company find top talent
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <PeopleIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Connect with Students
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Build relationships with qualified candidates
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <EventIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Participate in Events
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Join virtual sessions and career fairs
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <TrendingUpIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Support Recruitment
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Help your team find the best talent
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Right login panel */}
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
                background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PersonIcon sx={{ fontSize: 32, color: "white" }} />
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
              Representative Sign In
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center">
              Access your representative dashboard
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
                  "&:hover fieldset": { borderColor: "#b03a6c" },
                  "&.Mui-focused fieldset": { borderColor: "#b03a6c" },
                },
                "& .MuiInputLabel-root.Mui-focused": { color: "#b03a6c" },
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
                  "&:hover fieldset": { borderColor: "#b03a6c" },
                  "&.Mui-focused fieldset": { borderColor: "#b03a6c" },
                },
                "& .MuiInputLabel-root.Mui-focused": { color: "#b03a6c" },
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
                background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                fontSize: "1.1rem",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "0 4px 12px rgba(176, 58, 108, 0.3)",
                "&:hover": {
                  background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                  boxShadow: "0 6px 16px rgba(176, 58, 108, 0.4)",
                },
              }}
            >
              Sign In
            </Button>
          </form>

          {/* ✅ Google Sign-In button */}
          <Button
            fullWidth
            variant="outlined"
            size="large"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleLogin}
            sx={{
              mt: 2,
              py: 1.3,
              borderRadius: 2,
              fontSize: "1rem",
              fontWeight: 600,
              textTransform: "none",
              borderColor: "#4285F4",
              color: "#4285F4",
              "&:hover": {
                backgroundColor: "rgba(66, 133, 244, 0.1)",
                borderColor: "#4285F4",
              },
            }}
          >
            Sign in with Google
          </Button>

          <Box sx={{ textAlign: "center", mt: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Don't have an account?{" "}
              <Link
                to="/representative/register"
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
                to="/employer/role-selection"
                style={{
                  color: "#666",
                  textDecoration: "none",
                }}
              >
                ← Back to employer role selection
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
