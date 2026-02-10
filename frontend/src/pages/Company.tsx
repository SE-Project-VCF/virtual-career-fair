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
  Grid,
  TextField,
  Chip
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { doc, getDoc, arrayRemove, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc } from "firebase/firestore"
import { db } from "../firebase"
import BusinessIcon from "@mui/icons-material/Business"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import PeopleIcon from "@mui/icons-material/People"
import EditIcon from "@mui/icons-material/Edit"
import DeleteIcon from "@mui/icons-material/Delete"
import RefreshIcon from "@mui/icons-material/Refresh"
import SaveIcon from "@mui/icons-material/Save"
import CancelIcon from "@mui/icons-material/Cancel"
import WorkIcon from "@mui/icons-material/Work"
import AddIcon from "@mui/icons-material/Add"
import LaunchIcon from "@mui/icons-material/Launch"
import ProfileMenu from "./ProfileMenu"
import List from "@mui/material/List"
import ListItem from "@mui/material/ListItem"
import ListItemText from "@mui/material/ListItemText"
import ListItemSecondaryAction from "@mui/material/ListItemSecondaryAction"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"

interface Company {
  id: string
  companyName: string
  inviteCode: string
  representativeIDs: string[]
  boothId?: string
  ownerId: string
}

interface Representative {
  uid: string
  email: string
  firstName?: string
  lastName?: string
}

interface Job {
  id: string
  companyId: string
  name: string
  description: string
  majorsAssociated: string
  applicationLink: string | null
  createdAt: number | null
}

