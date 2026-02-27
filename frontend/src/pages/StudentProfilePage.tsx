import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Card,
} from "@mui/material"
import ProfileMenu from "./ProfileMenu"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "../firebase"
import { authUtils } from "../utils/auth"
import { API_URL } from "../config"

export default function StudentProfilePage() {
  const navigate = useNavigate()

  // Get user from localStorage like BoothEditor does
  const user = authUtils.getCurrentUser()

  const [major, setMajor] = useState("")
  const [year, setYear] = useState("")
  const [skills, setSkills] = useState("")
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [uploadPct, setUploadPct] = useState<number | null>(null)

  // If user is not authenticated, redirect to login
  useEffect(() => {
    if (!user) {
      navigate("/login")
    }
  }, [navigate, user])

  // Load existing profile data once the user is ready
  useEffect(() => {
    if (!user) return

    const fetchProfile = async () => {
      try {
        // NOTE: use /users (matches your Firestore rules)
        const docRef = doc(db, "users", user.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          setMajor(data.major || "")
          setYear(data.expectedGradYear || "")
          setSkills(data.skills || "")
          setResumeUrl(data.resumeUrl || null)
        }
      } catch (err: any) {
        console.error("Error fetching profile:", err)
        setError(err?.message || "Failed to load profile.")
      }
    }

    fetchProfile()
  }, [user])

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

    const gradYear = parseInt(year, 10)
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
        console.log("Upload response:", result)
        // Store the file path (not the URL)
        // Frontend will fetch signed URL when viewing
        uploadedUrl = result.filePath || null
        console.log("uploadedUrl set to:", uploadedUrl)
        if (!uploadedUrl) {
          console.warn("Warning: filePath is empty/null from backend response")
        }
      }

      await setDoc(
        docRef,
        {
          major,
          expectedGradYear: year,
          skills,
          resumeUrl: uploadedUrl || null,
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
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
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

  if (!user) return null

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 3,
          px: 4,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Container
          maxWidth="lg"
          sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
            Job Goblin - Virtual Career Fair
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* Other buttons can be added here */}
            <ProfileMenu />
          </Box>
        </Container>
      </Box>

      {/* Profile Form */}
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Card sx={{ p: 4, borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
            Customize Profile
          </Typography>

          <form onSubmit={handleSave}>
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
              label="Expected Graduation Year"
              type="number"
              fullWidth
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
              sx={{ mb: 3 }}
            />

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
                Upload Resume (PDF)
                <input 
                  id="resume-file-input"
                  name="resume"
                  type="file" 
                  hidden 
                  onChange={handleFileChange}
                  accept=".pdf"
                />
              </Button>

              {resumeFile && <Typography sx={{ mt: 1 }}>Selected: {resumeFile.name}</Typography>}

              {uploadPct !== null && (
                <Typography sx={{ mt: 1 }}>Uploading: {uploadPct}%</Typography>
              )}

              {!resumeFile && resumeUrl && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
                    Resume uploaded successfully
                  </Typography>
                  <Button 
                    variant="outlined"
                    color="primary" 
                    onClick={handleViewResume}
                  >
                    View Your Resume
                  </Button>
                </Box>
              )}
            </Box>

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
    </Box>
  )
}