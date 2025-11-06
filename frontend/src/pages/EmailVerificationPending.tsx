import { useState, useEffect } from "react"
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
import { auth } from "../firebase"
import { sendEmailVerification } from "firebase/auth"
import { authUtils } from "../utils/auth"
import EmailIcon from "@mui/icons-material/Email"
import RefreshIcon from "@mui/icons-material/Refresh"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"

export default function EmailVerificationPending() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    const user = auth.currentUser
    if (user?.email) setEmail(user.email)
    else if (location.state?.email) {
      setEmail(location.state.email)
      setPassword(location.state.password || "")
    } else {
      navigate("/")
    }
  }, [navigate, location.state])

  const resendVerification = async () => {
    try {
      setLoading(true)
      setError("")
      const user = auth.currentUser
      if (user) {
        await sendEmailVerification(user)
        setSuccess("Verification email sent! Check your inbox.")
        setResendCooldown(60)
      } else {
        setError("No user found.")
      }
    } catch {
      setError("Failed to resend email.")
    } finally {
      setLoading(false)
    }
  }

  const checkVerificationStatus = async () => {
    setLoading(true)
    setError("")
    const result = await authUtils.verifyAndLogin(email, password)
    setLoading(false)

    if (result.success) navigate("/dashboard")
    else setError(result.error)
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 3,
          px: 4,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Button onClick={() => navigate("/")} sx={{ color: "white", p: 1 }}>
              <ArrowBackIcon />
            </Button>
            <EmailIcon sx={{ fontSize: 32, color: "white" }} />
            <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
              Email Verification Required
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 6 }}>
        <Card sx={{ boxShadow: 3 }}>
          <CardContent sx={{ p: 6, textAlign: "center" }}>
            <EmailIcon sx={{ fontSize: 80, color: "#388560", mb: 2 }} />
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
              Check Your Email
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              We’ve sent a verification link to <strong>{email}</strong>
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
              <Button
                variant="contained"
                onClick={checkVerificationStatus}
                disabled={loading}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                  },
                  px: 4,
                  py: 1.5,
                  borderRadius: 2,
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : "I've Verified My Email"}
              </Button>

              <Button
                variant="outlined"
                onClick={resendVerification}
                disabled={resendCooldown > 0 || loading}
                startIcon={<RefreshIcon />}
                sx={{ borderRadius: 2 }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}