export default function Company() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const user = authUtils.getCurrentUser()
  const [company, setCompany] = useState<Company | null>(null)
  const [representatives, setRepresentatives] = useState<Representative[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRepresentatives, setLoadingRepresentatives] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [representativeToDelete, setRepresentativeToDelete] = useState<Representative | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteCompanyDialogOpen, setDeleteCompanyDialogOpen] = useState(false)
  const [deletingCompany, setDeletingCompany] = useState(false)
  const [editingInviteCode, setEditingInviteCode] = useState(false)
  const [editedInviteCode, setEditedInviteCode] = useState("")
  const [updatingInviteCode, setUpdatingInviteCode] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [jobTitle, setJobTitle] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [jobSkills, setJobSkills] = useState("")
  const [jobApplicationLink, setJobApplicationLink] = useState("")
  const [jobErrors, setJobErrors] = useState<{title?: string; description?: string; skills?: string; applicationLink?: string}>({})
  const [savingJob, setSavingJob] = useState(false)
  const [deleteJobDialogOpen, setDeleteJobDialogOpen] = useState(false)
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null)
  const [deletingJob, setDeletingJob] = useState(false)

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
      
      // Fetch representatives if there are any
      if (companyInfo.representativeIDs && companyInfo.representativeIDs.length > 0) {
        fetchRepresentatives(companyInfo.representativeIDs)
      }
      
      // Fetch jobs for this company
      fetchJobs(companyInfo.id)
    } catch (err) {
      console.error("Error fetching company:", err)
      setError("Failed to load company")
    } finally {
      setLoading(false)
    }
  }

  const fetchRepresentatives = async (representativeIDs: string[]) => {
    try {
      setLoadingRepresentatives(true)
      const repPromises = representativeIDs.map(async (repId) => {
        const userDoc = await getDoc(doc(db, "users", repId))
        if (userDoc.exists()) {
          const data = userDoc.data()
          return {
            uid: repId,
            email: data.email || "",
            firstName: data.firstName,
            lastName: data.lastName,
          } as Representative
        }
        return null
      })
      
      const reps = (await Promise.all(repPromises)).filter((rep): rep is Representative => rep !== null)
      setRepresentatives(reps)
    } catch (err) {
      console.error("Error fetching representatives:", err)
    } finally {
      setLoadingRepresentatives(false)
    }
  }

  const fetchJobs = async (companyId: string) => {
    try {
      setLoadingJobs(true)
      console.log("Fetching jobs for company:", companyId)
      
      const jobsRef = collection(db, "jobs")
      const q = query(jobsRef, where("companyId", "==", companyId))
      const jobsSnapshot = await getDocs(q)
      
      const jobsList: Job[] = []
      jobsSnapshot.forEach((doc) => {
        const data = doc.data()
        jobsList.push({
          id: doc.id,
          companyId: data.companyId,
          name: data.name,
          description: data.description,
          majorsAssociated: data.majorsAssociated,
          applicationLink: data.applicationLink || null,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt || null,
        })
      })
      
      // Sort by createdAt descending
      jobsList.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0
        if (!a.createdAt) return 1
        if (!b.createdAt) return -1
        return b.createdAt - a.createdAt
      })
      
      console.log("Fetched jobs:", jobsList.length, "jobs")
      setJobs(jobsList)
    } catch (err) {
      console.error("Error fetching jobs:", err)
      setError(`Failed to load job postings: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setLoadingJobs(false)
    }
  }

  const handleCreateJobClick = () => {
    setEditingJob(null)
    setJobTitle("")
    setJobDescription("")
    setJobSkills("")
    setJobApplicationLink("")
    setJobErrors({})
    setJobDialogOpen(true)
  }

  const handleEditJobClick = (job: Job) => {
    setEditingJob(job)
    setJobTitle(job.name)
    setJobDescription(job.description)
    setJobSkills(job.majorsAssociated)
    setJobApplicationLink(job.applicationLink || "")
    setJobErrors({})
    setJobDialogOpen(true)
  }

  const handleDeleteJobClick = (job: Job) => {
    setJobToDelete(job)
    setDeleteJobDialogOpen(true)
  }

  const handleSaveJob = async () => {
    if (!company) return

    // Reset errors
    setJobErrors({})

    // Validate required fields
    const errors: {title?: string; description?: string; skills?: string; applicationLink?: string} = {}
    if (!jobTitle.trim()) {
      errors.title = "Title is required"
    }
    if (!jobDescription.trim()) {
      errors.description = "Description is required"
    }
    if (!jobSkills.trim()) {
      errors.skills = "Skills are required"
    }
    if (jobApplicationLink.trim()) {
      try {
        new URL(jobApplicationLink.trim())
      } catch {
        errors.applicationLink = "Please enter a valid URL (e.g. https://example.com)"
      }
    }

    if (Object.keys(errors).length > 0) {
      setJobErrors(errors)
      return
    }

    setSavingJob(true)

    try {
      if (editingJob) {
        // Update existing job
        const jobRef = doc(db, "jobs", editingJob.id)
        const updateData: any = {
          name: jobTitle.trim(),
          description: jobDescription.trim(),
          majorsAssociated: jobSkills.trim(),
        }
        
        // Only include applicationLink if it's not empty, otherwise set to null
        if (jobApplicationLink.trim()) {
          updateData.applicationLink = jobApplicationLink.trim()
        } else {
          updateData.applicationLink = null
        }
        
        await updateDoc(jobRef, updateData)
        
        setSuccess("Job posting updated successfully!")
        fetchJobs(company.id)
        setJobDialogOpen(false)
      } else {
        // Create new job
        console.log("Creating job for company:", company.id, company.companyName)
        
        const jobsRef = collection(db, "jobs")
        const jobData: any = {
          companyId: company.id,
          name: jobTitle.trim(),
          description: jobDescription.trim(),
          majorsAssociated: jobSkills.trim(),
          createdAt: new Date(),
        }
        
        // Only add applicationLink if it's not empty
        if (jobApplicationLink.trim()) {
          jobData.applicationLink = jobApplicationLink.trim()
        }
        
        await addDoc(jobsRef, jobData)
        
        setSuccess("Job posting created successfully!")
        fetchJobs(company.id)
        setJobDialogOpen(false)
      }
    } catch (err) {
      console.error("Error saving job:", err)
      setError("Failed to save job posting. Please try again.")
    } finally {
      setSavingJob(false)
    }
  }

  const handleDeleteJobConfirm = async () => {
    if (!jobToDelete || !company) return

    try {
      setDeletingJob(true)
      setError("")
      
      const jobRef = doc(db, "jobs", jobToDelete.id)
      await deleteDoc(jobRef)
      
      setSuccess("Job posting deleted successfully!")
      fetchJobs(company.id)
      setDeleteJobDialogOpen(false)
      setJobToDelete(null)
    } catch (err) {
      console.error("Error deleting job:", err)
      setError("Failed to delete job posting")
    } finally {
      setDeletingJob(false)
    }
  }

  const handleDeleteClick = (rep: Representative) => {
    setRepresentativeToDelete(rep)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!representativeToDelete || !company || !isOwner) return

    try {
      setDeleting(true)
      setError("")
      
      // Remove representative from company's representativeIDs array
      await updateDoc(doc(db, "companies", company.id), {
        representativeIDs: arrayRemove(representativeToDelete.uid)
      })
      
      // Remove companyId and companyName from representative's user document
      const representativeUserRef = doc(db, "users", representativeToDelete.uid)
      await updateDoc(representativeUserRef, {
        companyId: null,
        companyName: null,
      })
      
      // Update local state
      setRepresentatives(representatives.filter(rep => rep.uid !== representativeToDelete.uid))
      setCompany({
        ...company,
        representativeIDs: company.representativeIDs.filter(id => id !== representativeToDelete.uid)
      })
      
      setSuccess(`${getRepresentativeName(representativeToDelete)} has been removed from the company`)
      setTimeout(() => setSuccess(""), 3000)
      setDeleteDialogOpen(false)
      setRepresentativeToDelete(null)
    } catch (err) {
      console.error("Error deleting representative:", err)
      setError("Failed to remove representative")
    } finally {
      setDeleting(false)
    }
  }

  const getRepresentativeName = (rep: Representative): string => {
    if (rep.firstName && rep.lastName) {
      return `${rep.firstName} ${rep.lastName}`
    }
    if (rep.firstName) {
      return rep.firstName
    }
    return rep.email
  }

  const handleDeleteCompanyClick = () => {
    setDeleteCompanyDialogOpen(true)
  }

  const handleDeleteCompanyConfirm = async () => {
    if (!company || !userId || !isOwner) return

    try {
      setDeletingCompany(true)
      setError("")
      
      const result = await authUtils.deleteCompany(company.id, userId)
      
      if (result.success) {
        navigate("/companies")
      } else {
        setError(result.error || "Failed to delete company")
      }
    } catch (err) {
      console.error("Error deleting company:", err)
      setError("Failed to delete company")
    } finally {
      setDeletingCompany(false)
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

  const handleRegenerateInviteCode = async () => {
    if (!company || !userId) return

    try {
      setUpdatingInviteCode(true)
      setError("")
      
      const result = await authUtils.updateInviteCode(company.id, userId)
      
      if (result.success && result.inviteCode) {
        setSuccess("Invite code regenerated successfully!")
        fetchCompany() // Refresh company data
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.error || "Failed to regenerate invite code")
      }
    } catch (err) {
      console.error("Error regenerating invite code:", err)
      setError("Failed to regenerate invite code")
    } finally {
      setUpdatingInviteCode(false)
    }
  }

  const handleSaveInviteCode = async () => {
    if (!company || !userId) return

    const trimmedCode = editedInviteCode.trim()
    if (!trimmedCode || trimmedCode.length < 4 || trimmedCode.length > 20) {
      setError("Invite code must be 4-20 characters")
      return
    }

    try {
      setUpdatingInviteCode(true)
      setError("")
      
      const result = await authUtils.updateInviteCode(company.id, userId, trimmedCode)
      
      if (result.success && result.inviteCode) {
        setSuccess("Invite code updated successfully!")
        setEditingInviteCode(false)
        setEditedInviteCode("")
        fetchCompany() // Refresh company data
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.error || "Failed to update invite code")
      }
    } catch (err) {
      console.error("Error updating invite code:", err)
      setError("Failed to update invite code")
    } finally {
      setUpdatingInviteCode(false)
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
              <IconButton onClick={() => navigate(isOwner ? "/companies" : "/dashboard")} sx={{ color: "white" }}>
                <ArrowBackIcon />
              </IconButton>
              <BusinessIcon sx={{ fontSize: 32, color: "white" }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
                {company.companyName}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <ProfileMenu />
            </Box>
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
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Invite Code
                      </Typography>
                      {!editingInviteCode ? (
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <Tooltip title="Regenerate invite code">
                            <IconButton
                              onClick={() => handleRegenerateInviteCode()}
                              size="small"
                              disabled={updatingInviteCode}
                              sx={{ color: "#388560" }}
                            >
                              <RefreshIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit invite code">
                            <IconButton
                              onClick={() => {
                                setEditingInviteCode(true)
                                setEditedInviteCode(company.inviteCode)
                              }}
                              size="small"
                              sx={{ color: "#388560" }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <Tooltip title="Save">
                            <IconButton
                              onClick={() => handleSaveInviteCode()}
                              size="small"
                              disabled={updatingInviteCode}
                              sx={{ color: "#388560" }}
                            >
                              <SaveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cancel">
                            <IconButton
                              onClick={() => {
                                setEditingInviteCode(false)
                                setEditedInviteCode("")
                              }}
                              size="small"
                              sx={{ color: "#666" }}
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {editingInviteCode ? (
                        <TextField
                          fullWidth
                          value={editedInviteCode}
                          onChange={(e) => {
                            setEditedInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                          }}
                          disabled={updatingInviteCode}
                          sx={{
                            "& .MuiOutlinedInput-root": {
                              fontFamily: "monospace",
                              fontWeight: 600,
                            },
                          }}
                          helperText="4-20 characters, letters and numbers only"
                        />
                      ) : (
                        <>
                          <Typography variant="body1" sx={{ fontFamily: "monospace", fontWeight: 600, flex: 1 }}>
                            {company.inviteCode}
                          </Typography>
                          <Tooltip title="Copy invite code">
                            <IconButton onClick={() => copyToClipboard(company.inviteCode)} size="small">
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  </Box>
                )}

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                  <PeopleIcon sx={{ fontSize: 20, color: "#b03a6c" }} />
                  <Typography variant="body2" color="text.secondary">
                    {company.representativeIDs?.length || 0} Representative{company.representativeIDs?.length !== 1 ? "s" : ""}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Representatives List Card */}
          {isOwner && (
            <Grid size={{ xs: 12 }}>
              <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
                    <PeopleIcon sx={{ color: "#b03a6c" }} />
                    Representatives
                  </Typography>

                  {loadingRepresentatives ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : representatives.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No representatives have joined this company yet.
                    </Typography>
                  ) : (
                    <List>
                      {representatives.map((rep) => (
                        <ListItem
                          key={rep.uid}
                          sx={{
                            borderBottom: "1px solid rgba(0,0,0,0.1)",
                            "&:last-child": {
                              borderBottom: "none"
                            }
                          }}
                        >
                          <ListItemText
                            primary={rep.firstName && rep.lastName ? `${rep.firstName} ${rep.lastName}` : rep.email}
                            secondary={rep.firstName && rep.lastName ? rep.email : undefined}
                          />
                          <ListItemSecondaryAction>
                            <Tooltip title="Remove representative">
                              <IconButton
                                edge="end"
                                onClick={() => handleDeleteClick(rep)}
                                sx={{ color: "#d32f2f" }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}

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
                  onClick={() => navigate(`/company/${company.id}/booth`)}
                  sx={{
                    background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                    },
                  }}
                >
                  {company.boothId ? "Edit Booth" : "Create Booth"}
                </Button>

                {company.boothId && (
                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="outlined"
                      onClick={() => navigate(`/booth/${company.boothId}`)}
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

          {/* Job Postings Card */}
          <Grid size={{ xs: 12 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
                    <WorkIcon sx={{ color: "#388560" }} />
                    Job Postings ({jobs.length})
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreateJobClick}
                    sx={{
                      background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                      "&:hover": {
                        background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                      },
                    }}
                  >
                    Create Job Posting
                  </Button>
                </Box>

                {loadingJobs ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : jobs.length === 0 ? (
                  <Box sx={{ textAlign: "center", py: 4 }}>
                    <WorkIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                      No job postings yet. Create your first job posting to attract students!
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleCreateJobClick}
                      sx={{
                        borderColor: "#388560",
                        color: "#388560",
                        "&:hover": {
                          borderColor: "#2d6b4d",
                          bgcolor: "rgba(56, 133, 96, 0.05)",
                        },
                      }}
                    >
                      Create Job Posting
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {jobs.map((job) => (
                      <Card
                        key={job.id}
                        sx={{
                          border: "1px solid rgba(56, 133, 96, 0.2)",
                          borderRadius: 2,
                          transition: "box-shadow 0.2s",
                          "&:hover": {
                            boxShadow: "0 4px 12px rgba(56, 133, 96, 0.15)",
                          },
                        }}
                      >
                        <CardContent sx={{ p: 2.5 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1.5 }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                {job.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}>
                                {job.description}
                              </Typography>
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, color: "#388560" }}>
                                  Required Skills:
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {job.majorsAssociated}
                                </Typography>
                              </Box>
                              {job.applicationLink && (
                                <Chip
                                  icon={<LaunchIcon sx={{ fontSize: 16 }} />}
                                  label="Application Link Available"
                                  size="small"
                                  sx={{
                                    bgcolor: "rgba(56, 133, 96, 0.1)",
                                    color: "#388560",
                                    fontWeight: 500,
                                  }}
                                />
                              )}
                            </Box>
                            <Box sx={{ display: "flex", gap: 1, ml: 2 }}>
                              <Tooltip title="Edit job posting">
                                <IconButton
                                  size="small"
                                  onClick={() => handleEditJobClick(job)}
                                  sx={{ color: "#388560" }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete job posting">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteJobClick(job)}
                                  sx={{ color: "#d32f2f" }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Delete Company Card (Owner only) */}
          {isOwner && (
            <Grid size={{ xs: 12 }}>
              <Card sx={{ border: "2px solid rgba(211, 47, 47, 0.3)" }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "#d32f2f", display: "flex", alignItems: "center", gap: 1 }}>
                    <DeleteIcon />
                    Danger Zone
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Permanently delete this company. This action cannot be undone and will remove all company data, unlink representatives, and delete the associated booth.
                  </Typography>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDeleteCompanyClick}
                    sx={{
                      "&:hover": {
                        bgcolor: "#c62828",
                      },
                    }}
                  >
                    Delete Company
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      </Container>

      {/* Delete Representative Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Remove Representative</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove {representativeToDelete ? getRepresentativeName(representativeToDelete) : "this representative"} from {company?.companyName}?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            They will no longer have access to manage this company.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deleting ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Company Confirmation Dialog */}
      <Dialog 
        open={deleteCompanyDialogOpen} 
        onClose={() => !deletingCompany && setDeleteCompanyDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Company</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone. This will permanently delete the company and all associated data.
          </Alert>
          <Typography variant="body1">
            Are you sure you want to delete <strong>{company?.companyName}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will:
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>Remove the company permanently</li>
              <li>Unlink all representatives from this company</li>
              <li>Delete the associated booth (if any)</li>
            </ul>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setDeleteCompanyDialogOpen(false)
            }}
            disabled={deletingCompany}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteCompanyConfirm}
            variant="contained"
            color="error"
            disabled={deletingCompany}
            startIcon={deletingCompany ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deletingCompany ? "Deleting..." : "Delete Company"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Job Posting Dialog */}
      <Dialog
        open={jobDialogOpen}
        onClose={() => {
          if (!savingJob) {
            setJobDialogOpen(false)
            setEditingJob(null)
            setJobTitle("")
            setJobDescription("")
            setJobSkills("")
            setJobApplicationLink("")
            setJobErrors({})
          }
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingJob ? "Edit Job Posting" : "Create Job Posting"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Fill in the details for your job posting. Title, description, and skills are required.
          </Typography>
          
          {(jobErrors.title || jobErrors.description || jobErrors.skills) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {jobErrors.title || jobErrors.description || jobErrors.skills}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Job Title *"
            value={jobTitle}
            onChange={(e) => {
              setJobTitle(e.target.value)
              if (jobErrors.title) {
                setJobErrors({ ...jobErrors, title: undefined })
              }
            }}
            placeholder="e.g., Software Engineer Intern"
            error={!!jobErrors.title}
            helperText={jobErrors.title}
            disabled={savingJob}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            multiline
            rows={4}
            label="Description *"
            value={jobDescription}
            onChange={(e) => {
              setJobDescription(e.target.value)
              if (jobErrors.description) {
                setJobErrors({ ...jobErrors, description: undefined })
              }
            }}
            placeholder="Describe the role, responsibilities, and requirements..."
            error={!!jobErrors.description}
            helperText={jobErrors.description}
            disabled={savingJob}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Required Skills *"
            value={jobSkills}
            onChange={(e) => {
              setJobSkills(e.target.value)
              if (jobErrors.skills) {
                setJobErrors({ ...jobErrors, skills: undefined })
              }
            }}
            placeholder="e.g., JavaScript, React, Python, Communication"
            error={!!jobErrors.skills}
            helperText={jobErrors.skills || "List the skills or qualifications required"}
            disabled={savingJob}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Application URL (Optional)"
            value={jobApplicationLink}
            onChange={(e) => {
              setJobApplicationLink(e.target.value)
              if (jobErrors.applicationLink) {
                setJobErrors({ ...jobErrors, applicationLink: undefined })
              }
            }}
            placeholder="https://company.com/apply"
            error={!!jobErrors.applicationLink}
            helperText={jobErrors.applicationLink || "External link where students can apply directly"}
            disabled={savingJob}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setJobDialogOpen(false)
              setEditingJob(null)
              setJobTitle("")
              setJobDescription("")
              setJobSkills("")
              setJobApplicationLink("")
              setJobErrors({})
            }}
            disabled={savingJob}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveJob}
            variant="contained"
            disabled={savingJob}
            sx={{
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            {savingJob ? "Saving..." : editingJob ? "Update Job" : "Publish Job"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Job Confirmation Dialog */}
      <Dialog
        open={deleteJobDialogOpen}
        onClose={() => !deletingJob && setDeleteJobDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Job Posting</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the job posting <strong>"{jobToDelete?.name}"</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action cannot be undone. Students will no longer be able to see this job posting.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteJobDialogOpen(false)} disabled={deletingJob}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteJobConfirm}
            variant="contained"
            color="error"
            disabled={deletingJob}
            startIcon={deletingJob ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deletingJob ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

