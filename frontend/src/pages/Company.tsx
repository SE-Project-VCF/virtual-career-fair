"use client"

import { useState, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { 
  Container, 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
  Grid
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import BusinessIcon from "@mui/icons-material/Business"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import PeopleIcon from "@mui/icons-material/People"
import EditIcon from "@mui/icons-material/Edit"

interface Company {
  id: string
  companyName: string
  inviteCode: string
  representativeIDs: string[]
  boothId?: string
  ownerId: string
}

export default function Company() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const user = authUtils.getCurrentUser()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const userId = useMemo(() => user?.uid, [user?.uid])
  const userRole = useMemo(() => user?.role, [user?.role])

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }

    if (!id) {
      navigate("/companies")
      return
    }

    fetchCompany()
  }, [navigate, id, userId])

  const fetchCompany = async () => {
    if (!id) return

    try {
      setLoading(true)
      setError("")
      
      const companyDoc = await getDoc(doc(db, "companies", id))
      
      if (!companyDoc.exists()) {
        setError("Company not found")
        setLoading(false)
        return
      }

      const companyData = companyDoc.data() as Omit<Company, "id">
      const companyInfo: Company = {
        id: companyDoc.id,
        ...companyData
      }

      // Check if user has access (owner or representative)
      if (userRole === "companyOwner" && companyInfo.ownerId !== userId) {
        setError("You don't have access to this company")
        navigate("/companies")
        return
      }

      if (userRole === "representative" && !companyInfo.representativeIDs?.includes(userId ?? "")) {
        setError("You don't have access to this company")
        navigate("/dashboard")
        return
      }

      if (userRole !== "companyOwner" && userRole !== "representative") {
        navigate("/dashboard")
        return
      }

      setCompany(companyInfo)
    } catch (err) {
      console.error("Error fetching company:", err)
      setError("Failed to load company")
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess("Invite code copied to clipboard!")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError("Failed to copy to clipboard")
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error && !company) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Card sx={{ p: 4, maxWidth: 500 }}>
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          <Button onClick={() => navigate("/companies")} variant="contained">
            Go Back
          </Button>
        </Card>
      </Box>
    )
  }

  if (!company) return null

  const isOwner = userRole === "companyOwner" && company.ownerId === userId
  const isRepresentative = userRole === "representative" && company.representativeIDs?.includes(userId ?? "")

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
            <IconButton onClick={() => navigate(isOwner ? "/companies" : "/dashboard")} sx={{ color: "white" }}>
              <ArrowBackIcon />
            </IconButton>
            <BusinessIcon sx={{ fontSize: 32, color: "white" }} />
            <Typography variant="h4" sx={{ fontWeight: 700, color: "white", flex: 1 }}>
              {company.companyName}
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSuccess("")}>
            {success}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Company Information Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%", border: "1px solid rgba(56, 133, 96, 0.3)" }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
                  <BusinessIcon sx={{ color: "#388560" }} />
                  Company Information
                </Typography>

                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Company Name
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {company.companyName}
                  </Typography>
                </Box>

                {isOwner && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Invite Code
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body1" sx={{ fontFamily: "monospace", fontWeight: 600, flex: 1 }}>
                        {company.inviteCode}
                      </Typography>
                      <Tooltip title="Copy invite code">
                        <IconButton onClick={() => copyToClipboard(company.inviteCode)} size="small">
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                )}

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PeopleIcon sx={{ fontSize: 20, color: "#b03a6c" }} />
                  <Typography variant="body2" color="text.secondary">
                    {company.representativeIDs?.length || 0} Representative{company.representativeIDs?.length !== 1 ? "s" : ""}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Booth Management Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%", border: "1px solid rgba(56, 133, 96, 0.3)" }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
                  <EditIcon sx={{ color: "#388560" }} />
                  Booth Management
                </Typography>

                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  Manage your company booth - a student-facing landing page where students can learn about your company and interact with representatives.
                </Typography>

                <Button
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    // TODO: Navigate to booth editor when implemented
                    alert("Booth editing feature coming soon!")
                  }}
                  sx={{
                    background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                    },
                  }}
                >
                  Edit Booth
                </Button>

                {company.boothId && (
                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        // TODO: Navigate to booth view when implemented
                        alert(`View booth: ${company.boothId}`)
                      }}
                      sx={{
                        borderColor: "#388560",
                        color: "#388560",
                        "&:hover": {
                          borderColor: "#2d6b4d",
                          bgcolor: "rgba(56, 133, 96, 0.05)",
                        },
                      }}
                    >
                      View Public Booth
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}

