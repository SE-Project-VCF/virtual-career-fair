"use client"

import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
} from "@mui/material"
import { authUtils } from "../utils/auth"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import EventIcon from "@mui/icons-material/Event"
import ProfileMenu from "./ProfileMenu"

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const fetchFairStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const response = await fetch("http://localhost:5000/api/fair-status")
      if (response.ok) {
        const data = await response.json()
        setIsLive(data.isLive || false)
      } else {
        setError("Failed to fetch fair status")
      }
    } catch (err) {
      console.error("Error fetching fair status:", err)
      setError("Failed to fetch fair status")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }

    if (user?.role !== "administrator") {
      navigate("/dashboard")
      return
    }

    fetchFairStatus()
  }, [navigate, user?.role, user?.uid, fetchFairStatus])

  const handleToggleLiveStatus = async () => {
    if (!user?.uid) {
      setError("User not found")
      return
    }

    try {
      setToggling(true)
      setError("")
      setSuccess("")

      const response = await fetch("http://localhost:5000/api/toggle-fair-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.uid }),
      })

      if (response.ok) {
        const data = await response.json()
        setIsLive(data.isLive)
        setSuccess(
          data.isLive
            ? "Career fair is now LIVE! All users can see all booths."
            : "Career fair is now offline. Only company owners and representatives can see their own booths."
        )
        setTimeout(() => setSuccess(""), 5000)
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Failed to toggle fair status")
      }
    } catch (err) {
      console.error("Error toggling fair status:", err)
      setError("Failed to toggle fair status")
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

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
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <AdminPanelSettingsIcon sx={{ fontSize: 32, color: "white" }} />
              <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
                Administrator Dashboard
              </Typography>
            </Box>
            <ProfileMenu />
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
            {success}
          </Alert>
        )}

        <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", mb: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <EventIcon sx={{ fontSize: 40, color: isLive ? "#388560" : "#ccc" }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                  Career Fair Status
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Control when the career fair is live and visible to all users
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                p: 3,
                bgcolor: isLive ? "rgba(56, 133, 96, 0.05)" : "rgba(0, 0, 0, 0.02)",
                borderRadius: 2,
                border: `1px solid ${isLive ? "rgba(56, 133, 96, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
                mb: 3,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={isLive}
                    onChange={handleToggleLiveStatus}
                    disabled={toggling}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": {
                        color: "#388560",
                      },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                        backgroundColor: "#388560",
                      },
                    }}
                  />
                }
                label={
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: isLive ? "#388560" : "#666" }}>
                      {isLive ? "Career Fair is LIVE" : "Career Fair is OFFLINE"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {isLive
                        ? "All users can see all booths at the career fair."
                        : "Only company owners and representatives can see and edit their own booths."}
                    </Typography>
                  </Box>
                }
              />
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <strong>When LIVE:</strong> All users (students, company owners, representatives) can browse and view all booths.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>When OFFLINE:</strong> Only company owners and representatives can see and edit their own booths. Students cannot see any booths.
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#1a1a1a" }}>
              Quick Actions
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                onClick={() => navigate("/booths")}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": {
                    borderColor: "#2d6b4d",
                    bgcolor: "rgba(56, 133, 96, 0.05)",
                  },
                }}
              >
                View All Booths
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate("/dashboard")}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": {
                    borderColor: "#2d6b4d",
                    bgcolor: "rgba(56, 133, 96, 0.05)",
                  },
                }}
              >
                Go to Dashboard
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}

