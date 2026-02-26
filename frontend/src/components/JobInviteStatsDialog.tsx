import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  List,
  ListItem,
  Chip,
  Divider,
} from "@mui/material";
import { authUtils } from "../utils/auth";
import PersonIcon from "@mui/icons-material/Person";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LaunchIcon from "@mui/icons-material/Launch";
import SendIcon from "@mui/icons-material/Send";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  major: string;
}

interface InvitationDetail {
  id: string;
  studentId: string;
  student: Student | null;
  status: string;
  sentAt: number | null;
  viewedAt: number | null;
  clickedAt: number | null;
  message: string | null;
}

interface JobInviteStatsDialogProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
}

export default function JobInviteStatsDialog({
  open,
  onClose,
  jobId,
  jobTitle,
}: Readonly<JobInviteStatsDialogProps>) {
  const [invitations, setInvitations] = useState<InvitationDetail[]>([]);
  const [filteredInvitations, setFilteredInvitations] = useState<InvitationDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentTab, setCurrentTab] = useState<"all" | "sent" | "viewed" | "clicked">("all");

  useEffect(() => {
    if (open) {
      fetchInvitationDetails();
    }
  }, [open, jobId]);

  useEffect(() => {
    filterInvitations();
  }, [invitations, currentTab]);

  const fetchInvitationDetails = async () => {
    const user = authUtils.getCurrentUser();
    if (!user) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `http://localhost:5000/api/job-invitations/details/${jobId}?userId=${user.uid}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch invitation details");
      }

      const data = await response.json();
      setInvitations(data.invitations || []);
    } catch (err: any) {
      console.error("Error fetching invitation details:", err);
      setError(err.message || "Failed to load invitation details");
    } finally {
      setLoading(false);
    }
  };

  const filterInvitations = () => {
    if (currentTab === "all") {
      setFilteredInvitations(invitations);
    } else {
      setFilteredInvitations(invitations.filter((inv) => inv.status === currentTab));
    }
  };

  const formatDateTime = (timestamp: number | null) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusChip = (status: string) => {
    const statusConfig = {
      sent: { label: "Sent", color: "default" as const, icon: <SendIcon sx={{ fontSize: 16 }} /> },
      viewed: { label: "Viewed", color: "info" as const, icon: <VisibilityIcon sx={{ fontSize: 16 }} /> },
      clicked: { label: "Applied", color: "success" as const, icon: <LaunchIcon sx={{ fontSize: 16 }} /> },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.sent;
    return (
      <Chip 
        label={config.label} 
        color={config.color} 
        size="small" 
        icon={config.icon}
        sx={{ minWidth: 90 }}
      />
    );
  };

  const sentCount = invitations.filter((inv) => inv.status === "sent").length;
  const viewedCount = invitations.filter((inv) => inv.status === "viewed").length;
  const clickedCount = invitations.filter((inv) => inv.status === "clicked").length;
  const emptyStateMessage = currentTab === "all" ? "No invitations sent yet" : `No ${currentTab} invitations`;

  const renderDialogBody = () => {
    if (loading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      );
    }

    return (
      <>
        {/* Filter Tabs */}
        <Tabs
          value={currentTab}
          onChange={(_, newValue) => setCurrentTab(newValue)}
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label={`All (${invitations.length})`} value="all" />
          <Tab label={`Sent (${sentCount})`} value="sent" />
          <Tab label={`Viewed (${viewedCount})`} value="viewed" />
          <Tab label={`Applied (${clickedCount})`} value="clicked" />
        </Tabs>

        {/* Invitations List */}
        {filteredInvitations.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <PersonIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              {emptyStateMessage}
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {filteredInvitations.map((invitation, index) => {
              const studentName = invitation.student
                ? `${invitation.student.firstName} ${invitation.student.lastName}`
                : "Unknown Student";

              return (
                <Box key={invitation.id}>
                  <ListItem
                    sx={{
                      py: 2,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", mb: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
                        <PersonIcon sx={{ color: "#388560" }} />
                        <Box>
                          <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            {studentName}
                          </Typography>
                          {invitation.student && (
                            <Typography variant="caption" color="text.secondary">
                              {invitation.student.email}
                              {invitation.student.major && ` • ${invitation.student.major}`}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      {getStatusChip(invitation.status)}
                    </Box>

                    {/* Timeline */}
                    <Box sx={{ pl: 4, width: "100%" }}>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <AccessTimeIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                          <Typography variant="caption" color="text.secondary">
                            Sent: {formatDateTime(invitation.sentAt)}
                          </Typography>
                        </Box>
                        {invitation.viewedAt && (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <VisibilityIcon sx={{ fontSize: 14, color: "#0288d1" }} />
                            <Typography variant="caption" color="text.secondary">
                              Viewed: {formatDateTime(invitation.viewedAt)}
                            </Typography>
                          </Box>
                        )}
                        {invitation.clickedAt && (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <LaunchIcon sx={{ fontSize: 14, color: "#2e7d32" }} />
                            <Typography variant="caption" color="text.secondary">
                              Applied: {formatDateTime(invitation.clickedAt)}
                            </Typography>
                          </Box>
                        )}
                      </Box>

                      {invitation.message && (
                        <Box
                          sx={{
                            mt: 1,
                            p: 1.5,
                            bgcolor: "rgba(56, 133, 96, 0.05)",
                            borderRadius: 1,
                            borderLeft: "3px solid #388560",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                            Message: "{invitation.message}"
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </ListItem>
                  {index < filteredInvitations.length - 1 && <Divider />}
                </Box>
              );
            })}
          </List>
        )}
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
          Invitation Details
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {jobTitle}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>{renderDialogBody()}</DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
