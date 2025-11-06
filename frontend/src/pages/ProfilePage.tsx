"use client"

import { useState, useEffect, type ChangeEvent } from "react"
import { getAuth, type UserCredential, type User } from "firebase/auth"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "../firebase"
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
} from "@mui/material"


// Strongly typed user profile
interface UserProfile {
  name?: string
  email?: string
  role?: "student" | "companyOwner" | "companyRepresentative"
  // Student-specific
  graduationYear?: string
  major?: string
  // Company-specific
  companyName?: string
  position?: string
  description?: string
}

export default function ProfilePage() {
  const [userData, setUserData] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const auth = getAuth()

  const role = userData?.role

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      const user: User | null = auth.currentUser
      if (!user) return
      try {
        const userRef = doc(db, "users", user.uid)
        const snapshot = await getDoc(userRef)
        if (snapshot.exists()) {
          setUserData(snapshot.data() as UserProfile)
        }
      } catch (error) {
        console.error("Error loading profile:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [auth])

  // Handle input changes
  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!userData) return
    const { name, value } = event.target
    setUserData({ ...userData, [name]: value })
  }

  // Save updated profile to Firestore
  const handleSave = async () => {
    const user: User | null = auth.currentUser
    if (!user || !userData) return
    try {
      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, userData as Record<string, any>)
      alert("Profile saved successfully!")
    } catch (error) {
      console.error("Error saving profile:", error)
    }
  }

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="80vh"
      >
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Card
        sx={{
          p: 2,
          borderRadius: 3,
          boxShadow: 4,
          backgroundColor: "#fafafa",
        }}
      >
        <CardContent>
          <Typography
            variant="h4"
            fontWeight="bold"
            gutterBottom
            color="#b03a6c"
          >
            {role === "student" ? "Student Profile" : "Company Profile"}
          </Typography>

          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            {/* Shared fields */}
            <TextField
              label="Full Name"
              name="name"
              value={userData?.name || ""}
              onChange={handleChange}
              fullWidth
            />
            <TextField
              label="Email"
              name="email"
              value={userData?.email || ""}
              disabled
              fullWidth
            />

            {/* Conditional fields */}
            {role === "student" ? (
              <>
                <TextField
                  label="Year of Graduation"
                  name="graduationYear"
                  value={userData?.graduationYear || ""}
                  onChange={handleChange}
                  fullWidth
                />
                <TextField
                  label="Major"
                  name="major"
                  value={userData?.major || ""}
                  onChange={handleChange}
                  fullWidth
                />
              </>
            ) : (
              <>
                <TextField
                  label="Company Name"
                  name="companyName"
                  value={userData?.companyName || ""}
                  onChange={handleChange}
                  fullWidth
                />
                <TextField
                  label="Position"
                  name="position"
                  value={userData?.position || ""}
                  onChange={handleChange}
                  fullWidth
                />
                <TextField
                  label="Company Description"
                  name="description"
                  value={userData?.description || ""}
                  onChange={handleChange}
                  multiline
                  rows={3}
                  fullWidth
                />
              </>
            )}
          </Box>
        </CardContent>

        <CardActions sx={{ justifyContent: "flex-end", mt: 1 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            sx={{
              bgcolor: "#b03a6c",
              "&:hover": { bgcolor: "#9a3461" },
              borderRadius: 2,
              px: 3,
              py: 1,
            }}
          >
            Save Profile
          </Button>
        </CardActions>
      </Card>
    </Container>
  )
}
