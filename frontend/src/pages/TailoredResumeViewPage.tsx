import { useState, useEffect, useId, useMemo } from "react";
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
  Chip,
  Paper,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import ProfileMenu from "./ProfileMenu";
import { authUtils } from "../utils/auth";
import { API_URL } from "../config";
import { formatResumeAsText, formatPlainTextResume, countChanges, type StructuredResume } from "../utils/resumeFormatter";

export default function TailoredResumeViewPage() {
  const navigate = useNavigate();
  const { tailoredResumeId } = useParams<{ tailoredResumeId: string }>();
  const user = useMemo(() => authUtils.getCurrentUser(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tailoredResume, setTailoredResume] = useState<any>(null);
  const [originalResume, setOriginalResume] = useState<StructuredResume | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedResume, setEditedResume] = useState<StructuredResume | null>(null);
  const [editedText, setEditedText] = useState(""); // For plain text editing
  const [studentNotes, setStudentNotes] = useState("");
  const [isSaving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  // Load resume function
  const loadResume = async () => {
    try {
      const token = await authUtils.getIdToken();
      if (!token) throw new Error("Not authenticated");

      // Fetch tailored resume
      const response = await fetch(`${API_URL}/api/resume/tailored/${tailoredResumeId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load tailored resume");
      }

      const data = await response.json();
      console.log("[TAILORED VIEW] Loaded resume data:", data);
      
      setTailoredResume(data.data);
      
      // Handle both old structured format and new plain text format
      if (data.data.tailoredText) {
        // New plain text format - no need to set structured
        setOriginalResume(null);
        setEditedResume(null);
      } else if (data.data.structured) {
        // Old structured format
        setOriginalResume(data.data.structured);
        setEditedResume(structuredClone(data.data.structured)); // deep copy for editing
      }
      
      setStudentNotes(data.data.studentNotes || "");
    } catch (err: any) {
      console.error("Error loading resume:", err);
      setError(err.message || "Failed to load resume");
    } finally {
      setLoading(false);
    }
  };

  // Load tailored resume and original for comparison
  useEffect(() => {
    if (!tailoredResumeId) return;

    loadResume();
  }, [tailoredResumeId]);

  const changes = useMemo(() => {
    if (!originalResume || !tailoredResume?.structured) return null;
    return countChanges(originalResume, tailoredResume.structured);
  }, [originalResume, tailoredResume]);

  const formattedText = useMemo(() => {
    if (!tailoredResume?.structured) return "";
    return formatResumeAsText(tailoredResume.structured);
  }, [tailoredResume]);

  const handleDownload = () => {
    const textToDownload = tailoredResume.tailoredText || formattedText;
    const element = document.createElement("a");
    const file = new Blob([textToDownload], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `tailored-resume-${tailoredResume.jobContext.jobTitle.replaceAll(/\s+/g, "-")}.txt`;
    document.body.appendChild(element);
    element.click();
    element.remove();
  };

  const handleSaveEdits = async () => {
    // Check which format we're editing
    const isPlainText = tailoredResume?.tailoredText && editedText;
    const isStructured = tailoredResume?.structured && editedResume;

    if (!isPlainText && !isStructured) return;

    try {
      setSaving(true);
      setError("");

      const token = await authUtils.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const updatePayload: any = {
        studentNotes,
      };

      // Add the appropriate format to the payload
      if (isPlainText) {
        updatePayload.tailoredText = editedText;
      } else if (isStructured) {
        updatePayload.structured = editedResume;
      }

      const response = await fetch(`${API_URL}/api/resume/tailored/${tailoredResumeId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        throw new Error("Failed to save edits");
      }

      setSaveSuccess("Resume updated successfully!");
      
      // Update the local state with the new values
      const updatedResume = { ...tailoredResume, studentNotes };
      if (isPlainText) {
        updatedResume.tailoredText = editedText;
      } else if (isStructured) {
        updatedResume.structured = editedResume;
      }
      
      setTailoredResume(updatedResume);
      setIsEditing(false);

      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error saving edits:", err);
      setError(err.message || "Failed to save edits");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <Container>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Box sx={{ py: 4 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/dashboard/tailored-resumes")}
            sx={{ mb: 2 }}
          >
            Back to Resumes
          </Button>
          <Alert severity="error">{error}</Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", pb: 4 }}>
      <ProfileMenu />

      <Container maxWidth="lg" sx={{ pt: 4 }}>
        {/* Header */}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/dashboard/tailored-resumes")}
          sx={{ mb: 2 }}
        >
          Back to Resumes
        </Button>

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 3 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: "bold", mb: 1 }}>
              {tailoredResume.jobContext?.jobTitle}
            </Typography>
            <Typography variant="body2" sx={{ color: "gray" }}>
              {new Date(tailoredResume.createdAt?.toMillis?.()).toLocaleDateString()}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            {!isEditing && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<FileDownloadIcon />}
                  onClick={handleDownload}
                >
                  Download
                </Button>
                <Button
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    setIsEditing(true);
                    // Initialize editing state based on format
                    if (tailoredResume.tailoredText) {
                      // Initialize with formatted text for better readability during editing
                      setEditedText(formatPlainTextResume(tailoredResume.tailoredText));
                    } else if (tailoredResume.structured) {
                      setEditedResume(structuredClone(tailoredResume.structured));
                    }
                  }}
                >
                  Edit
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setEditedResume(null);
                    setEditedText("");
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveEdits}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </>
            )}
          </Box>
        </Box>

        {/* Summary Stats */}
        {tailoredResume.method === "change-approval" && (
          <Paper sx={{ p: 2, mb: 3, bgcolor: "#c8e6c9", border: "2px solid #4caf50" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1, color: "#2e7d32" }}>
              ✅ Tailored with {tailoredResume.changesCount || 0} Approved Changes
            </Typography>
            <Typography variant="body2" color="textSecondary">
              This resume was tailored by approving individual suggestions from AI analysis.
            </Typography>
          </Paper>
        )}
        {changes && (
          <Paper sx={{ p: 2, mb: 3, bgcolor: "#e3f2fd" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
              Changes Applied
            </Typography>
            <Box sx={{ display: "flex", gap: 2 }}>
              {changes.edits > 0 && <Chip label={`${changes.edits} Edits`} size="small" color="primary" />}
              {changes.removals > 0 && (
                <Chip label={`${changes.removals} Removals`} size="small" variant="outlined" color="error" />
              )}
              {changes.insertions > 0 && (
                <Chip label={`${changes.insertions} Additions`} size="small" variant="outlined" color="success" />
              )}
            </Box>
          </Paper>
        )}

        {saveSuccess && <Alert severity="success">{saveSuccess}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}

        {/* Notes Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
              Your Notes
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              value={studentNotes}
              onChange={(e) => setStudentNotes(e.target.value)}
              placeholder="Add any notes about this tailored resume..."
              disabled={!isEditing}
              sx={{
                bgcolor: isEditing ? "white" : "#f9f9f9",
              }}
            />
          </CardContent>
        </Card>

        {/* Resume Content */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
              Resume
            </Typography>

            {(() => {
              if (tailoredResume.tailoredText && isEditing) {
                return (
                  <TextField
                    fullWidth
                    multiline
                    rows={20}
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    placeholder="Edit your resume text here..."
                    sx={{
                      fontFamily: "monospace",
                      fontSize: "0.9rem",
                      "& .MuiInputBase-input": {
                        fontFamily: "monospace",
                        fontSize: "0.9rem",
                        whiteSpace: "pre",
                      },
                    }}
                  />
                );
              }
              if (tailoredResume.tailoredText) {
                return (
                  <pre
                    style={{
                      backgroundColor: "#fafafa",
                      border: "1px solid #ddd",
                      padding: "12px",
                      borderRadius: "4px",
                      overflow: "auto",
                      fontFamily: "monospace",
                      fontSize: "0.9rem",
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                      wordWrap: "break-word",
                    }}
                  >
                    {formatPlainTextResume(tailoredResume.tailoredText)}
                  </pre>
                );
              }
              if (isEditing && editedResume) {
                return (
                  <Box>
                    <Typography variant="body2" sx={{ color: "gray", mb: 2 }}>
                      📝 Edit mode - Click into fields to customize your resume
                    </Typography>
                    <ResumeEditor resume={editedResume} onUpdate={setEditedResume} />
                  </Box>
                );
              }
              return (
                <Box
                  sx={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                  }}
                >
                  {formattedText}
                </Box>
              );
            })()}
          </CardContent>
        </Card>

        {/* Job Context */}
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
              Job Context
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Title:</strong> {tailoredResume.jobContext?.jobTitle}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Description:</strong> {tailoredResume.jobContext?.jobDescription.substring(0, 200)}...
            </Typography>
            {tailoredResume.jobContext?.requiredSkills && (
              <Typography variant="body2">
                <strong>Required Skills:</strong> {tailoredResume.jobContext.requiredSkills}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

/**
 * Simple inline resume editor component
 */
function ResumeEditor({ resume, onUpdate }: Readonly<{ resume: StructuredResume; onUpdate: (r: StructuredResume) => void }>) {
  const id = useId();
  const handleSummaryChange = (text: string) => {
    const updated = structuredClone(resume);
    if (updated.summary) updated.summary.text = text;
    onUpdate(updated);
  };

  const handleBulletChange = (section: "experience" | "projects", parentIdx: number, bulletIdx: number, text: string) => {
    const updated = structuredClone(resume);
    if (section === "experience" && updated.experience) {
      updated.experience[parentIdx].bullets[bulletIdx].text = text;
    } else if (updated.projects) {
      updated.projects[parentIdx].bullets[bulletIdx].text = text;
    }
    onUpdate(updated);
  };

  const handleSkillChange = (index: number, text: string) => {
    const updated = structuredClone(resume);
    if (updated.skills) updated.skills.items[index] = text;
    onUpdate(updated);
  };

  return (
    <Box>
      {/* Summary */}
      {resume.summary?.text && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
            Professional Summary
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            value={resume.summary.text}
            onChange={(e) => handleSummaryChange(e.target.value)}
            size="small"
          />
        </Box>
      )}

      {/* Skills */}
      {resume.skills?.items && resume.skills.items.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
            Technical Skills
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {resume.skills.items.map((skill: string, idx: number) => (
              <TextField
                key={`${id}-skill-${idx}`}
                size="small"
                value={skill}
                onChange={(e) => handleSkillChange(idx, e.target.value)}
                sx={{ flex: "0 0 auto", maxWidth: "200px" }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Experience */}
      {resume.experience && resume.experience.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
            Experience
          </Typography>
          {resume.experience.map((exp: any, expIdx: number) => (
            <Paper key={`${id}-exp-${expIdx}`} sx={{ p: 2, mb: 2, bgcolor: "#fafafa" }}>
              <Typography variant="body2" sx={{ fontWeight: "bold", mb: 1 }}>
                {exp.title} {exp.company && `- ${exp.company}`} {exp.start && `(${exp.start}${exp.end ? " - " + exp.end : ""})`}
              </Typography>
              <Box>
                {(exp.bullets || []).map((bullet: any, bulletIdx: number) => (
                  <TextField
                    key={`${id}-exp-${expIdx}-bullet-${bulletIdx}`}
                    fullWidth
                    size="small"
                    value={bullet.text}
                    onChange={(e) => handleBulletChange("experience", expIdx, bulletIdx, e.target.value)}
                    sx={{ mb: 1 }}
                  />
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Projects */}
      {resume.projects && resume.projects.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
            Projects
          </Typography>
          {resume.projects.map((proj: any, projIdx: number) => (
            <Paper key={`${id}-proj-${projIdx}`} sx={{ p: 2, mb: 2, bgcolor: "#fafafa" }}>
              <Typography variant="body2" sx={{ fontWeight: "bold", mb: 1 }}>
                {proj.name}
              </Typography>
              <Box>
                {(proj.bullets || []).map((bullet: any, bulletIdx: number) => (
                  <TextField
                    key={`${id}-proj-${projIdx}-bullet-${bulletIdx}`}
                    fullWidth
                    size="small"
                    value={bullet.text}
                    onChange={(e) => handleBulletChange("projects", projIdx, bulletIdx, e.target.value)}
                    sx={{ mb: 1 }}
                  />
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
