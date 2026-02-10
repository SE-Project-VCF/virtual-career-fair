import { useState, useEffect, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { 
  Container, 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent,
  TextField,
  Alert,
  Grid,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from "@mui/material"
import { authUtils } from "../utils/auth"
import { collection, query, where, getDocs } from "firebase/firestore"
import { db } from "../firebase"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import BusinessIcon from "@mui/icons-material/Business"
import AddIcon from "@mui/icons-material/Add"
import PeopleIcon from "@mui/icons-material/People"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ProfileMenu from "./ProfileMenu"
import DeleteIcon from "@mui/icons-material/Delete"
import EditIcon from "@mui/icons-material/Edit"
import RefreshIcon from "@mui/icons-material/Refresh"
import SaveIcon from "@mui/icons-material/Save"
import CancelIcon from "@mui/icons-material/Cancel"

interface Company {
  id: string
  companyName: string
  inviteCode: string
  representativeIDs: string[]
  boothId?: string
  ownerId: string
}

export default function CompanyManagement() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState("")
  const [creating, setCreating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editingInviteCode, setEditingInviteCode] = useState<string | null>(null)
  const [editedInviteCode, setEditedInviteCode] = useState("")
  const [updatingInviteCode, setUpdatingInviteCode] = useState(false)

  // Memoize user ID and role to prevent unnecessary re-renders
  const userId = useMemo(() => user?.uid, [user?.uid])
  const userRole = useMemo(() => user?.role, [user?.role])

  // Memoize fetchCompanies to prevent infinite loops
  const fetchCompanies = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError("")
      
      // Query companies where ownerId matches current user
      const q = query(
        collection(db, "companies"),
        where("ownerId", "==", userId)
      )
      const querySnapshot = await getDocs(q)
      
      const companiesList: Company[] = []
      querySnapshot.forEach((doc) => {
        companiesList.push({
          id: doc.id,
          ...doc.data()
        } as Company)
      })
      
      setCompanies(companiesList)
    } catch (err) {
      console.error("Error fetching companies:", err)
      setError("Failed to load companies")
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!authUtils.isAuthenticated()) {
      navigate("/login")
      return
    }

    if (userRole !== "companyOwner") {
      navigate("/dashboard")
      return
    }

    // Only fetch if we have a user ID
    if (userId) {
      fetchCompanies()
    }
  }, [navigate, userId, userRole, fetchCompanies])

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      setError("Company name is required")
      return
    }

    try {
      setCreating(true)
      setError("")
      
      const result = await authUtils.createCompany(newCompanyName.trim(), userId ?? "")
      
      if (result.success) {
        setSuccess(`Company "${newCompanyName}" created successfully!`)
        setNewCompanyName("")
        setCreateDialogOpen(false)
        fetchCompanies() // Refresh the list
      } else {
        setError(result.error || "Failed to create company")
      }
    } catch (err) {
      console.error("Error creating company:", err)
      setError("Failed to create company")
    } finally {
      setCreating(false)
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

  const handleDeleteClick = (company: Company) => {
    setCompanyToDelete(company)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!companyToDelete || !userId) return

    try {
      setDeleting(true)
      setError("")
      
      const result = await authUtils.deleteCompany(companyToDelete.id, userId)
      
      if (result.success) {
        setSuccess(`Company "${companyToDelete.companyName}" has been deleted successfully.`)
        setDeleteDialogOpen(false)
        setCompanyToDelete(null)
        fetchCompanies() // Refresh the list
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.error || "Failed to delete company")
      }
    } catch (err) {
      console.error("Error deleting company:", err)
      setError("Failed to delete company")
    } finally {
      setDeleting(false)
    }
  }

  const handleRegenerateInviteCode = async (companyId: string) => {
    if (!userId) return

    try {
      setUpdatingInviteCode(true)
      setError("")
      
      const result = await authUtils.updateInviteCode(companyId, userId)
      
      if (result.success && result.inviteCode) {
        setSuccess("Invite code regenerated successfully!")
        fetchCompanies() // Refresh the list
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

  const handleSaveInviteCode = async (companyId: string) => {
    if (!userId) return

    const trimmedCode = editedInviteCode.trim()
    if (!trimmedCode || trimmedCode.length < 4 || trimmedCode.length > 20) {
      setError("Invite code must be 4-20 characters")
      return
    }

    try {
      setUpdatingInviteCode(true)
      setError("")
      
      const result = await authUtils.updateInviteCode(companyId, userId, trimmedCode)
      
      if (result.success && result.inviteCode) {
        setSuccess("Invite code updated successfully!")
        setEditingInviteCode(null)
        setEditedInviteCode("")
        fetchCompanies() // Refresh the list
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <IconButton onClick={() => navigate("/dashboard")} sx={{ color: "white" }}>
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
                Company Management
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{
              bgcolor: "white",
              color: "#388560",
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.9)",
              },
            }}
          >
            Create Company
          </Button>
        </Box>
      </Container>

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

        {companies.length === 0 ? (
          <Card sx={{ textAlign: "center", p: 6 }}>
            <BusinessIcon sx={{ fontSize: 80, color: "#ccc", mb: 2 }} />
            <Typography variant="h5" sx={{ mb: 2, color: "text.secondary" }}>
              No Companies Yet
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              Create your first company to get started with invite codes and team management.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{
                background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                },
              }}
            >
              Create Your First Company
            </Button>
          </Card>
        ) : (
          <Grid container spacing={3}>
            {companies.map((company) => (
              <Grid size={{ xs: 12, md: 6 }} key={company.id}>
                <Card
                  sx={{
                    height: "100%",
                    border: "1px solid rgba(56, 133, 96, 0.3)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
                    },
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                      <BusinessIcon sx={{ fontSize: 40, color: "#388560", mr: 2 }} />
                      <Typography variant="h5" sx={{ fontWeight: 600, flex: 1 }}>
                        {company.companyName}
                      </Typography>
                    </Box>

                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Invite Code
                        </Typography>
                        {editingInviteCode !== company.id ? (
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <Tooltip title="Regenerate invite code">
                              <IconButton
                                onClick={() => handleRegenerateInviteCode(company.id)}
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
                                  setEditingInviteCode(company.id)
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
                                onClick={() => handleSaveInviteCode(company.id)}
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
                                  setEditingInviteCode(null)
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
                        <TextField
                          fullWidth
                          value={editingInviteCode === company.id ? editedInviteCode : company.inviteCode}
                          onChange={(e) => {
                            if (editingInviteCode === company.id) {
                              setEditedInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                            }
                          }}
                          InputProps={{
                            readOnly: editingInviteCode !== company.id,
                          }}
                          disabled={updatingInviteCode}
                          sx={{
                            "& .MuiOutlinedInput-root": {
                              bgcolor: editingInviteCode === company.id ? "white" : "#f5f5f5",
                              fontFamily: "monospace",
                              fontWeight: 600,
                            },
                          }}
                          helperText={editingInviteCode === company.id ? "4-20 characters, letters and numbers only" : ""}
                        />
                        {editingInviteCode !== company.id && (
                          <Tooltip title="Copy invite code">
                            <IconButton
                              onClick={() => copyToClipboard(company.inviteCode)}
                              sx={{ color: "#388560" }}
                            >
                              <ContentCopyIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                      <PeopleIcon sx={{ fontSize: 20, color: "#b03a6c" }} />
                      <Typography variant="body2" color="text.secondary">
                        {company.representativeIDs?.length || 0} Representative{company.representativeIDs?.length !== 1 ? "s" : ""}
                      </Typography>
                    </Box>

                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => navigate(`/company/${company.id}`)}
                        sx={{
                          borderColor: "#388560",
                          color: "#388560",
                          "&:hover": {
                            borderColor: "#2d6b4d",
                            bgcolor: "rgba(56, 133, 96, 0.05)",
                          },
                        }}
                      >
                        Manage Company
                      </Button>
                      <Tooltip title="Delete Company">
                        <IconButton
                          onClick={() => handleDeleteClick(company)}
                          sx={{
                            color: "#d32f2f",
                            "&:hover": {
                              bgcolor: "rgba(211, 47, 47, 0.1)",
                            },
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      {/* Delete Company Confirmation Dialog */}
      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Company</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. This will permanently delete the company and all associated data.
          </Alert>
          <Typography variant="body1">
            Are you sure you want to delete <strong>{companyToDelete?.companyName}</strong>?
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
              setDeleteDialogOpen(false)
              setCompanyToDelete(null)
            }}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deleting ? "Deleting..." : "Delete Company"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Company Dialog */}
      <Dialog open={createDialogOpen} onClose={() => !creating && setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Company</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Company Name"
            fullWidth
            variant="outlined"
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            disabled={creating}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateCompany}
            variant="contained"
            disabled={creating || !newCompanyName.trim()}
            sx={{
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            {creating ? <CircularProgress size={24} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

