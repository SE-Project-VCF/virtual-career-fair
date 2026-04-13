import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Typography,
  Alert,
  Chip,
  InputAdornment,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Stack,
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { authUtils } from "../utils/auth";
import { API_URL } from "../config";
import { ACCEPTED_INTEREST_TAGS } from "../constants/interestTagOptions";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  major: string;
  skills?: string;
  interestTags?: string[];
}

/** Coerce API rows so filters always see string skills and string[] tags. */
function normalizeStudentFromApi(raw: unknown): Student {
  const s = raw as Record<string, unknown>;
  let skills = "";
  if (typeof s.skills === "string") skills = s.skills;
  else if (Array.isArray(s.skills)) {
    skills = s.skills.filter((x) => typeof x === "string").join(", ");
  } else if (s.skills != null) skills = String(s.skills);

  let interestTags: string[] = [];
  if (Array.isArray(s.interestTags)) {
    interestTags = s.interestTags
      .map((t) => {
        if (typeof t === "string") return t.trim().toLowerCase().replace(/\s+/g, " ");
        if (t && typeof t === "object") {
          const o = t as Record<string, unknown>;
          const from = o.name ?? o.tag ?? o.label;
          if (typeof from === "string") return from.trim().toLowerCase().replace(/\s+/g, " ");
        }
        return "";
      })
      .filter(Boolean);
  }

  return {
    id: String(s.id ?? ""),
    firstName: String(s.firstName ?? ""),
    lastName: String(s.lastName ?? ""),
    email: String(s.email ?? ""),
    major: String(s.major ?? ""),
    skills,
    interestTags,
  };
}

function normalizeInterestFilterToken(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, " ");
}

function studentSkillsMatchFilter(skills: string | undefined, filterRaw: string): boolean {
  const sk = filterRaw.trim().toLowerCase();
  if (!sk) return true;
  const blob = (skills ?? "")
    .toLowerCase()
    .replace(/\s*,\s*/g, " ")
    .replace(/[;\n]+/g, " ")
    .replace(/\s+/g, " ");
  return blob.includes(sk);
}

function studentHasInterestTag(student: Student, selectedTag: string): boolean {
  const t = normalizeInterestFilterToken(selectedTag);
  if (!t) return true;
  return (student.interestTags ?? []).some((tag) => {
    const nt = normalizeInterestFilterToken(String(tag));
    return nt === t || nt.includes(t) || t.includes(nt);
  });
}

function formatInterestChipLabel(tag: string): string {
  return tag
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface JobInviteDialogProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  boothId?: string;
  onSuccess?: () => void;
}

function formatTagDisplay(tag: string): string {
  return tag
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const getFilteredStudents = (students: Student[], searchTerm: string) => {
  const trimmedSearch = searchTerm.trim();
  if (trimmedSearch.length === 0) return students;

  const searchLower = trimmedSearch.toLowerCase();
  return students.filter((student) => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    const tagMatch = (student.interestTags ?? []).some((tag) => {
      const tl = tag.toLowerCase();
      return tl.includes(searchLower) || searchLower.includes(tl);
    });
    const skillsLower = (student.skills ?? "").toLowerCase();
    return (
      fullName.includes(searchLower) ||
      student.email.toLowerCase().includes(searchLower) ||
      student.major.toLowerCase().includes(searchLower) ||
      skillsLower.includes(searchLower) ||
      tagMatch
    );
  });
};

const getStudentCountLabel = (count: number) => (count === 1 ? "student" : "students");

function buildInfoMessage(
  poolMode: "booth" | "all",
  boothId: string | undefined,
  loadedCount: number,
  filteredCount: number
) {
  const poolHint =
    boothId && poolMode === "booth"
      ? `Loaded ${loadedCount} ${getStudentCountLabel(loadedCount)} who visited your booth.`
      : `Loaded ${loadedCount} ${getStudentCountLabel(loadedCount)} from the full student list.`;

  const filterHint =
    filteredCount !== loadedCount
      ? ` ${filteredCount} match your filters below.`
      : " Use filters or search to narrow the list, then use Select all to invite everyone shown.";

  return `${poolHint}${filterHint} Invitations are sent to students' dashboards.`;
}

const buildSendButtonLabel = (isLoading: boolean, selectedCount: number) => {
  if (isLoading) return "Sending...";
  if (selectedCount === 0) return "Send";
  return `Send (${selectedCount})`;
};

