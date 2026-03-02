import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { collection, addDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import type { ApplicationForm, FormField, FormFieldType } from "../types/applicationForm";

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

type FieldValue = string | string[] | boolean | File | null;

export default function JobApplicationFormDialog({
  open,
  onClose,
  job,
  boothId,
  studentId,
}: JobApplicationFormDialogProps) {
  const form = job.applicationForm;
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!form || form.status !== "published") {
    return null;
  }

  const handleChange = (field: FormField, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [field.id]: value }));
    setErrors((prev) => ({ ...prev, [field.id]: "" }));
    setTopError("");
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    for (const field of form.fields) {
      if (!field.required) continue;

      const v = values[field.id];

      if (field.type === "shortText" || field.type === "longText") {
        if (!v || typeof v !== "string" || !v.trim()) {
          newErrors[field.id] = "This field is required.";
        }
      } else if (field.type === "singleSelect") {
        if (!v || typeof v !== "string") {
          newErrors[field.id] = "Please select an option.";
        }
      } else if (field.type === "multiSelect") {
        if (!Array.isArray(v) || v.length === 0) {
          newErrors[field.id] = "Select at least one option.";
        }
      } else if (field.type === "file") {
        if (!v || !(v instanceof File)) {
          newErrors[field.id] = "Please select a file.";
        }
      }
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
    for (const field of form.fields) {
      if (!field.required) continue;
      const v = values[field.id];
      if (field.type === "shortText" || field.type === "longText") {
        if (!v || typeof v !== "string" || !v.trim()) return false;
      } else if (field.type === "singleSelect") {
        if (!v || typeof v !== "string") return false;
      } else if (field.type === "multiSelect") {
        if (!Array.isArray(v) || v.length === 0) return false;
      } else if (field.type === "file") {
        if (!v || !(v instanceof File)) return false;
      }
    }
    return true;
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
          const safeName = v.name.replace(/[^a-zA-Z0-9._-]/g, "_");
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

      const docData: any = {
        jobId: job.id,
        companyId: job.companyId,
        studentId,
        ...(boothId ? { boothId } : {}),
        responses,
        ...(Object.keys(fileUrls).length > 0 ? { fileUrls } : {}),
        submittedAt: Date.now(),
      };

      await addDoc(collection(db, "jobApplications"), docData);
      setSuccess(true);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Error submitting application:", err);
      setTopError(err?.message || "Failed to submit application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    const value = values[field.id];

    switch (field.type as FormFieldType) {
      case "shortText":
        return (
          <TextField
            fullWidth
            label={field.label}
            required={field.required}
            value={(value as string) || ""}
            onChange={(e) => handleChange(field, e.target.value)}
            error={!!errors[field.id]}
            helperText={errors[field.id]}
          />
        );
      case "longText":
        return (
          <TextField
            fullWidth
            multiline
            minRows={3}
            label={field.label}
            required={field.required}
            value={(value as string) || ""}
            onChange={(e) => handleChange(field, e.target.value)}
            error={!!errors[field.id]}
            helperText={errors[field.id]}
          />
        );
      case "singleSelect":
        return (
          <FormControl fullWidth error={!!errors[field.id]}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              label={field.label}
              value={(value as string) || ""}
              onChange={(e) => handleChange(field, e.target.value)}
              required={field.required}
            >
              {(field.options ?? []).map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </Select>
            {errors[field.id] && (
              <Typography variant="caption" color="error">
                {errors[field.id]}
              </Typography>
            )}
          </FormControl>
        );
      case "multiSelect":
        return (
          <FormControl fullWidth error={!!errors[field.id]}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              multiple
              label={field.label}
              value={(value as string[]) || []}
              onChange={(e) => handleChange(field, e.target.value as string[])}
            >
              {(field.options ?? []).map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </Select>
            {errors[field.id] && (
              <Typography variant="caption" color="error">
                {errors[field.id]}
              </Typography>
            )}
          </FormControl>
        );
      case "checkbox":
        return (
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(value)}
                onChange={(e) => handleChange(field, e.target.checked)}
              />
            }
            label={field.label}
          />
        );
      case "file":
        return (
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {field.label}
              {field.required && " *"}
            </Typography>
            <Button variant="outlined" component="label" size="small">
              Choose file
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
              <Typography variant="caption" color="error" display="block">
                {errors[field.id]}
              </Typography>
            )}
          </Box>
        );
      default:
        return null;
    }
  };

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

