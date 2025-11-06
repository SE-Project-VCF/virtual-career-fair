"use client"

import { useState, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Grid,
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { doc, getDoc, updateDoc, collection, addDoc } from "firebase/firestore"
import { db } from "../firebase"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import BusinessIcon from "@mui/icons-material/Business"
import UploadIcon from "@mui/icons-material/Upload"
import SaveIcon from "@mui/icons-material/Save"

interface BoothData {
  companyName: string
  industry: string
  companySize: string
  location: string
  description: string
  logoUrl?: string
  openPositions: number
  hiringFor?: string
  website?: string
  careersPage?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
}

interface Company {
  id: string
  companyName: string
  ownerId: string
  representativeIDs: string[]
  boothId?: string
}

const INDUSTRIES = [
  { value: "software", label: "Software Development" },
  { value: "data", label: "Data Science & Analytics" },
  { value: "healthcare", label: "Healthcare Technology" },
  { value: "finance", label: "Financial Services" },
  { value: "energy", label: "Renewable Energy" },
  { value: "education", label: "Education Technology" },
  { value: "retail", label: "Retail & E-commerce" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "other", label: "Other" },
]

const COMPANY_SIZES = [
  { value: "1-50", label: "1-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-500", label: "201-500 employees" },
  { value: "501-1000", label: "501-1000 employees" },
  { value: "1000+", label: "1000+ employees" },
]

export default function BoothEditor() {
  const navigate = useNavigate()
  const { companyId } = useParams<{ companyId: string }>()
  const user = authUtils.getCurrentUser()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [formData, setFormData] = useState<BoothData>({
    companyName: "",
    industry: "",
    companySize: "",
    location: "",
    description: "",
    openPositions: 0,
    hiringFor: "",
    website: "",
    careersPage: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  })

  const userId = useMemo(() => user?.uid, [user?.uid])
  const userRole = useMemo(() => user?.role, [user?.role])

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }

    if (!companyId) {
      navigate("/companies")
      return
    }

    fetchCompany()
  }, [navigate, companyId, userId])

  const fetchCompany = async () => {
    if (!companyId) return

    try {
      setLoading(true)
      setError("")

      const companyDoc = await getDoc(doc(db, "companies", companyId))

      if (!companyDoc.exists()) {
        setError("Company not found")
        setLoading(false)
        return
      }

      const companyData = companyDoc.data() as Omit<Company, "id">
      const companyInfo: Company = {
        id: companyDoc.id,
        ...companyData,
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

      // Load existing booth if it exists
      if (companyInfo.boothId) {
        await loadBooth(companyInfo.boothId)
      } else {
        // Pre-fill company name
        setFormData((prev) => ({
          ...prev,
          companyName: companyInfo.companyName,
        }))
      }
    } catch (err) {
      console.error("Error fetching company:", err)
      setError("Failed to load company")
    } finally {
      setLoading(false)
    }
  }

  const loadBooth = async (boothId: string) => {
    try {
      const boothDoc = await getDoc(doc(db, "booths", boothId))
      if (boothDoc.exists()) {
        const boothData = boothDoc.data()
        setFormData({
          companyName: boothData.companyName || company?.companyName || "",
          industry: boothData.industry || "",
          companySize: boothData.companySize || "",
          location: boothData.location || "",
          description: boothData.description || "",
          logoUrl: boothData.logoUrl,
          openPositions: boothData.openPositions || 0,
          hiringFor: boothData.hiringFor || "",
          website: boothData.website || "",
          careersPage: boothData.careersPage || "",
          contactName: boothData.contactName || "",
          contactEmail: boothData.contactEmail || "",
          contactPhone: boothData.contactPhone || "",
        })
      }
    } catch (err) {
      console.error("Error loading booth:", err)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!company || !userId) return

    try {
      setSaving(true)
      setError("")
      setSuccess("")

      // Validate required fields
      if (!formData.companyName || !formData.industry || !formData.companySize || !formData.location || !formData.description || !formData.contactName || !formData.contactEmail) {
        setError("Please fill in all required fields")
        setSaving(false)
        return
      }

      const boothData = {
        companyId: company.id,
        companyName: formData.companyName,
        industry: formData.industry,
        companySize: formData.companySize,
        location: formData.location,
        description: formData.description,
        logoUrl: formData.logoUrl || null,
        openPositions: formData.openPositions || 0,
        hiringFor: formData.hiringFor || null,
        website: formData.website || null,
        careersPage: formData.careersPage || null,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone || null,
        updatedAt: new Date().toISOString(),
      }

      // Remove undefined/null fields
      const cleanedData = Object.fromEntries(
        Object.entries(boothData).filter(([_, value]) => value !== undefined && value !== null)
      )

      let boothId = company.boothId

      if (boothId) {
        // Update existing booth
        await updateDoc(doc(db, "booths", boothId), cleanedData)
        setSuccess("Booth updated successfully!")
      } else {
        // Create new booth
        const boothRef = await addDoc(collection(db, "booths"), {
          ...cleanedData,
          createdAt: new Date().toISOString(),
        })
        boothId = boothRef.id

        // Update company with boothId
        await updateDoc(doc(db, "companies", company.id), {
          boothId: boothId,
        })

        setSuccess("Booth created successfully!")
      }

      setTimeout(() => {
        navigate(`/company/${company.id}`)
      }, 1500)
    } catch (err: any) {
      console.error("Error saving booth:", err)
      setError(err.message || "Failed to save booth")
    } finally {
      setSaving(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // TODO: Upload to Firebase Storage and get URL
      // For now, just log it
      console.log("Logo file selected:", file.name)
      // In a real implementation, you'd upload to Firebase Storage and set logoUrl
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
            <IconButton onClick={() => navigate(`/company/${company.id}`)} sx={{ color: "white" }}>
              <ArrowBackIcon />
            </IconButton>
            <BusinessIcon sx={{ fontSize: 32, color: "white" }} />
            <Typography variant="h4" sx={{ fontWeight: 700, color: "white", flex: 1 }}>
              {company.boothId ? "Edit Booth" : "Create Booth"}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)", mt: 1, ml: 9 }}>
            Set up your company presence at the virtual career fair
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 4 }}>
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

        <Card sx={{ p: 4 }}>
          <form onSubmit={handleSubmit}>
            {/* Company Information Section */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
                <BusinessIcon sx={{ color: "#388560" }} />
                Company Information
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Company Name"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    required
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel>Industry</InputLabel>
                    <Select
                      value={formData.industry}
                      label="Industry"
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    >
                      {INDUSTRIES.map((industry) => (
                        <MenuItem key={industry.value} value={industry.value}>
                          {industry.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel>Company Size</InputLabel>
                    <Select
                      value={formData.companySize}
                      label="Company Size"
                      onChange={(e) => setFormData({ ...formData, companySize: e.target.value })}
                    >
                      {COMPANY_SIZES.map((size) => (
                        <MenuItem key={size.value} value={size.value}>
                          {size.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="City, State/Country"
                    required
                  />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Company Description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    multiline
                    rows={4}
                    placeholder="Tell us about your company, mission, and culture..."
                    required
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    This will be displayed on your booth card
                  </Typography>
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <input
                      accept="image/png,image/jpeg,image/jpg"
                      style={{ display: "none" }}
                      id="logo-upload"
                      type="file"
                      onChange={handleFileChange}
                    />
                    <label htmlFor="logo-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        startIcon={<UploadIcon />}
                        sx={{
                          borderColor: "#388560",
                          color: "#388560",
                          "&:hover": {
                            borderColor: "#2d6b4d",
                            bgcolor: "rgba(56, 133, 96, 0.05)",
                          },
                        }}
                      >
                        Upload Logo
                      </Button>
                    </label>
                    <Typography variant="body2" color="text.secondary">
                      PNG, JPG up to 5MB (recommended: 400x400px)
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 4 }} />

            {/* Recruitment Information Section */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
                Recruitment Information
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Number of Open Positions"
                    type="number"
                    value={formData.openPositions}
                    onChange={(e) => setFormData({ ...formData, openPositions: parseInt(e.target.value) || 0 })}
                    required
                    inputProps={{ min: 0 }}
                  />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Hiring For (Optional)"
                    value={formData.hiringFor}
                    onChange={(e) => setFormData({ ...formData, hiringFor: e.target.value })}
                    multiline
                    rows={3}
                    placeholder="e.g., Software Engineers, Data Scientists, Product Managers..."
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Company Website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://www.example.com"
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Careers Page URL"
                    type="url"
                    value={formData.careersPage}
                    onChange={(e) => setFormData({ ...formData, careersPage: e.target.value })}
                    placeholder="https://www.example.com/careers"
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 4 }} />

            {/* Contact Information Section */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
                Contact Information
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Contact Person Name"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="Full name"
                    required
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Contact Email"
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder="contact@example.com"
                    required
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Contact Phone (Optional)"
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Submit Buttons */}
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, pt: 3, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
              <Button
                variant="outlined"
                onClick={() => navigate(`/company/${company.id}`)}
                disabled={saving}
                sx={{
                  borderColor: "#388560",
                  color: "#388560",
                  "&:hover": {
                    borderColor: "#2d6b4d",
                    bgcolor: "rgba(56, 133, 96, 0.05)",
                  },
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                disabled={saving}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                  },
                }}
              >
                {saving ? (company.boothId ? "Updating..." : "Creating...") : company.boothId ? "Update Booth" : "Create Booth"}
              </Button>
            </Box>
          </form>
        </Card>

        {/* Help Text */}
        <Box sx={{ textAlign: "center", mt: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Need help? Contact our support team at{" "}
            <Typography component="a" href="mailto:support@careerfair.com" sx={{ color: "#388560", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
              support@careerfair.com
            </Typography>
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}

