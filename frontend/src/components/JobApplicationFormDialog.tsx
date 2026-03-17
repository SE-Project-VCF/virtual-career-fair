import { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "../firebase";
import { API_URL } from "../config";
import type { ApplicationForm, FormField } from "../types/applicationForm";

interface JobForApply {
  id: string;
  companyId: string;
  name: string;
  applicationForm?: ApplicationForm | null;
}

interface JobApplicationFormDialogProps {
  open: boolean;
  onClose: () => void;
  job: JobForApply;
  boothId?: string;
  studentId: string | null;
}

interface TailoredResumeSummary {
  id: string;
  label: string; // e.g. "Software Engineer – Mar 2026"
}

type FieldValue = string | string[] | boolean | File | null;

// "none" | "profile" | <tailoredResumeId>
type ResumeChoice = "none" | "profile" | string;

export default function JobApplicationFormDialog({
  open,
  onClose,
  job,
  boothId,
  studentId,
}: Readonly<JobApplicationFormDialogProps>) {
  const form = job.applicationForm;
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState("");
  const [success, setSuccess] = useState(false);

  // Resume state
  const [profileResumePath, setProfileResumePath] = useState<string | null>(null);
  const [profileResumeFileName, setProfileResumeFileName] = useState<string | null>(null);
  const [tailoredResumes, setTailoredResumes] = useState<TailoredResumeSummary[]>([]);
  const [resumesLoading, setResumesLoading] = useState(false);
  const [resumeChoice, setResumeChoice] = useState<ResumeChoice>("none");

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;

    const load = async () => {
      setResumesLoading(true);
      try {
        // 1. Profile resume and user data from Firestore
        const snap = await getDoc(doc(db, "users", studentId));
        const data = snap.exists() ? snap.data() : null;

        if (!cancelled && data) {
          // Resume fields
          const path: string | null =
            data.resumePath ?? data.currentResumePath ?? (typeof data.resumeUrl === "string" && !data.resumeUrl.startsWith("http") ? data.resumeUrl : null) ?? null;
          const name: string | null = data.resumeFileName ?? null;
          setProfileResumePath(path);
          setProfileResumeFileName(name);
          if (path) setResumeChoice("profile");

          // 2. Pre-fill form values from profile (only for known field IDs in this form)
          if (form?.fields) {
            const authUser = auth.currentUser;
            const fieldIds = new Set(form.fields.map((f) => f.id));
            const prefill: Record<string, string> = {};

            if (fieldIds.has("fullName")) {
              prefill.fullName = (authUser?.displayName ?? data.displayName ?? "").toString();
            }
            if (fieldIds.has("email")) {
              prefill.email = (authUser?.email ?? data.email ?? "").toString();
            }
            if (fieldIds.has("graduationYear")) {
              prefill.graduationYear = (data.expectedGradYear ?? "").toString();
            }
            if (fieldIds.has("major")) {
              prefill.major = (data.major ?? "").toString();
            }
            if (fieldIds.has("skills")) {
              prefill.skills = (data.skills ?? "").toString();
            }

            if (Object.keys(prefill).length > 0) {
              setValues((prev) => ({ ...prev, ...prefill }));
            }
          }
        }

        // 3. Tailored resumes via API
        const token = await auth.currentUser?.getIdToken();
        if (token && !cancelled) {
          const res = await fetch(`${API_URL}/api/resume/tailored`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const summaries: TailoredResumeSummary[] = (data.resumes ?? []).map((r: any) => ({
              id: r.id,
              label: `${r.jobContext?.jobTitle ?? "Untitled"} – ${
                r.createdAt?.toDate
                  ? new Date(r.createdAt.toDate()).toLocaleDateString()
                  : r.createdAt
                    ? new Date(r.createdAt).toLocaleDateString()
                    : "Unknown date"
              }`,
            }));
            if (!cancelled) setTailoredResumes(summaries);
          }
        }
      } catch {
        // silently ignore — resume attachment is optional
      } finally {
        if (!cancelled) setResumesLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [open, studentId, form]);

  // Reset values when dialog closes
  useEffect(() => {
    if (!open) {
      setValues({});
      setErrors({});
      setTopError("");
      setSuccess(false);
    }
  }, [open]);

  if (!form || form.status !== "published") {
    return null;
  }

  const handleChange = (field: FormField, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [field.id]: value }));
    setErrors((prev) => ({ ...prev, [field.id]: "" }));
    setTopError("");
  };

  const getFieldError = (field: FormField, v: FieldValue): string | null => {
    if (!field.required) return null;
    switch (field.type) {
      case "shortText":
      case "longText":
        return !v || typeof v !== "string" || !v.trim() ? "This field is required." : null;
      case "singleSelect":
        return !v || typeof v !== "string" ? "Please select an option." : null;
      case "multiSelect":
        return !Array.isArray(v) || v.length === 0 ? "Select at least one option." : null;
      case "file":
        return !v || !(v instanceof File) ? "Please select a file." : null;
      default:
        return null;
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    for (const field of form.fields) {
      const error = getFieldError(field, values[field.id]);
      if (error) newErrors[field.id] = error;
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      setTopError("Please fix the highlighted fields before submitting.");
      return false;
    }
    return true;
  };

  const isFormValid = () => {
    if (!form.title.trim()) return false;
    return form.fields.every((field) => !getFieldError(field, values[field.id]));
  };

  const handleSubmit = async () => {
    if (!studentId) {
      setTopError("You must be logged in as a student to apply.");
      return;
    }

    if (!validate()) return;

    try {
      setSubmitting(true);
      setTopError("");
      setSuccess(false);

      const responses: Record<string, any> = {};
      const fileUrls: Record<string, string> = {};

      for (const field of form.fields) {
        const v = values[field.id];
        if (field.type === "file" && v instanceof File) {
          const safeName = v.name.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
          const storageRef = ref(
            storage,
            `jobApplications/${job.id}/${studentId}/${field.id}_${safeName}`,
          );
          const uploadTask = uploadBytesResumable(storageRef, v);
          const url = await new Promise<string>((resolve, reject) => {
            uploadTask.on(
              "state_changed",
              undefined,
              (err) => reject(err),
              async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadUrl);
              },
            );
          });
          fileUrls[field.id] = url;
        } else if (field.type !== "file") {
          responses[field.id] = v ?? null;
        }
      }

      // Build resume attachment fields
      let resumeFields: Record<string, any> = {};
      if (resumeChoice === "profile" && profileResumePath) {
        resumeFields = {
          attachedResumePath: profileResumePath,
          attachedResumeFileName: profileResumeFileName ?? null,
        };
      } else if (resumeChoice !== "none" && resumeChoice !== "profile") {
        const chosen = tailoredResumes.find((r) => r.id === resumeChoice);
        if (chosen) {
          resumeFields = {
            attachedTailoredResumeId: chosen.id,
            attachedTailoredResumeLabel: chosen.label,
          };
        }
      }

      const docData: any = {
        jobId: job.id,
        companyId: job.companyId,
        studentId,
        ...(boothId ? { boothId } : {}),
        responses,
        ...(Object.keys(fileUrls).length > 0 ? { fileUrls } : {}),
        ...resumeFields,
        submittedAt: Date.now(),
      };

      await addDoc(collection(db, "jobApplications"), docData);
      setSuccess(true);
      onClose();
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Error submitting application:", err);
      setTopError(err?.message || "Failed to submit application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderFieldLabel = (field: FormField) => (
    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
      {field.label}
      {field.required && (
        <Typography component="span" color="error" variant="body2">
          {" "}*
        </Typography>
      )}
    </Typography>
  );

  const renderField = (field: FormField) => {
    const value = values[field.id];

    switch (field.type) {
      case "shortText":
        return (
          <Box>
            {renderFieldLabel(field)}
            <TextField
              fullWidth
              value={(value as string) || ""}
              onChange={(e) => handleChange(field, e.target.value)}
              error={!!errors[field.id]}
              helperText={errors[field.id]}
            />
          </Box>
        );
      case "longText":
        return (
          <Box>
            {renderFieldLabel(field)}
            <TextField
              fullWidth
              multiline
              minRows={3}
              value={(value as string) || ""}
              onChange={(e) => handleChange(field, e.target.value)}
              error={!!errors[field.id]}
              helperText={errors[field.id]}
            />
          </Box>
        );
      case "singleSelect":
        return (
          <Box>
            {renderFieldLabel(field)}
            <FormControl fullWidth error={!!errors[field.id]}>
              <Select
                displayEmpty
                value={(value as string) || ""}
                onChange={(e) => handleChange(field, e.target.value)}
              >
                <MenuItem value="" disabled>
                  <em>Select an option</em>
                </MenuItem>
                {(field.options ?? []).map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
              {errors[field.id] && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                  {errors[field.id]}
                </Typography>
              )}
            </FormControl>
          </Box>
        );
      case "multiSelect":
        return (
          <Box>
            {renderFieldLabel(field)}
            <FormControl fullWidth error={!!errors[field.id]}>
              <Select
                multiple
                displayEmpty
                value={(value as string[]) || []}
                onChange={(e) => handleChange(field, e.target.value as string[])}
                renderValue={(selected) =>
                  selected.length === 0 ? (
                    <em style={{ color: "rgba(0,0,0,0.4)" }}>Select options</em>
                  ) : (
                    selected.join(", ")
                  )
                }
              >
                {(field.options ?? []).map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
              {errors[field.id] && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                  {errors[field.id]}
                </Typography>
              )}
            </FormControl>
          </Box>
        );
      case "checkbox":
        return (
          <Box>
            {renderFieldLabel(field)}
            <FormControlLabel
              control={
                <Checkbox
                  checked={Boolean(value)}
                  onChange={(e) => handleChange(field, e.target.checked)}
                />
              }
              label="Yes"
              sx={{ ml: 0 }}
            />
          </Box>
        );
      case "file":
        return (
          <Box>
            {renderFieldLabel(field)}
            <Button variant="outlined" component="label" size="small">
              <span>Choose file</span>
              <input
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  handleChange(field, file);
                }}
              />
            </Button>
            {value instanceof File && (
              <Typography variant="caption" sx={{ ml: 1 }}>
                {value.name}
              </Typography>
            )}
            {errors[field.id] && (
              <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                {errors[field.id]}
              </Typography>
            )}
          </Box>
        );
      default:
        return null;
    }
  };

  const hasAnyResume = !!profileResumePath || tailoredResumes.length > 0;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{form.title}</DialogTitle>
      <DialogContent dividers>
        {form.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {form.description}
          </Typography>
        )}

        {topError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setTopError("")}>
            {topError}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Application submitted successfully!
          </Alert>
        )}

        {/* Resume attachment section */}
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            border: "1px solid rgba(56, 133, 96, 0.25)",
            borderRadius: 1,
            bgcolor: "rgba(56, 133, 96, 0.04)",
          }}
        >
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ mb: 0.75, display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <AttachFileIcon fontSize="small" sx={{ color: "#388560" }} />
            Resume
          </Typography>

          {resumesLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: "#388560" }} />
              <Typography variant="caption" color="text.secondary">
                Loading your resumes…
              </Typography>
            </Box>
          ) : !hasAnyResume ? (
            <Typography variant="body2" color="text.secondary">
              No resume on file.{" "}
              <Typography component="span" variant="body2" color="#388560" sx={{ fontStyle: "italic" }}>
                Upload one from your profile, or create a tailored resume from a job invitation.
              </Typography>
            </Typography>
          ) : (
            <RadioGroup
              value={resumeChoice}
              onChange={(e) => setResumeChoice(e.target.value as ResumeChoice)}
            >
              <FormControlLabel
                value="none"
                control={<Radio size="small" sx={{ color: "#388560", "&.Mui-checked": { color: "#388560" } }} />}
                label={<Typography variant="body2">Don't attach a resume</Typography>}
              />
              {profileResumePath && (
                <FormControlLabel
                  value="profile"
                  control={<Radio size="small" sx={{ color: "#388560", "&.Mui-checked": { color: "#388560" } }} />}
                  label={
                    <Typography variant="body2">
                      My uploaded resume
                      {profileResumeFileName && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                          ({profileResumeFileName})
                        </Typography>
                      )}
                    </Typography>
                  }
                />
              )}
              {tailoredResumes.map((tr) => (
                <FormControlLabel
                  key={tr.id}
                  value={tr.id}
                  control={<Radio size="small" sx={{ color: "#388560", "&.Mui-checked": { color: "#388560" } }} />}
                  label={
                    <Typography variant="body2">
                      Tailored resume:{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        {tr.label}
                      </Typography>
                    </Typography>
                  }
                />
              ))}
            </RadioGroup>
          )}
        </Box>

        {form.fields.length > 0 && <Divider sx={{ mb: 2 }} />}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {form.fields.map((field) => (
            <Box key={field.id}>{renderField(field)}</Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Close
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !isFormValid() || !!success}
          sx={{
            background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
            "&:hover": {
              background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
            },
          }}
        >
          {submitting ? "Submitting..." : "Submit Application"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
