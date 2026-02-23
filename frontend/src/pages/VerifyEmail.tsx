import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
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
import { authUtils } from "../utils/auth"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import ErrorIcon from "@mui/icons-material/Error"
import EmailIcon from "@mui/icons-material/Email"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"

export default function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState<"verifying" | "verified" | "failed">("verifying")
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  useEffect(() => {
    const state = location.state as { email?: string; password?: string } | null
    if (state?.email) setEmail(state.email)
    if (state?.password) setPassword(state.password)

    const verify = async () => {
      const result = await authUtils.verifyAndLogin(state?.email, state?.password)
      if (result.success) {
        setStatus("verified")
        setTimeout(() => navigate("/dashboard"), 2000)
      } else {
        setStatus("failed")
        setError(result.error)
      }
    }

    verify()
  }, [location.state, navigate])

  const content =
    status === "verifying"
      ? {
          icon: <CircularProgress size={60} sx={{ color: "#388560" }} />,
          title: "Verifying Your Email...",
          message: "Please wait while we confirm your email.",
          color: "#388560",
        }
      : status === "verified"
      ? {
          icon: <CheckCircleIcon sx={{ fontSize: 60, color: "#388560" }} />,
          title: "Email Verified Successfully!",
          message: "Redirecting you to your dashboard...",
          color: "#388560",
        }
      : {
          icon: <ErrorIcon sx={{ fontSize: 60, color: "#b03a6c" }} />,
          title: "Verification Failed",
          message: error || "Please try again.",
          color: "#b03a6c",
        }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
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
            <Button onClick={() => navigate("/")} sx={{ color: "white", p: 1 }}>
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
            <Box sx={{ mb: 4 }}>{content.icon}</Box>

            <Typography variant="h4" sx={{ fontWeight: 600, mb: 2, color: content.color }}>
              {content.title}
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              {content.message}
            </Typography>

            {status === "failed" && (
              <Button
                variant="contained"
                onClick={() =>
                  navigate("/verification-pending", { state: { email, password } })
                }
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
                Try Again
              </Button>
            )}

            {status === "verified" && (
              <Alert severity="success" sx={{ mt: 3, borderRadius: 2 }}>
                Redirecting to dashboard...
              </Alert>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}
