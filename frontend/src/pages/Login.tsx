"use client"

import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Box, TextField, Button, Typography, Alert } from "@mui/material"
import { authUtils } from "../utils/auth"
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter"
import GroupsIcon from "@mui/icons-material/Groups"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import LoginIcon from "@mui/icons-material/Login"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email || !password) {
      setError("All fields are required.")
      return
    }

    const result = authUtils.login(email, password)

    if (result.success) {
      navigate("/dashboard")
    } else {
      setError(result.error || "Login failed.")
    }
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Left Panel - Branding */}
      <Box
        sx={{
          flex: 1,
          background: "linear-gradient(135deg, #b03a6c 0%, #8b2d56 100%)",
          color: "white",
          p: 6,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles */}
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
            Welcome Back!
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Continue your journey to career success
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <BusinessCenterIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Career Opportunities
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Access exclusive job openings
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <GroupsIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Network with Employers
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Connect with top companies
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <TrendingUpIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Grow Your Career
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Attend workshops and sessions
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Right Panel - Login Form */}
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
        <Box sx={{ width: "100%", maxWidth: "450px" }}>
          <Box sx={{ mb: 4 }}>
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
              Sign In
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Access your virtual career fair account
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
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
                  "&:hover fieldset": {
                    borderColor: "#b03a6c",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#b03a6c",
                  },
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
                  "&:hover fieldset": {
                    borderColor: "#b03a6c",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#b03a6c",
                  },
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
                background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #8b2d56 0%, #2d6b4d 100%)",
                },
                fontWeight: 600,
                fontSize: "1rem",
              }}
            >
              Sign In
            </Button>
          </form>

          <Typography variant="body2" align="center" sx={{ mt: 3 }}>
            Don't have an account?{" "}
            <Link
              to="/register"
              style={{
                color: "#388560",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Register here
            </Link>
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
