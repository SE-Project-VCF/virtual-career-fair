"use client"

import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Container, Box, TextField, Button, Typography, Alert, Paper } from "@mui/material"
import { authUtils } from "../utils/auth"
import PeopleIcon from "@mui/icons-material/People"
import EventIcon from "@mui/icons-material/Event"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import { Badge } from "@mui/icons-material"

export default function EmployerRegister() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [username, setUsername] = useState("")

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email || !password || !confirmPassword || !companyName) {
      setError("Email, password, confirm password, and company name are required.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.")
      return
    }

    // ✅ Use unified registration for companyOwner role
    const result = await authUtils.registerUser(email, password, "companyOwner", {
      companyName,
      username,
    })

    if (result.success) {
      if (result.needsVerification) {
        // ✅ Pass both email and password for auto-login after verification
        navigate("/verification-pending", { state: { email, password } })
      } else {
        navigate("/employer/login")
      }
    } else {
      setError(result.error || "Registration failed.")
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
          color: "white",
          p: 6,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
            top: "-100px",
            right: "-100px",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            width: "200px",
            height: "200px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.05)",
            bottom: "50px",
            left: "-50px",
          }}
        />

        <Box sx={{ zIndex: 1, maxWidth: "400px" }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
            Find Top Talent
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Connect with qualified candidates and build your team
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <PeopleIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Qualified Candidates
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Access thousands of talented students
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <EventIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Virtual Events
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Host information sessions and interviews
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
                  Find the perfect fit for your company
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
        }}
      >
        <Container maxWidth="sm">
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 5 },
              borderRadius: 3,
              background: "rgba(255, 255, 255, 0.98)",
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

            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              align="center"
              sx={{ fontWeight: 700, color: "#1a1a1a" }}
            >
              Employer Registration
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
              Create your account to find top talent
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Company Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
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
                helperText="Minimum 6 characters"
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
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
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                margin="normal"
                required
                sx={{
                  mb: 3,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
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
                label="Company Name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                margin="normal"
                required
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
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
                label="Username (Optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                margin="normal"
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
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
                sx={{
                  mt: 1,
                  mb: 3,
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
                Create Employer Account
              </Button>
            </form>

            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{" "}
                <Link
                  to="/employer/login"
                  style={{
                    color: "#b03a6c",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  Sign in here
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
        </Container>
      </Box>
    </Box>
  )
}
