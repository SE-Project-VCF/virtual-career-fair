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
import { doc, getDoc, arrayRemove, updateDoc } from "firebase/firestore"
import { db } from "../firebase"
import BusinessIcon from "@mui/icons-material/Business"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import PeopleIcon from "@mui/icons-material/People"
import EditIcon from "@mui/icons-material/Edit"
import DeleteIcon from "@mui/icons-material/Delete"
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
    </Box>
  )
}

