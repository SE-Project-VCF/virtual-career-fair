import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  TextField,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ProfileMenu from "./ProfileMenu";
import { authUtils } from "../utils/auth";
import { API_URL } from "../config";
import { formatPlainTextResume } from "../utils/resumeFormatter";

interface Change {
  type: "edit" | "add" | "remove";
  section: string;
  original: string | null;
  replacement: string | null;
  reason: string;
}

export default function TailorResumeSimplePage() {
  const navigate = useNavigate();
  const { invitationId } = useParams<{ invitationId: string }>();
  const user = useMemo(() => authUtils.getCurrentUser(), []);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [originalText, setOriginalText] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [approvedChangeIds, setApprovedChangeIds] = useState<Set<number>>(new Set());
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [studentNotes, setStudentNotes] = useState("");
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  // Load invitation details and original resume
  useEffect(() => {
    if (!invitationId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        const token = await authUtils.getIdToken();
        if (!token) throw new Error("Not authenticated");

        // Get invitation details
        const invRes = await fetch(`${API_URL}/api/job-invitations/${invitationId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!invRes.ok) {
          throw new Error("Failed to load invitation");
        }

        const invData = await invRes.json();
        setJobTitle(invData.data.job?.name || "Unknown Job");
        setJobDescription(invData.data.job?.description || "");
      } catch (err: any) {
        console.error("Error loading invitation:", err);
        setError(err.message || "Failed to load invitation");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [invitationId]);

  // Generate changes
  const handleGenerateChanges = async () => {
    try {
      setGenerating(true);
      setError("");
      setChanges([]);
      setApprovedChangeIds(new Set());

      const token = await authUtils.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const response = await fetch(`${API_URL}/api/resume/tailor/simple`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobDescription: jobDescription,
          jobTitle: jobTitle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate changes");
      }

      const data = await response.json();
      console.log("[GENERATE CHANGES] Backend response:", data);
      console.log("[GENERATE CHANGES] Changes array:", data.changes);
      
      if (!data.changes || !Array.isArray(data.changes)) {
        throw new Error("Backend response missing changes array. Got: " + JSON.stringify(data));
      }
      
      setOriginalText(data.originalText);
      setChanges(data.changes || []);
      // Auto-approve all changes by default
      setApprovedChangeIds(new Set(Array.from({ length: data.changes?.length || 0 }, (_, i) => i)));
    } catch (err: any) {
      console.error("Error generating changes:", err);
      setError(err.message || "Failed to generate changes");
    } finally {
      setGenerating(false);
    }
  };

  const toggleApproval = (index: number) => {
    const newApproved = new Set(approvedChangeIds);
    if (newApproved.has(index)) {
      newApproved.delete(index);
    } else {
      newApproved.add(index);
    }
    setApprovedChangeIds(newApproved);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");

      const token = await authUtils.getIdToken();
      if (!token) throw new Error("Not authenticated");

      // Get only approved changes
      const approvedChanges = changes.filter((_, idx) => approvedChangeIds.has(idx));

      if (approvedChanges.length === 0) {
        setError("Please approve at least one change or use the original resume");
        setSaving(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/resume/tailored/simple/save`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invitationId: invitationId,
          originalText: originalText,
          approvedChanges: approvedChanges,
          studentNotes: studentNotes,
          jobTitle: jobTitle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save tailored resume");
      }

      const data = await response.json();
      setSuccess(data.message || "Tailored resume saved successfully!");
      setConfirmSaveOpen(false);

      // Redirect after success to the new tailored resume
      setTimeout(() => {
        navigate(`/dashboard/tailored-resume/${data.tailoredResumeId}`);
      }, 1500);
    } catch (err: any) {
      console.error("Error saving:", err);
      setError(err.message || "Failed to save tailored resume");
    } finally {
      setSaving(false);
    }
  };

  const renderChangeItem = (change: Change, index: number) => {
    const isApproved = approvedChangeIds.has(index);
    const bgColor = isApproved ? "#e8f5e9" : "#fff3e0";
    const borderColor = isApproved ? "#4caf50" : "#ff9800";

    return (
      <Paper
        key={index}
        sx={{
          p: 2,
          mb: 2,
          backgroundColor: bgColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 1,
        }}
      >
        {/* Header with section and type */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Chip
              label={change.section}
              size="small"
              variant="outlined"
              sx={{ fontWeight: "bold" }}
            />
            <Chip
              label={change.type.toUpperCase()}
              size="small"
              color={({ edit: "info", add: "success", remove: "warning" } as const)[change.type]}
            />
          </Box>
          <Button
            size="small"
            variant={isApproved ? "contained" : "outlined"}
            color={isApproved ? "success" : "warning"}
            startIcon={isApproved ? <CheckIcon /> : <CloseIcon />}
            onClick={() => toggleApproval(index)}
          >
            {isApproved ? "Approved" : "Reject"}
          </Button>
        </Box>

        {/* Reason */}
        <Typography variant="body2" sx={{ mb: 2, color: "#555", fontStyle: "italic" }}>
          💡 {change.reason}
        </Typography>

        {/* Original and Replacement */}
        <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
          {change.original && (
            <Paper
              sx={{
                p: 2,
                backgroundColor: "#ffebee",
                flex: 1,
                border: "1px solid #ef5350",
              }}
            >
              <Typography variant="caption" sx={{ color: "#c62828", fontWeight: "bold", display: "block", mb: 1 }}>
                ❌ ORIGINAL
              </Typography>
              <Typography
                variant="body2"
                component="pre"
                sx={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  color: "#333",
                }}
              >
                {change.original}
              </Typography>
            </Paper>
          )}

          {change.replacement && (
            <Paper
              sx={{
                p: 2,
                backgroundColor: "#e8f5e9",
                flex: 1,
                border: "1px solid #66bb6a",
              }}
            >
              <Typography variant="caption" sx={{ color: "#2e7d32", fontWeight: "bold", display: "block", mb: 1 }}>
                ✅ REPLACEMENT
              </Typography>
              <Typography
                variant="body2"
                component="pre"
                sx={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  color: "#333",
                }}
              >
                {change.replacement}
              </Typography>
            </Paper>
          )}
        </Box>
      </Paper>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading invitation...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <ProfileMenu />

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/dashboard/job-invitations")}
          variant="outlined"
        >
          Back
        </Button>
        <Typography variant="h4" sx={{ fontWeight: "bold" }}>
          Tailor Resume for {jobTitle}
        </Typography>
      </Box>

      {/* Alerts */}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      {changes.length === 0 ? (
        // Step 1: Generate Changes
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
              Step 1: Generate Changes
            </Typography>
            <Typography variant="body2" sx={{ mb: 3, color: "#666" }}>
              Click below to analyze your resume and get a list of suggested changes for this job.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={handleGenerateChanges}
              disabled={generating}
              fullWidth
            >
              {generating ? <CircularProgress size={24} sx={{ mr: 1 }} /> : "Generate Changes"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Step 2: Review Changes
        <Box>
          {/* Original Resume */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
                📄 Original Resume
              </Typography>
              <Paper
                sx={{
                  p: 3,
                  backgroundColor: "#fafafa",
                  maxHeight: "400px",
                  overflow: "auto",
                  border: "1px solid #ddd",
                }}
              >
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                    fontFamily: "monospace",
                    fontSize: "0.9rem",
                    lineHeight: "1.6",
                  }}
                >
                  {formatPlainTextResume(originalText)}
                </Typography>
              </Paper>
            </CardContent>
          </Card>

          {/* Changes Summary */}
          <Card sx={{ mb: 3, backgroundColor: "#e3f2fd", border: "2px solid #2196f3" }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
                📋 Changes Summary
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Total suggested changes: <strong>{changes.length}</strong> | Approved: <strong>{approvedChangeIds.size}</strong> | Rejected: <strong>{changes.length - approvedChangeIds.size}</strong>
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip label={`Edits: ${changes.filter(c => c.type === "edit").length}`} />
                <Chip label={`Additions: ${changes.filter(c => c.type === "add").length}`} color="success" />
                <Chip label={`Removals: ${changes.filter(c => c.type === "remove").length}`} color="warning" />
              </Box>
            </CardContent>
          </Card>

          {/* Changes List */}
          <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
            ✅ Review Individual Changes
          </Typography>
          {changes.map((change, idx) => renderChangeItem(change, idx))}

          {/* Notes and Save Section */}
          <Card sx={{ mt: 4 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
                📝 Additional Notes
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Optional Notes"
                placeholder="Add notes about your tailoring choices..."
                value={studentNotes}
                onChange={(e) => setStudentNotes(e.target.value)}
                sx={{ mb: 3 }}
              />

              <Box sx={{ display: "flex", gap: 2 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<SaveIcon />}
                  onClick={() => setConfirmSaveOpen(true)}
                  disabled={saving || approvedChangeIds.size === 0}
                  size="large"
                >
                  Save Tailored Resume
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleGenerateChanges}
                  disabled={generating}
                >
                  Regenerate Changes
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmSaveOpen} onClose={() => setConfirmSaveOpen(false)}>
        <DialogTitle>Confirm Save</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            You are about to save your tailored resume with <strong>{approvedChangeIds.size} approved changes</strong>.
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Are you sure you want to proceed?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSaveOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <CircularProgress size={24} /> : "Confirm Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
