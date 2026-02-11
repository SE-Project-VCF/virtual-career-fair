"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  Container, 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent, 
  TextField,
  Alert,
  Grid,
  IconButton,
  Tooltip,
  Divider
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import BusinessIcon from "@mui/icons-material/Business"
import ShareIcon from "@mui/icons-material/Share"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"

export default function InviteCodeManager() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [inviteCode, setInviteCode] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    // Check if user is authenticated and is a company
    if (user?.role !== "company") {
      navigate("/dashboard")
      return
    }

    fetchInviteCode()
  }, [navigate, user])

  const fetchInviteCode = async () => {
    try {
      const companyDoc = await getDoc(doc(db, "company", user?.uid ?? ""))
      
      if (companyDoc.exists()) {
        const data = companyDoc.data()
        setInviteCode(data.inviteCode || "")
        setCompanyName(data.companyName || "")
      } else {
        setError("Company profile not found.")
      }
    } catch (err) {
      console.error("Error fetching invite code:", err)
      setError("Failed to load invite code.")
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setSuccess("Invite code copied to clipboard!")
      setTimeout(() => setSuccess(""), 2000)
    } catch {
      setError("Failed to copy to clipboard.")
    }
  }

  const shareInstructions = `Share this invite code with your company representatives:

1. Representatives should go to the registration page
2. Select "Representative" as their role
3. Enter this invite code: ${inviteCode}
4. Complete their registration

This code links them to your company account.`

  const copyInstructions = async () => {
    try {
      await navigator.clipboard.writeText(shareInstructions)
      setSuccess("Instructions copied to clipboard!")
      setTimeout(() => setSuccess(""), 3000)
    } catch {
      setError("Failed to copy instructions.")
    }
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconButton onClick={() => navigate("/dashboard")} sx={{ color: "white" }}>
              <ArrowBackIcon />
            </IconButton>
            <BusinessIcon sx={{ fontSize: 32, color: "white" }} />
            <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
              Invite Code Manager
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

        <Grid container spacing={3}>
          {/* Invite Code Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ boxShadow: 3 }}>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
                  <BusinessIcon sx={{ fontSize: 28, color: "#388560" }} />
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    {companyName} - Invite Code
                  </Typography>
                </Box>

                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  Share this code with your company representatives so they can register and join your team.
                </Typography>

                <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 3 }}>
                  <TextField
                    value={inviteCode}
                    label="Your Invite Code"
                    disabled
                    fullWidth
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        fontSize: "1.2rem",
                        fontWeight: 600,
                        letterSpacing: "0.1em"
                      }
                    }}
                  />
                  <Tooltip title="Copy invite code">
                    <IconButton onClick={copyToClipboard} color="primary" size="large">
                      <ContentCopyIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Instructions Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ boxShadow: 2 }}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  How to Use Your Invite Code
                </Typography>
                
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    <strong>Step 1:</strong> Share the invite code with your representatives
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    <strong>Step 2:</strong> Representatives go to the registration page
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    <strong>Step 3:</strong> They select "Representative" as their role
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    <strong>Step 4:</strong> They enter your invite code during registration
                  </Typography>
                  <Typography variant="body1">
                    <strong>Step 5:</strong> They complete registration and are linked to your company
                  </Typography>
                </Box>

                <Button
                  variant="outlined"
                  onClick={copyInstructions}
                  startIcon={<ShareIcon />}
                  sx={{ borderRadius: 2, mt: 2 }}
                >
                  Copy Instructions
                </Button>

                <Divider sx={{ my: 3 }} />

                <Typography variant="body2" color="text.secondary">
                  <strong>Security Note:</strong> Keep your invite code private. Only share it with authorized representatives from your company.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}
