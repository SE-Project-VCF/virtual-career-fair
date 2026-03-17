import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AssignmentIcon from "@mui/icons-material/Assignment";
import { auth } from "../firebase";
import { API_URL } from "../config";
import type { ApplicationForm } from "../types/applicationForm";

interface Submission {
  id: string;
  jobId: string;
  companyId: string;
  studentId: string;
  responses: Record<string, string | string[] | boolean | null>;
  fileUrls?: Record<string, string>;
  submittedAt: number;
}

interface Job {
  id: string;
  name: string;
  applicationForm?: ApplicationForm;
}

interface SubmissionsViewerDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  jobs: Job[];
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function renderResponseValue(value: string | string[] | boolean | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  return String(value) || "—";
}

function SubmissionCard({ submission, form }: Readonly<{ submission: Submission; form?: ApplicationForm }>) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      sx={{
        border: "1px solid rgba(56, 133, 96, 0.2)",
        borderRadius: 1,
        mb: 1,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.25,
          cursor: "pointer",
          bgcolor: "rgba(56, 133, 96, 0.04)",
          "&:hover": { bgcolor: "rgba(56, 133, 96, 0.08)" },
        }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Box>
          <Typography variant="body2" fontWeight={600} color="text.primary">
            Applicant ID: {submission.studentId}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Submitted: {formatDate(submission.submittedAt)}
          </Typography>
        </Box>
        <IconButton size="small">
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, py: 1.5 }}>
          {form && form.fields.length > 0 ? (
            form.fields.map((field) => {
              const value = submission.responses?.[field.id];
              const fileUrl = submission.fileUrls?.[field.id];
              let fieldContent;
              if (field.type === "file") {
                fieldContent = fileUrl ? (
                  <Box>
                    <Link href={fileUrl} target="_blank" rel="noopener noreferrer" variant="body2">
                      View uploaded file
                    </Link>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No file uploaded
                  </Typography>
                );
              } else {
                fieldContent = (
                  <Typography variant="body2" color="text.primary" sx={{ mt: 0.25 }}>
                    {renderResponseValue(value ?? null)}
                  </Typography>
                );
              }
              return (
                <Box key={field.id} sx={{ mb: 1.25 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {field.label}
                    {field.required && (
                      <Typography component="span" color="error" variant="caption">
                        {" "}*
                      </Typography>
                    )}
                  </Typography>
                  {fieldContent}
                </Box>
              );
            })
          ) : (
            <Box>
              {Object.entries(submission.responses ?? {}).map(([key, val]) => (
                <Box key={key} sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {key}
                  </Typography>
                  <Typography variant="body2">{renderResponseValue(val)}</Typography>
                </Box>
              ))}
              {submission.fileUrls &&
                Object.entries(submission.fileUrls).map(([key, url]) => (
                  <Box key={key} sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {key} (file)
                    </Typography>
                    <Box>
                      <Link href={url} target="_blank" rel="noopener noreferrer" variant="body2">
                        View uploaded file
                      </Link>
                    </Box>
                  </Box>
                ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function SubmissionsViewerDialog({
  open,
  onClose,
  companyId,
  jobs,
}: Readonly<SubmissionsViewerDialogProps>) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterJobId, setFilterJobId] = useState<string>("all");

  useEffect(() => {
    if (!open) return;

    const fetchSubmissions = async () => {
      try {
        setLoading(true);
        setError("");

        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(
          `${API_URL}/api/companies/${companyId}/submissions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to load submissions.");
        }

        const data = await response.json();
        setSubmissions(data.submissions ?? []);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Error fetching submissions:", err);
        setError(err?.message || "Failed to load submissions.");
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
  }, [open, companyId]);

  const jobsWithForms = jobs.filter((j) => j.applicationForm);

  const filteredSubmissions =
    filterJobId === "all" ? submissions : submissions.filter((s) => s.jobId === filterJobId);

  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  const grouped = filteredSubmissions.reduce<Record<string, Submission[]>>((acc, sub) => {
    const key = sub.jobId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sub);
    return acc;
  }, {});

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { maxHeight: "90vh" } } }}>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AssignmentIcon sx={{ color: "#388560" }} />
            <Typography variant="h6">Application Submissions</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Filter */}
        <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="body2" color="text.secondary" flexShrink={0}>
            Filter by job:
          </Typography>
          <Select
            size="small"
            value={filterJobId}
            onChange={(e) => setFilterJobId(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="all">All jobs</MenuItem>
            {jobs.map((j) => (
              <MenuItem key={j.id} value={j.id}>
                {j.name}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} sx={{ color: "#388560" }} />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && filteredSubmissions.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <AssignmentIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary">No submissions yet.</Typography>
            {jobsWithForms.length === 0 && (
              <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
                Publish an application form on a job to start receiving submissions.
              </Typography>
            )}
          </Box>
        )}

        {!loading &&
          !error &&
          Object.entries(grouped).map(([jobId, jobSubs]) => {
            const job = jobMap.get(jobId);
            return (
              <Box key={jobId} sx={{ mb: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} color="#388560">
                    {job?.name ?? jobId}
                  </Typography>
                  <Chip label={`${jobSubs.length} submission${jobSubs.length === 1 ? "" : "s"}`} size="small" />
                </Box>
                <Divider sx={{ mb: 1.5 }} />
                {jobSubs.map((sub) => (
                  <SubmissionCard key={sub.id} submission={sub} form={job?.applicationForm} />
                ))}
              </Box>
            );
          })}
      </DialogContent>
    </Dialog>
  );
}
