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
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore"
import { db, storage } from "../firebase"
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"

import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import BusinessIcon from "@mui/icons-material/Business"
import UploadIcon from "@mui/icons-material/Upload"
import SaveIcon from "@mui/icons-material/Save"
import ProfileMenu from "./ProfileMenu"

interface BoothData {
  companyName: string
  industry: string
  companySize: string
  location: string
  description: string
  logoUrl?: string
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

  // Booth form fields that are saved to Firestore
  const [formData, setFormData] = useState<BoothData>({
    companyName: "",
    industry: "",
    companySize: "",
    location: "",
    description: "",
    website: "",
    careersPage: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  })

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadProgress, setLogoUploadProgress] = useState(0)

  // Stable derived values for effects/guards
  const userId = useMemo(() => user?.uid ?? null, [user?.uid])
  const userRole = useMemo(() => user?.role ?? null, [user?.role])

  useEffect(() => {
    // Auth guard
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }

    // Route guard
    if (!companyId) {
      navigate("/companies")
      return
    }

    // Load company + booth data
    void fetchCompany()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, companyId, userId])

  useEffect(() => {
    // Cleanup preview object URLs to avoid memory leaks
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
    }
  }, [logoPreviewUrl])

  /**
   * Fetch the company doc and validate access.
   * If the company has boothId, load the booth and pre-fill the form.
   */
  const fetchCompany = async () => {
    if (!companyId) return

    try {
      setLoading(true)
      setError("")

      const companyDoc = await getDoc(doc(db, "companies", companyId))
      if (!companyDoc.exists()) {
        setError("Company not found")
        return
      }

      const companyData = companyDoc.data() as Omit<Company, "id">
      const companyInfo: Company = { id: companyDoc.id, ...companyData }

      // Access control:
      // - Owners can edit their own company
      // - Reps can edit if in representativeIDs
      if (!userId || !userRole) {
        setError("User not authenticated.")
        navigate("/login")
        return
      }

      if (userRole === "companyOwner" && companyInfo.ownerId !== userId) {
        setError("You don't have access to this company")
        navigate("/companies")
        return
      }

      if (
        userRole === "representative" &&
        !companyInfo.representativeIDs?.includes(userId)
      ) {
        setError("You don't have access to this company")
        navigate("/dashboard")
        return
      }

      if (userRole !== "companyOwner" && userRole !== "representative") {
        navigate("/dashboard")
        return
      }

      setCompany(companyInfo)

      // Load existing booth if it exists; otherwise prefill company name.
      if (companyInfo.boothId) {
        await loadBooth(companyInfo.boothId, companyInfo.companyName)
      } else {
        setFormData((prev) => ({ ...prev, companyName: companyInfo.companyName }))
      }
    } catch (err) {
      console.error("Error fetching company:", err)
      setError("Failed to load company")
    } finally {
      setLoading(false)
    }
  }

  /**
   * Loads booth data and hydrates the form.
   * Also uses existing logoUrl for display if present.
   */
  const loadBooth = async (boothId: string, fallbackCompanyName: string) => {
    try {
      const boothDoc = await getDoc(doc(db, "booths", boothId))
      if (!boothDoc.exists()) return

      const boothData = boothDoc.data()
      setFormData({
        companyName: boothData.companyName || fallbackCompanyName || "",
        industry: boothData.industry || "",
        companySize: boothData.companySize || "",
        location: boothData.location || "",
        description: boothData.description || "",
        logoUrl: boothData.logoUrl,
        website: boothData.website || "",
        careersPage: boothData.careersPage || "",
        contactName: boothData.contactName || "",
        contactEmail: boothData.contactEmail || "",
        contactPhone: boothData.contactPhone || "",
      })
    } catch (err) {
      console.error("Error loading booth:", err)
    }
  }

  /**
   * Called when a user selects an image file.
   * This does NOT upload yet; upload happens on Save/Update.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate image type
    const isValidType =
      file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/jpg"
    if (!isValidType) {
      setError("Only PNG or JPG images are allowed.")
      return
    }

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Logo file must be under 5MB.")
      return
    }

    setError("")
    setLogoFile(file)

    // Create a local preview url
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
    setLogoPreviewUrl(URL.createObjectURL(file))
  }

  /**
   * Upload logo to Firebase Storage and return the download URL.
   * Storage path includes companyId + uploader uid for rules + auditing:
   *   boothLogos/{companyId}/{uploaderUid}/{timestamp}-{original}
   */
  const uploadLogoAndGetUrl = async (file: File): Promise<string> => {
    if (!company || !userId) {
      throw new Error("Missing company or user id for upload.")
    }

    const fileName = `${Date.now()}-${file.name}`
    const storagePath = `boothLogos/${company.id}/${userId}/${fileName}`
    const storageRef = ref(storage, storagePath)

    setLogoUploading(true)
    setLogoUploadProgress(0)

    const uploadTask = uploadBytesResumable(storageRef, file)

    const url = await new Promise<string>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          setLogoUploadProgress(pct)
        },
        (err) => reject(err),
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref)
          resolve(downloadUrl)
        }
      )
    })

    setLogoUploading(false)
    return url
  }

  /**
   * Save booth data:
   * - Validate the contact email belongs to a registered user
   * - Ensure that contact user is owner or representative for the company
   * - If a new logo was selected, upload it and save the URL
   * - Create or update the booth doc
   * - Ensure companies/{companyId}.boothId is set on first create
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!company || !userId) return

    try {
      setSaving(true)
      setError("")
      setSuccess("")

      // Validate contact rep is a real Firestore user
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("email", "==", formData.contactEmail))
      const snap = await getDocs(q)

      if (snap.empty) {
        setError("Contact email does not match any registered user.")
        return
      }

      const rep = snap.docs[0].data()
      const repId = rep.uid

      // Check that this user belongs to the company
      const isOwner = repId === company.ownerId
      const isRep = company.representativeIDs?.includes(repId)

      if (!isOwner && !isRep) {
        setError("This user is not an owner or representative of your company.")
        return
      }

      // Upload a new logo if one was selected
      let logoUrlToSave: string | null = formData.logoUrl || null
      if (logoFile) {
        try {
          logoUrlToSave = await uploadLogoAndGetUrl(logoFile)
          setFormData((prev) => ({ ...prev, logoUrl: logoUrlToSave || undefined }))

          // Clear file so we don't re-upload accidentally on next save
          setLogoFile(null)
          if (logoPreviewUrl) {
            URL.revokeObjectURL(logoPreviewUrl)
            setLogoPreviewUrl(null)
          }
        } catch (uploadErr) {
          console.error("Logo upload failed:", uploadErr)
          setError("Logo upload failed. Please try again.")
          return
        }
      }

      // Booth document payload
      const boothData = {
        companyId: company.id,
        companyName: formData.companyName,
        industry: formData.industry,
        companySize: formData.companySize,
        location: formData.location,
        description: formData.description,
        logoUrl: logoUrlToSave,
        website: formData.website || null,
        careersPage: formData.careersPage || null,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone || null,
        updatedAt: new Date().toISOString(),
      }

      // Remove undefined/null fields (keeps your existing behavior)
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

        // Link company to booth
        await updateDoc(doc(db, "companies", company.id), { boothId })
        setSuccess("Booth created successfully!")
      }

      setTimeout(() => {
        navigate(`/company/${company.id}`)
      }, 1500)
    } catch (err: any) {
      console.error("Error saving booth:", err)
      setError("Failed to save booth")
    } finally {
      setSaving(false)
      setLogoUploading(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    )
  }

  // Fatal error state (company didn't load)
  if (error && !company) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Card sx={{ p: 4, maxWidth: 500 }}>
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            onClose={() => setError("")}
            slotProps={{
              closeButton: {
                title: "Close"
              }
            }}
          >
            {error}
          </Alert>
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
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
              <IconButton onClick={() => navigate(`/company/${company.id}`)} sx={{ color: "white" }}>
                <ArrowBackIcon />
              </IconButton>
              <BusinessIcon sx={{ fontSize: 32, color: "white" }} />
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
                  {company.boothId ? "Edit Booth" : "Create Booth"}
                </Typography>
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)", mt: 0.5 }}>
                  Set up your company presence at the virtual career fair
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 4 }}>
        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 3, borderRadius: 2 }} 
            onClose={() => setError("")}
            slotProps={{
              closeButton: {
                title: "Close"
              }
            }}
          >
            {error}
          </Alert>
        )}

        {success && (
          <Alert 
            severity="success" 
            sx={{ mb: 3, borderRadius: 2 }} 
            onClose={() => setSuccess("")}
            slotProps={{
              closeButton: {
                title: "Close"
              }
            }}
          >
            {success}
          </Alert>
        )}  

        <Card sx={{ p: 4 }}>
          <form onSubmit={handleSubmit}>
            {/* Company Information Section */}
            <Box sx={{ mb: 4 }}>
              <Typography
                variant="h6"
                sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}
              >
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
                    <InputLabel id="industry-label">Industry</InputLabel>
                    <Select
                      labelId="industry-label"
                      id="industry-select"
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
                    <InputLabel id="company-size-label">Company Size</InputLabel>
                    <Select
                      labelId="company-size-label"
                      id="company-size-select"
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

                {/* Logo Upload */}
                <Grid size={{ xs: 12 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    <input
                      accept="image/png,image/jpeg,image/jpg"
                      style={{ display: "none" }}
                      id="logo-upload"
                      type="file"
                      onChange={handleFileChange}
                      disabled={saving || logoUploading}
                    />
                    <label htmlFor="logo-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        startIcon={<UploadIcon />}
                        disabled={saving || logoUploading}
                        sx={{
                          borderColor: "#388560",
                          color: "#388560",
                          "&:hover": {
                            borderColor: "#2d6b4d",
                            bgcolor: "rgba(56, 133, 96, 0.05)",
                          },
                          "&:disabled": {
                            borderColor: "rgba(0,0,0,0.12)",
                            color: "rgba(0,0,0,0.26)",
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

                  {/* Logo Preview / Status */}
                  <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    {logoPreviewUrl ? (
                      <Box
                        component="img"
                        src={logoPreviewUrl}
                        alt="Selected logo preview"
                        sx={{
                          width: 80,
                          height: 80,
                          borderRadius: 2,
                          objectFit: "cover",
                          border: "1px solid rgba(0,0,0,0.12)",
                        }}
                      />
                    ) : formData.logoUrl ? (
                      <Box
                        component="img"
                        src={formData.logoUrl}
                        alt="Current logo"
                        sx={{
                          width: 80,
                          height: 80,
                          borderRadius: 2,
                          objectFit: "cover",
                          border: "1px solid rgba(0,0,0,0.12)",
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 80,
                          height: 80,
                          borderRadius: 2,
                          background:
                            "linear-gradient(135deg, rgba(56, 133, 96, 0.12) 0%, rgba(176, 58, 108, 0.12) 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid rgba(56, 133, 96, 0.2)",
                        }}
                      >
                        <BusinessIcon sx={{ fontSize: 40, color: "#388560" }} />
                      </Box>
                    )}

                    <Box>
                      {logoFile && (
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Selected: {logoFile.name}
                        </Typography>
                      )}

                      {logoUploading && (
                        <Typography variant="body2" color="text.secondary">
                          Uploading logo… {logoUploadProgress}%
                        </Typography>
                      )}

                      {!logoFile && !!formData.logoUrl && (
                        <Typography variant="body2" color="text.secondary">
                          Current logo is saved and will display on booth pages.
                        </Typography>
                      )}
                    </Box>
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
                disabled={saving || logoUploading}
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
                disabled={saving || logoUploading}
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
            <Typography
              component="a"
              href="mailto:support@careerfair.com"
              sx={{
                color: "#388560",
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              support@careerfair.com
            </Typography>
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}
