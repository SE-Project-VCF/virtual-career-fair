"use client"

import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Box, TextField, Button, Typography, Alert, Paper } from "@mui/material"
import { authUtils } from "../utils/auth"
import LoginIcon from "@mui/icons-material/Login"
import WorkIcon from "@mui/icons-material/Work"
import GroupsIcon from "@mui/icons-material/Groups"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import GoogleIcon from "@mui/icons-material/Google"

export default function Login() {
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

    // Try unified login - it will automatically detect the user's role
    const result = await authUtils.login(email, password)

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

  const handleGoogleLogin = async () => {
    setError("")
    try {
      // Try to login with Google - if user exists in Firestore, use their role
      // If new user, loginWithGoogle will create a Firestore record with "student" role
      // For existing users, it will use their actual role from Firestore
      const result = await authUtils.loginWithGoogle("student")
      
      if (result.success) {
        navigate("/dashboard")
      } else {
        setError(result.error || "Google login failed.")
      }
    } catch (err: any) {
      console.error("Google login error:", err)
      setError("Failed to sign in with Google. Please try again.")
    }
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Box
        sx={{
          flex: 1,
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
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
            Welcome Back!
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Sign in to continue your journey
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <WorkIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Career Opportunities
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Access exclusive job openings and events
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <GroupsIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Network with Others
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Connect with employers and students
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
                background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LoginIcon sx={{ fontSize: 32, color: "white" }} />
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
              Sign In
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center">
              Access your account
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
                    borderColor: "#b03a6c",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#b03a6c",
                  },
                },
                "& .MuiInputLabel-root.Mui-focused": {
                  color: "#b03a6c",
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
                    borderColor: "#b03a6c",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#b03a6c",
                  },
                },
                "& .MuiInputLabel-root.Mui-focused": {
                  color: "#b03a6c",
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
                background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                fontSize: "1.1rem",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "0 4px 12px rgba(176, 58, 108, 0.3)",
                "&:hover": {
                  background: "linear-gradient(135deg, #388560 0%, #b03a6c 100%)",
                  boxShadow: "0 6px 16px rgba(176, 58, 108, 0.4)",
                },
              }}
            >
              Sign In
            </Button>
          </form>

          {/* Google Sign-In button */}
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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <Link
                to="/"
                style={{
                  color: "#666",
                  textDecoration: "none",
                }}
              >
                ← Back to Home
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

