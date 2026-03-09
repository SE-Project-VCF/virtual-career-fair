import { useState, useEffect } from "react"
import { Box, Typography, CircularProgress, Alert, Chip, Paper } from "@mui/material"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"

interface StudentProfile {
  uid: string
  firstName?: string
  lastName?: string
  email?: string
  major?: string
  expectedGradYear?: number
  skills?: string
  resumeUrl?: string
}

interface Props {
  studentId: string
}

export default function StudentProfileCard({ studentId }: Props) {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const docRef = doc(db, "users", studentId)
        const docSnap = await getDoc(docRef)

        if (docSnap.exists()) {
          const data = docSnap.data()
          setProfile({
            uid: studentId,
            ...data,
          } as StudentProfile)
        } else {
          setError("Student profile not found")
        }
      } catch (err: any) {
        console.error("Error loading student profile:", err)
        setError("Failed to load student profile")
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [studentId])

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !profile) {
    return (
      <Alert severity="error" sx={{ my: 2 }}>
        {error || "Failed to load profile"}
      </Alert>
    )
  }

  const parseSkills = (skillsString: string | undefined): string[] => {
    if (!skillsString) return []
    return skillsString
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }

  const skills = parseSkills(profile.skills)

  return (
    <Box sx={{ py: 2 }}>
      <Paper sx={{ p: 2, mb: 3, bgcolor: "rgba(56, 133, 96, 0.05)" }}>
        <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
          {profile.firstName} {profile.lastName}
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          {profile.email}
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {profile.major && (
            <Chip
              label={`Major: ${profile.major}`}
              size="small"
              variant="outlined"
              sx={{ borderColor: "#388560", color: "#388560" }}
            />
          )}
          {profile.expectedGradYear && (
            <Chip
              label={`Expected Graduation: ${profile.expectedGradYear}`}
              size="small"
              variant="outlined"
              sx={{ borderColor: "#388560", color: "#388560" }}
            />
          )}
        </Box>
      </Paper>

      {skills.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
            Skills
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {skills.map((skill, idx) => (
              <Chip
                key={idx}
                label={skill}
                size="small"
                sx={{
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                  color: "#388560",
                  fontWeight: "500",
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {profile.resumeUrl && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
            Resume
          </Typography>
          {profile.resumeUrl.startsWith("http") ? (
            <Typography
              component="a"
              href={profile.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: "#388560",
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              View Resume (External)
            </Typography>
          ) : (
            <Typography variant="body2" color="textSecondary">
              Resume stored locally - {profile.resumeUrl}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}
