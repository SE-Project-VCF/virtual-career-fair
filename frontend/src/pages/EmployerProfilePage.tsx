import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Card,
  CardContent,
  Divider,
} from "@mui/material"
import BusinessIcon from "@mui/icons-material/Business"
import BaseLayout from "../components/BaseLayout"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "../firebase"
import { authUtils } from "../utils/auth"
import { parseLinkedInProfileUrl } from "../utils/linkedinUrl"

function employerRoleLabel(role: string | undefined): string {
  if (role === "companyOwner") return "Company owner"
  if (role === "representative") return "Company representative"
  if (role === "administrator") return "Administrator"
  return "Employer"
}

export default function EmployerProfilePage() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const isAuthenticated = authUtils.isAuthenticated()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) navigate("/login")
  }, [navigate, isAuthenticated])

  useEffect(() => {
    if (!user) return

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) {
          const d = snap.data()
          setFirstName(typeof d.firstName === "string" ? d.firstName : "")
          setLastName(typeof d.lastName === "string" ? d.lastName : "")
          setJobTitle(typeof d.jobTitle === "string" ? d.jobTitle : "")
          setLinkedinUrl(typeof d.linkedinUrl === "string" ? d.linkedinUrl : "")
        }
      } catch (e) {
        console.error(e)
        setError("Failed to load profile.")
      } finally {
        setPageLoading(false)
      }
    }
    load().catch(() => {
      /* errors handled inside load */
    })
  }, [user?.uid])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    const parsed = parseLinkedInProfileUrl(linkedinUrl)
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }

    setError("")
    setLoading(true)
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          jobTitle: jobTitle.trim() || null,
          linkedinUrl: parsed.href,
        },
        { merge: true }
      )
      if (parsed.href) setLinkedinUrl(parsed.href)
      else setLinkedinUrl("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setLoading(false)
    }
  }

  const companyId = user?.companyId as string | undefined
  const roleLabel = employerRoleLabel(user?.role)

  if (!user) return null

  return (
    <BaseLayout pageTitle="Employer account">
      <Container maxWidth="sm" sx={{ py: 5 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, color: "text.primary" }}>
          Your profile
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {roleLabel}. This information is separate from your company booth and job postings.
        </Typography>

        {pageLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Card elevation={2} sx={{ borderRadius: 2, overflow: "hidden" }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <form onSubmit={handleSave}>
                {error ? (
                  <Typography color="error" sx={{ mb: 2 }}>
                    {error}
                  </Typography>
                ) : null}

                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 600 }}>
                  Contact
                </Typography>
                <TextField
                  label="First name"
                  fullWidth
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="Last name"
                  fullWidth
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="Email"
                  fullWidth
                  value={user.email ?? ""}
                  disabled
                  sx={{ mb: 2 }}
                  helperText="Email is managed through your login account."
                />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 600 }}>
                  Role & networking
                </Typography>
                <TextField
                  label="Job title (optional)"
                  fullWidth
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Campus Recruiter"
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="LinkedIn URL"
                  fullWidth
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/…"
                  helperText="Optional. Shown where your profile appears to candidates."
                  sx={{ mb: 2 }}
                />

                {companyId ? (
                  <Button
                    type="button"
                    variant="outlined"
                    startIcon={<BusinessIcon />}
                    onClick={() => navigate(`/company/${companyId}`)}
                    sx={{ mb: 3 }}
                  >
                    Go to company & booth
                  </Button>
                ) : null}

                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
                  <Button variant="outlined" onClick={() => navigate("/dashboard")} disabled={loading}>
                    Back
                  </Button>
                  <Button type="submit" variant="contained" disabled={loading} size="large">
                    {loading ? <CircularProgress size={22} color="inherit" /> : "Save"}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        )}
      </Container>
    </BaseLayout>
  )
}