export default function JobInviteDialog({
  open,
  onClose,
  jobId,
  jobTitle,
  boothId,
  onSuccess,
}: Readonly<JobInviteDialogProps>) {
  const [students, setStudents] = useState<Student[]>([]);
  const [poolMode, setPoolMode] = useState<"booth" | "all">("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [majorFilter, setMajorFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [interestTagFilter, setInterestTagFilter] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const fetchStudents = useCallback(async (mode: "booth" | "all") => {
    try {
      setLoadingStudents(true);
      setError("");

      const currentUser = authUtils.getCurrentUser();
      if (currentUser === null) {
        setError("You must be logged in to invite students");
        return;
      }

      const idToken = await authUtils.getIdToken();
      if (!idToken) {
        setError("Could not verify your session. Please sign in again.");
        return;
      }

      const params = new URLSearchParams({
        userId: currentUser.uid,
      });

      const useBoothPool = Boolean(boothId) && mode === "booth";
      if (useBoothPool) {
        params.append("boothId", boothId);
      }

      const response = await fetch(`${API_URL}/api/students?${params}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const rows = Array.isArray(data.students) ? data.students : [];
        setStudents(rows.map((row: unknown) => normalizeStudentFromApi(row)));
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch students");
      }
    } catch (err: unknown) {
      console.error("Error fetching students:", err);
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoadingStudents(false);
    }
  }, [boothId]);

  useEffect(() => {
    if (!open) return;
    const mode = boothId ? "booth" : "all";
    setPoolMode(mode);
    setSelectedStudents(new Set());
    setSearchTerm("");
    setMajorFilter("");
    setSkillFilter("");
    setInterestTagFilter(null);
    setMessage("");
    setError("");
    setSuccess(false);
    void fetchStudents(mode);
  }, [open, boothId, fetchStudents]);

  const filteredStudents = useMemo(() => {
    let list = students;
    if (interestTagFilter != null && String(interestTagFilter).trim() !== "") {
      list = list.filter((s) => studentHasInterestTag(s, String(interestTagFilter)));
    }
    if (majorFilter.trim()) {
      const m = majorFilter.toLowerCase().trim();
      list = list.filter((s) => s.major.toLowerCase().includes(m));
    }
    if (skillFilter.trim()) {
      list = list.filter((s) => studentSkillsMatchFilter(s.skills, skillFilter));
    }
    return getFilteredStudents(list, searchTerm);
  }, [students, interestTagFilter, majorFilter, skillFilter, searchTerm]);

  const handlePoolModeChange = (_: React.MouseEvent<HTMLElement>, value: "booth" | "all" | null) => {
    if (value === null) return;
    setPoolMode(value);
    setSelectedStudents(new Set());
    void fetchStudents(value);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setMajorFilter("");
    setSkillFilter("");
    setInterestTagFilter(null);
  };

  const handleToggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      // Deselect all
      setSelectedStudents(new Set());
    } else {
      // Select all filtered students
      setSelectedStudents(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  const handleSend = async () => {
    if (selectedStudents.size === 0) {
      setError("Please select at least one student");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const currentUser = authUtils.getCurrentUser();
      if (currentUser === null) {
        throw new Error("You must be logged in");
      }

      const idToken = await authUtils.getIdToken();
      if (!idToken) {
        throw new Error("Could not verify your session. Please sign in again.");
      }

      const response = await fetch(`${API_URL}/api/job-invitations/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          jobId,
          studentIds: Array.from(selectedStudents),
          message: message.trim() || undefined,
          sentVia: "notification",
          userId: currentUser.uid,
        }),
      });

      if (response.ok) {
        await response.json();
        setSuccess(true);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send invitations");
      }
      
      // Show success message briefly, then close
      setTimeout(() => {
        if (onSuccess) onSuccess();
        handleClose();
      }, 1500);
    } catch (err: any) {
      console.error("Error sending invitations:", err);
      setError(err.message || "Failed to send invitations");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  const allSelected = filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length;
  const someSelected = selectedStudents.size > 0 && selectedStudents.size < filteredStudents.length;
  const infoMessage = buildInfoMessage(poolMode, boothId, students.length, filteredStudents.length);
  const inviteCountSuffix = selectedStudents.size === 1 ? "" : "s";
  const sendButtonLabel = buildSendButtonLabel(loading, selectedStudents.size);

  const renderStudentList = () => {
    if (loadingStudents) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (filteredStudents.length === 0) {
      return (
        <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
            {students.length === 0
              ? poolMode === "booth" && boothId
                ? "No students have visited this booth yet, or try “All students” above."
                : "No students found."
              : "No students match your filters and search. Try clearing filters."}
          </Typography>
        </Box>
      );
    }

    return (
      <List dense sx={{ p: 0 }}>
        {filteredStudents.map((student) => (
          <ListItem key={student.id} disablePadding sx={{ alignItems: "flex-start" }}>
            <ListItemButton
              onClick={() => handleToggleStudent(student.id)}
              dense
              sx={{ alignItems: "flex-start", py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 42, mt: 0.25 }}>
                <Checkbox
                  edge="start"
                  checked={selectedStudents.has(student.id)}
                  tabIndex={-1}
                  disableRipple
                />
              </ListItemIcon>
              {/*
                ListItemText defaults secondary to <p>, which cannot contain divs/Chips (invalid HTML).
                Use component="div" so skills + interest chips render reliably.
              */}
              <ListItemText
                primary={`${student.firstName} ${student.lastName}`}
                primaryTypographyProps={{ component: "span", variant: "body2", fontWeight: 600 }}
                secondaryTypographyProps={{ component: "div" }}
                secondary={
                  <Box sx={{ pt: 0.25, width: "100%" }}>
                    <Typography variant="body2" color="text.secondary" component="div">
                      {student.email}
                      {student.major ? ` • ${student.major}` : ""}
                    </Typography>
                    {student.skills?.trim() ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="div"
                        sx={{ mt: 0.5, lineHeight: 1.4 }}
                      >
                        <Box component="span" sx={{ fontWeight: 600, color: "text.secondary" }}>
                          Skills:{" "}
                        </Box>
                        {student.skills.length > 120 ? `${student.skills.slice(0, 120)}…` : student.skills}
                      </Typography>
                    ) : null}
                    <Box
                      sx={{
                        mt: 0.75,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        alignItems: "center",
                      }}
                    >
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ fontWeight: 600, color: "text.secondary", mr: 0.5 }}
                      >
                        Interests:
                      </Typography>
                      {(student.interestTags?.length ?? 0) > 0 ? (
                        (student.interestTags ?? []).map((tag) => (
                          <Chip
                            key={`${student.id}-${tag}`}
                            label={formatInterestChipLabel(tag)}
                            size="small"
                            variant="outlined"
                          />
                        ))
                      ) : (
                        <Typography variant="caption" color="text.disabled" component="span">
                          —
                        </Typography>
                      )}
                    </Box>
                  </Box>
                }
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    );
  };

  const renderDialogContent = () => {
    if (success) {
      return (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Alert severity="success">
            Successfully sent {selectedStudents.size} invitation{inviteCountSuffix}!
          </Alert>
        </Box>
      );
    }

    return (
      <>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}> 
            {error}
          </Alert>
        )}

        <Alert severity="info" sx={{ mb: 2 }}>
          {infoMessage}
        </Alert>

        {boothId ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Student pool
            </Typography>
            <ToggleButtonGroup
              value={poolMode}
              exclusive
              onChange={handlePoolModeChange}
              size="small"
              fullWidth
              color="primary"
            >
              <ToggleButton value="booth">Visited my booth</ToggleButton>
              <ToggleButton value="all">All students</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        ) : null}

        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Narrow by profile (optional)
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} useFlexGap flexWrap="wrap">
            <TextField
              size="small"
              label="Major contains"
              value={majorFilter}
              onChange={(e) => setMajorFilter(e.target.value)}
              sx={{ flex: "1 1 160px", minWidth: 140 }}
            />
            <TextField
              size="small"
              label="Skills contain"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              placeholder="e.g. Python"
              sx={{ flex: "1 1 160px", minWidth: 140 }}
            />
            <Autocomplete
              size="small"
              options={[...ACCEPTED_INTEREST_TAGS]}
              value={interestTagFilter}
              onChange={(_, v) => setInterestTagFilter(v)}
              getOptionLabel={(o) => (o == null ? "" : formatTagDisplay(o))}
              isOptionEqualToValue={(a, b) => (a ?? "") === (b ?? "")}
              renderInput={(params) => (
                <TextField {...params} label="Interest tag" placeholder="Any" />
              )}
              sx={{ flex: "1 1 200px", minWidth: 180 }}
            />
          </Stack>
          <Box>
            <Button size="small" onClick={clearFilters} disabled={!majorFilter && !skillFilter && !interestTagFilter && !searchTerm}>
              Clear search & filters
            </Button>
          </Box>
        </Stack>

        {/* Optional Message */}
        <TextField
          fullWidth
          multiline
          rows={3}
          label="Personal Message (Optional)"
          placeholder="Add a personal message to your invitation..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          sx={{ mb: 3 }}
        />

        {/* Student Selection */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              Select Students
            </Typography>
            <Chip
              label={`${selectedStudents.size} selected`}
              color={selectedStudents.size > 0 ? "primary" : "default"}
              size="small"
            />
          </Box>

          {/* Text search (applies on top of filters) */}
          <TextField
            fullWidth
            size="small"
            label="Quick search"
            placeholder="Name, email, major, skills, or interests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm("")} edge="end">
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{ mb: 1 }}
          />

          {/* Select all in current filtered list */}
          {filteredStudents.length > 0 && (
            <Button size="small" onClick={handleSelectAll} sx={{ mb: 1 }}>
              {allSelected ? "Deselect all shown" : `Select all shown (${filteredStudents.length})`}
              {someSelected && !allSelected && ` — ${selectedStudents.size} picked`}
            </Button>
          )}

          {/* Students List */}
          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {renderStudentList()}
          </Box>
        </Box>
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: { minHeight: "70vh", maxHeight: "90vh" },
        },
      }}
    >
      <DialogTitle>
        <Typography variant="h6" component="div">
          Invite Students to Apply
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {jobTitle}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>{renderDialogContent()}</DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSend}
          variant="contained"
          disabled={loading || selectedStudents.size === 0 || success}
          startIcon={loading && <CircularProgress size={20} />}
        >
          {sendButtonLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
