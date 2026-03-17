import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Card,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItemButton,
  Chip,
  FormControlLabel,
  Checkbox,
} from "@mui/material"
import BaseLayout from "../components/BaseLayout"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "../firebase"
import { authUtils } from "../utils/auth"
import { API_URL } from "../config"

export default function StudentProfilePage() {
  const navigate = useNavigate()

  // Get user from localStorage like BoothEditor does
  const user = authUtils.getCurrentUser()
  const isAuthenticated = authUtils.isAuthenticated()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const loadTailoredResumesDone = useRef(false)

  const [major, setMajor] = useState("")
  const [year, setYear] = useState("")
  const [skills, setSkills] = useState("")
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [resumeVisible, setResumeVisible] = useState(true)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [uploadPct, setUploadPct] = useState<number | null>(null)

  // Tailored resumes state
  const [tailoredResumes, setTailoredResumes] = useState<any[]>([])
  const [tailoredDialogOpen, setTailoredDialogOpen] = useState(false)
  const [loadingTailored, setLoadingTailored] = useState(false)

  // If user is not authenticated, redirect to login
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login")
    }
  }, [navigate, isAuthenticated])

  // Load existing profile data once when user is ready (use user.uid to avoid re-fetching on every render)
  useEffect(() => {
    if (!user?.uid) return

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, "users", user.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          const validYears = ["2023","2024","2025","2026","2027","2028","2029","2030","2031","2032","2033","2034","2035"]
          const rawYear = data.expectedGradYear != null ? String(data.expectedGradYear) : ""
          setMajor(data.major || "")
          setYear(validYears.includes(rawYear) ? rawYear : "")
          setSkills(data.skills || "")
          setResumeUrl(data.resumeUrl || null)
          setResumeVisible(data.resumeVisible !== false)
        }
      } catch (err: any) {
        console.error("Error fetching profile:", err)
        setError(err?.message || "Failed to load profile.")
      }
    }

    fetchProfile()
  }, [user?.uid])

  // Load tailored resumes
  const loadTailoredResumes = async () => {
    if (!user) return
    try {
      setLoadingTailored(true)
      setError("")
      const token = await authUtils.getIdToken()
      if (!token) {
        // Auth not ready yet, silently skip
        setLoadingTailored(false)
        return
      }

      const response = await fetch(`${API_URL}/api/resume/tailored`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) throw new Error("Failed to load tailored resumes")

      const data = await response.json()
      setTailoredResumes(data.resumes || [])
    } catch (err: any) {
      console.error("Error loading tailored resumes:", err)
      setError(err?.message || "Failed to load tailored resumes")
    } finally {
      setLoadingTailored(false)
    }
  }

  // Load tailored resumes when component mounts - only once
  useEffect(() => {
    if (!user || loadTailoredResumesDone.current) return
    loadTailoredResumesDone.current = true
    loadTailoredResumes()
  }, [user?.uid])

  const handleViewTailoredResume = (resumeId: string) => {
    setTailoredDialogOpen(false)
    navigate(`/dashboard/tailored-resume/${resumeId}`)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      setError("User not authenticated.")
      return
    }

    if (!major || !year) {
      setError("Major and Expected Graduation Year are required.")
      return
    }

    const gradYear = Number.parseInt(year, 10)
    if (Number.isNaN(gradYear) || gradYear < 2023 || gradYear > 2035) {
      setError("Enter a realistic graduation year (2023-2035).")
      return
    }

    setError("")
    setLoading(true)
    setUploadPct(null)

    try {
      const docRef = doc(db, "users", user.uid)
      let uploadedUrl = resumeUrl

      if (resumeFile) {
        // Upload via backend endpoint to bypass CORS issues
        const formData = new FormData()
        formData.append("file", resumeFile)

        // Get the current user's ID token for authentication
        const idToken = await authUtils.getIdToken()
        if (!idToken) {
          throw new Error("Failed to get authentication token. Please log in again.")
        }

        const response = await fetch(`${API_URL}/api/upload-resume`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${idToken}`,
          },
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to upload resume")
        }

        const result = await response.json()
        // Store the file path (not the URL)
        // Frontend will fetch signed URL when viewing
        uploadedUrl = result.filePath || null
      }

      await setDoc(
        docRef,
        {
          major,
          expectedGradYear: year || null,
          skills,
          resumeUrl: uploadedUrl || null,
          resumeVisible,
        },
        { merge: true }
      )

      setResumeUrl(uploadedUrl || null)
      setResumeFile(null)
      alert("Profile saved successfully!")
    } catch (err: any) {
      console.error("Failed to save profile:", err)
      setError(err?.message || "Failed to save profile. Try again.")
    } finally {
      setLoading(false)
      setUploadPct(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== "application/pdf") {
        setError("Only PDF files are allowed.")
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("File size must be under 5MB.")
        return
      }
      setError("")
      setResumeFile(file)
    }
  }

  const handleViewResume = async () => {
    if (!user) return
    try {
      const idToken = await authUtils.getIdToken()
      if (!idToken) {
        setError("Failed to get authentication token")
        return
      }

      const response = await fetch(`${API_URL}/api/get-resume-url/${user.uid}`, {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch resume URL")
      }

      const result = await response.json()
      window.open(result.resumeUrl, "_blank")
    } catch (err: any) {
      setError(err?.message || "Failed to view resume")
    }
  }

  const handleResumeVisibilityToggle = async (checked: boolean) => {
    setResumeVisible(checked)
    
    // Auto-save the visibility toggle to Firestore
    if (!user) return
    try {
      const docRef = doc(db, "users", user.uid)
      await setDoc(
        docRef,
        { resumeVisible: checked },
        { merge: true }
      )
    } catch (err: any) {
      console.error("Error saving resume visibility:", err)
      setError("Failed to save resume visibility")
    }
  }

  if (!user) return null

  return (
    <BaseLayout pageTitle="Customize Profile">
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Card sx={{ p: 4, borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>

          <form onSubmit={handleSave} autoComplete="off">
            {error && (
              <Typography color="error" sx={{ mb: 2 }}>
                {error}
              </Typography>
            )}

            <TextField
              label="Major"
              fullWidth
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              required
              sx={{ mb: 3 }}
            />

            <TextField
              select
              label="Expected Graduation Year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              fullWidth
              required
              sx={{ mb: 3 }}
              SelectProps={{ native: true, name: "expectedGradYear" }}
            >
              <option value="">Select year...</option>
              {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </TextField>

            <TextField
              label="Skills"
              fullWidth
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g., Python, React, SQL"
              sx={{ mb: 3 }}
            />

            {/* Resume Upload */}
            <Box sx={{ mb: 3 }}>
              <Button variant="contained" component="label" disabled={loading}>
                <span>Upload Resume (PDF)</span>
                <input
                  id="resume-file-input"
                  name="resume"
                  type="file"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>

              {resumeFile && <Typography sx={{ mt: 1 }}>{resumeFile.name}</Typography>}

              {uploadPct !== null && (
                <Typography sx={{ mt: 1 }}>Uploading: {uploadPct}%</Typography>
              )}

              {!resumeFile && resumeUrl && (
                <Box sx={{ mt: 2, display: "flex", gap: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
                      Resume uploaded successfully
                    </Typography>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleViewResume}
                    >
                      View Existing Resume
                    </Button>
                  </Box>
                  {tailoredResumes.length > 0 && (
                    <Box>
                      <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
                        {tailoredResumes.length} tailored resume(s)
                      </Typography>
                      <Button 
                        variant="outlined"
                        color="secondary" 
                        onClick={() => setTailoredDialogOpen(true)}
                      >
                        View Tailored Resumes
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            {/* Resume Visibility Toggle */}
            {resumeUrl && (
              <Box sx={{ mb: 3, p: 2, bgcolor: "rgba(56, 133, 96, 0.05)", borderRadius: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={resumeVisible}
                      onChange={(e) => handleResumeVisibilityToggle(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Make Resume Visible"
                  sx={{ mb: 0 }}
                />
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
                  {resumeVisible
                    ? "Your resume is visible to company representatives"
                    : "Your resume is hidden from company representatives"}
                </Typography>
              </Box>
            )}

            <Box
              sx={{
                display: "flex",
                background: "b03a6c",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button variant="outlined" onClick={() => navigate("/dashboard")} disabled={loading}>
                Back
              </Button>

              <Button type="submit" variant="contained" disabled={loading}>
                {loading ? <CircularProgress size={24} color="success" /> : "Save Profile"}
              </Button>
            </Box>
          </form>
        </Card>
      </Container>

      {/* Tailored Resumes Dialog */}
      <Dialog open={tailoredDialogOpen} onClose={() => setTailoredDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select a Tailored Resume</DialogTitle>
        <DialogContent>
          {loadingTailored && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {!loadingTailored && tailoredResumes.length === 0 && (
            <Typography variant="body2" sx={{ color: "gray", py: 2 }}>
              No tailored resumes yet. Create one from your job invitations!
            </Typography>
          )}
          {!loadingTailored && tailoredResumes.length > 0 && (
            <List>
              {tailoredResumes.map((resume) => (
                <ListItemButton
                  key={resume.id}
                  onClick={() => handleViewTailoredResume(resume.id)}
                  sx={{
                    mb: 1,
                    border: "1px solid #eee",
                    borderRadius: 1,
                    "&:hover": { bgcolor: "#f5f5f5" },
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    p: 2,
                  }}
                >
                  {/* Title and Patches */}
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, width: "100%" }}>
                    <Typography variant="body1" sx={{ fontWeight: 500, flex: 1 }}>
                      {resume.jobContext?.jobTitle}
                    </Typography>
                    <Chip
                      label={`${resume.acceptedPatches?.length || 0} patches`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>

                  {/* Created Date and Notes */}
                  <Box sx={{ width: "100%" }}>
                    <Typography variant="caption" sx={{ color: "gray" }}>
                      Created: {new Date(resume.createdAt?.toMillis?.()).toLocaleDateString()}
                    </Typography>
                    {resume.studentNotes && (
                      <Typography variant="caption" sx={{ display: "block", color: "gray", mt: 0.5 }}>
                        Notes: {resume.studentNotes.substring(0, 60)}...
                      </Typography>
                    )}
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTailoredDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </BaseLayout>
  )
}