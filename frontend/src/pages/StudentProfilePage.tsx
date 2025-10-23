"use client"

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
import { authUtils } from "../utils/auth"
import ProfileMenu from "./ProfileMenu"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db, storage } from "../firebase"
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"

export default function StudentProfilePage() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()

  const [major, setMajor] = useState("")
  const [year, setYear] = useState("")
  const [skills, setSkills] = useState("")
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Load existing profile data once on mount
  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }
    if (!user) return

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, "students", user.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          setMajor(data.major || "")
          setYear(data.expectedGradYear || "")
          setSkills(data.skills || "")
          setResumeUrl(data.resumeUrl || null)
        }
      } catch (err) {
        console.error("Error fetching profile:", err)
      }
    }

    fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const gradYear = parseInt(year)
    if (gradYear < 2023 || gradYear > 2035) {
      setError("Enter a realistic graduation year (2023-2035).")
      return
    }

    setError("")
    setLoading(true)

    try {
      const docRef = doc(db, "students", user.uid)
      let uploadedUrl = resumeUrl

      if (resumeFile) {
        const storageRef = ref(storage, `resumes/${user.uid}/${resumeFile.name}`)
        const uploadTask = uploadBytesResumable(storageRef, resumeFile)

        uploadedUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            null,
            (err) => reject(err),
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref)
              resolve(url)
            }
          )
        })
      }

      await updateDoc(docRef, {
        major,
        expectedGradYear: year,
        skills,
        resumeUrl: uploadedUrl || null,
      })
      setResumeUrl(uploadedUrl || null)
      alert("Profile saved successfully!")
    } catch (err) {
      console.error(err)
      setError("Failed to save profile. Try again.")
    } finally {
      setLoading(false)
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
            Virtual Career Fair
          </Typography>
          {/* Profile circle button far right */}
          <Box sx={{ ml: 4 }}>
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
              <Button variant="contained" component="label">
                Upload Resume (PDF)
                <input type="file" hidden onChange={handleFileChange} />
              </Button>
              {resumeFile && (
                <Typography sx={{ mt: 1 }}>{resumeFile.name}</Typography>
              )}
              {!resumeFile && resumeUrl && (
                <Typography sx={{ mt: 1 }}>
                  <a
                    href={resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Existing Resume
                  </a>
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button variant="outlined" onClick={() => navigate("/dashboard")}>
                Back
              </Button>

              <Button type="submit" variant="contained" disabled={loading}>
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Save Profile"
                )}
              </Button>
            </Box>
          </form>
        </Card>
      </Container>
    </Box>
  )
}
