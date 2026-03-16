import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Stack,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ProfileMenu from "./ProfileMenu";
import { authUtils } from "../utils/auth";
import { API_URL } from "../config";
import { formatResumeAsText } from "../utils/resumeFormatter";

interface TailoredResumeDoc {
  id: string;
  jobContext: {
    jobTitle: string;
    jobDescription: string;
    requiredSkills?: string;
    jobId?: string;
  };
  structured: any;
  studentNotes: string;
  createdAt: any;
  status: string;
  expiresAt: any;
  acceptedPatches: any[];
}

export default function TailoredResumesPage() {
  const navigate = useNavigate();
  const user = useMemo(() => authUtils.getCurrentUser(), []);

  const [loading, setLoading] = useState(true);
  const [resumes, setResumes] = useState<TailoredResumeDoc[]>([]);
  const [error, setError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      loadResumes();
    } else {
      navigate("/login");
    }
  }, [user, navigate]);

  const loadResumes = async () => {
    try {
      setLoading(true);
      const token = await authUtils.getIdToken();
      if (!token) throw new Error("Not authenticated");

      // Fetch from Firestore via backend endpoint
      const response = await fetch(`${API_URL}/api/resume/tailored`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch tailored resumes");
      }

      if (!response.ok) {
        throw new Error("Failed to load tailored resumes");
      }

      const data = await response.json();
      setResumes(data.resumes || []);
    } catch (err: any) {
      console.error("Error loading resumes:", err);
      setError(err.message || "Failed to load tailored resumes");
      setResumes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;

    try {
      setIsDeleting(true);
      const token = await authUtils.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const response = await fetch(`${API_URL}/api/resume/tailored/${deleteTargetId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete resume");
      }

      setResumes(resumes.filter((r) => r.id !== deleteTargetId));
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    } catch (err: any) {
      console.error("Error deleting resume:", err);
      setError(err.message || "Failed to delete resume");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = (resume: TailoredResumeDoc) => {
    const text = formatResumeAsText(resume.structured);
    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${resume.jobContext.jobTitle.replaceAll(/\s+/g, "-")}-${new Date(resume.createdAt?.toMillis?.()).toLocaleDateString().replaceAll("/", "-")}.txt`;
    document.body.appendChild(element);
    element.click();
    element.remove();
  };

  if (!user) return null;

  let content;
  if (loading) {
    content = (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  } else if (resumes.length === 0) {
    content = (
      <Paper sx={{ p: 4, textAlign: "center", bgcolor: "#f9f9f9" }}>
        <Typography variant="body1" sx={{ color: "gray", mb: 2 }}>
          You haven't created any tailored resumes yet.
        </Typography>
        <Typography variant="body2" sx={{ color: "gray", mb: 3 }}>
          Go to your job invitations and tailor your resume to a job to get started.
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate("/dashboard/job-invitations")}
        >
          View Job Invitations
        </Button>
      </Paper>
    );
  } else {
    content = (
      <Stack spacing={2}>
        {resumes.map((resume) => (
          <Card
            key={resume.id}
              sx={{
                transition: "0.2s",
                "&:hover": { boxShadow: 3 },
              }}
            >
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                  <Box flex={1}>
                    <Typography variant="h6" sx={{ fontWeight: "bold", mb: 0.5 }}>
                      {resume.jobContext.jobTitle}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "gray", mb: 1 }}>
                      Created: {new Date(resume.createdAt?.toMillis?.()).toLocaleDateString()}
                    </Typography>

                    {/* Stats */}
                    <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                      <Chip
                        label={`${resume.acceptedPatches?.length || 0} Patches Applied`}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                      {resume.expiresAt && (
                        <Chip
                          label={`Expires: ${new Date(resume.expiresAt?.toMillis?.()).toLocaleDateString()}`}
                          size="small"
                          color={
                            new Date(resume.expiresAt?.toMillis?.()) > new Date() ? "success" : "error"
                          }
                        />
                      )}
                    </Box>

                    {/* Notes Preview */}
                    {resume.studentNotes && (
                      <Box
                        sx={{
                          bgcolor: "#f5f5f5",
                          p: 1.5,
                          borderRadius: 1,
                          borderLeft: "3px solid #2196f3",
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: "bold", display: "block", mb: 0.5 }}>
                          Your Notes:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: "gray",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {resume.studentNotes}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: "flex", gap: 1, ml: 2 }}>
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/dashboard/tailored-resume/${resume.id}`)}
                      title="View Resume"
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDownload(resume)}
                      title="Download Resume"
                    >
                      <FileDownloadIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        setDeleteTargetId(resume.id);
                        setDeleteConfirmOpen(true);
                      }}
                      title="Delete Resume"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                {/* Job Description Preview */}
                <Typography
                  variant="body2"
                  sx={{
                    color: "gray",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {resume.jobContext.jobDescription.substring(0, 200)}...
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", pb: 4 }}>
      <ProfileMenu />

      <Container maxWidth="lg" sx={{ pt: 4 }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/dashboard/job-invitations")}
            variant="text"
          >
            Back
          </Button>
          <Typography variant="h4" sx={{ fontWeight: "bold" }}>
            Tailored Resumes
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {content}
      </Container>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Tailored Resume?</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{ mt: 1 }}
          >
            This action cannot be undone. Are you sure you want to delete this tailored resume?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
