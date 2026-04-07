import { useState, useEffect } from "react";
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
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { authUtils } from "../utils/auth";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  major: string;
}

interface JobInviteDialogProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  boothId?: string;
  onSuccess?: () => void;
}

const getFilteredStudents = (students: Student[], searchTerm: string) => {
  const trimmedSearch = searchTerm.trim();
  if (trimmedSearch.length === 0) return students;

  const searchLower = trimmedSearch.toLowerCase();
  return students.filter((student) => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    return (
      fullName.includes(searchLower) ||
      student.email.toLowerCase().includes(searchLower) ||
      student.major.toLowerCase().includes(searchLower)
    );
  });
};

const getStudentCountLabel = (count: number) => (count === 1 ? "student" : "students");

const buildInfoMessage = (boothId: string | undefined, studentCount: number) => {
  if (boothId) {
    return `Showing ${studentCount} ${getStudentCountLabel(studentCount)} who visited your booth. Invitations will be sent to their dashboards.`;
  }

  return "Invitations will be sent to students' dashboards as notifications.";
};

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
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Fetch students on mount
  useEffect(() => {
    if (open) {
      fetchStudents();
      // Reset state when dialog opens
      setSelectedStudents(new Set());
      setSearchTerm("");
      setMessage("");
      setError("");
      setSuccess(false);
    }
  }, [open]);

  // Filter students based on search term
  useEffect(() => {
    setFilteredStudents(getFilteredStudents(students, searchTerm));
  }, [searchTerm, students]);

  const fetchStudents = async () => {
    try {
      setLoadingStudents(true);
      setError("");
      
      const currentUser = authUtils.getCurrentUser();
      if (currentUser === null) {
        setError("You must be logged in to invite students");
        return;
      }

      const params = new URLSearchParams({
        userId: currentUser.uid,
      });
      
      if (boothId) {
        params.append("boothId", boothId);
      }

      const response = await fetch(
        `http://localhost:5000/api/students?${params}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStudents(data.students || []);
        setFilteredStudents(data.students || []);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch students");
      }
    } catch (err: any) {
      console.error("Error fetching students:", err);
      setError(err.message || "Failed to load students");
    } finally {
      setLoadingStudents(false);
    }
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

      const response = await fetch("http://localhost:5000/api/job-invitations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  const infoMessage = buildInfoMessage(boothId, students.length);
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
            {students.length === 0 ? "No students found" : "No students match your search"}
          </Typography>
        </Box>
      );
    }

    return (
      <List dense sx={{ p: 0 }}>
        {filteredStudents.map((student) => (
          <ListItem key={student.id} disablePadding>
            <ListItemButton onClick={() => handleToggleStudent(student.id)} dense>
              <ListItemIcon>
                <Checkbox
                  edge="start"
                  checked={selectedStudents.has(student.id)}
                  tabIndex={-1}
                  disableRipple
                />
              </ListItemIcon>
              <ListItemText
                primary={`${student.firstName} ${student.lastName}`}
                secondary={
                  <>
                    {student.email}
                    {student.major && ` • ${student.major}`}
                  </>
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

        <Alert severity="info" sx={{ mb: 3 }}>
          {infoMessage}
        </Alert>

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

          {/* Search */}
          <TextField
            fullWidth
            size="small"
            placeholder="Search by name, email, or major..."
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

          {/* Select All Button */}
          {filteredStudents.length > 0 && (
            <Button size="small" onClick={handleSelectAll} sx={{ mb: 1 }}>
              {allSelected ? "Deselect All" : "Select All"}
              {someSelected && ` (${selectedStudents.size})`}
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
