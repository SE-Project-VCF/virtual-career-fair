"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { 
  Container, 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent, 
  Alert,
  CircularProgress
} from "@mui/material"
import { auth } from "../firebase"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import ErrorIcon from "@mui/icons-material/Error"
import EmailIcon from "@mui/icons-material/Email"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"

export default function VerifyEmail() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<"verifying" | "verified" | "failed">("verifying")
  const [error, setError] = useState("")

  useEffect(() => {
    const handleVerification = async () => {
      try {
        const user = auth.currentUser
        if (user) {
          // Reload user to get latest verification status
          await user.reload()
          
          if (user.emailVerified) {
            setStatus("verified")
            // Redirect to dashboard after a short delay
            setTimeout(() => {
              navigate("/dashboard")
            }, 2000)
          } else {
            setStatus("failed")
            setError("Email verification failed. Please try again.")
          }
        } else {
          setStatus("failed")
          setError("No user found. Please try logging in again.")
        }
      } catch (err: any) {
        console.error("Error verifying email:", err)
        setStatus("failed")
        setError("Error verifying email. Please try again.")
      }
    }

    handleVerification()
  }, [navigate])

  const getStatusContent = () => {
    switch (status) {
      case "verifying":
        return {
          icon: <CircularProgress size={60} sx={{ color: "#388560" }} />,
          title: "Verifying Your Email...",
          message: "Please wait while we verify your email address.",
          color: "#388560"
        }
      case "verified":
        return {
          icon: <CheckCircleIcon sx={{ fontSize: 60, color: "#388560" }} />,
          title: "Email Verified Successfully!",
          message: "Your email has been verified. Redirecting to dashboard...",
          color: "#388560"
        }
      case "failed":
        return {
          icon: <ErrorIcon sx={{ fontSize: 60, color: "#b03a6c" }} />,
          title: "Verification Failed",
          message: error || "Email verification failed. Please try again.",
          color: "#b03a6c"
        }
      default:
        return {
          icon: <CircularProgress size={60} />,
          title: "Processing...",
          message: "Please wait...",
          color: "#388560"
        }
    }
  }

  const content = getStatusContent()

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
            <Button 
              onClick={() => navigate("/")}
              sx={{ color: "white", minWidth: "auto", p: 1 }}
            >
              <ArrowBackIcon />
            </Button>
            <EmailIcon sx={{ fontSize: 32, color: "white" }} />
            <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
              Email Verification
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 6 }}>
        <Card sx={{ boxShadow: 3 }}>
          <CardContent sx={{ p: 6, textAlign: "center" }}>
            <Box sx={{ mb: 4 }}>
              {content.icon}
            </Box>
            
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 2, color: content.color }}>
              {content.title}
            </Typography>
            
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              {content.message}
            </Typography>

            {status === "failed" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                <Button
                  variant="contained"
                  onClick={() => navigate("/")}
                  sx={{
                    background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                    },
                    px: 4,
                    py: 1.5,
                    borderRadius: 2,
                  }}
                >
                  Back to Home
                </Button>
              </Box>
            )}

            {status === "verified" && (
              <Alert severity="success" sx={{ mt: 3, borderRadius: 2 }}>
                You will be redirected to the dashboard shortly.
              </Alert>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}
