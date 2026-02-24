import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WorkIcon from "@mui/icons-material/Work";
import BusinessIcon from "@mui/icons-material/Business";
import PersonIcon from "@mui/icons-material/Person";
import LaunchIcon from "@mui/icons-material/Launch";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { authUtils } from "../utils/auth";
import ProfileMenu from "./ProfileMenu";

interface JobInvitation {
  id: string;
  jobId: string;
  companyId: string;
  studentId: string;
  sentBy: string;
  sentVia: "chat" | "notification";
  status: "sent" | "viewed" | "clicked";
  sentAt: number;
  viewedAt?: number;
  clickedAt?: number;
  message?: string;
  job: {
    id: string;
    name: string;
    description: string;
    majorsAssociated: string;
    applicationLink: string | null;
  } | null;
  company: {
    id: string;
    companyName: string;
    boothId: string | null;
  } | null;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export default function JobInvitations() {
  const navigate = useNavigate();
  const [user] = useState(() => authUtils.getCurrentUser());
  const [invitations, setInvitations] = useState<JobInvitation[]>([]);
  const [filteredInvitations, setFilteredInvitations] = useState<JobInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTab, setCurrentTab] = useState<"all" | "sent" | "viewed" | "clicked">("all");

  useEffect(() => {

    const fetchInvitations = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `http://localhost:5000/api/job-invitations/received?userId=${user.uid}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch invitations");
        }

        const data = await response.json();
        setInvitations(data.invitations || []);
      } catch (err: any) {
        console.error("Error fetching invitations:", err);
        setError(err.message || "Failed to load invitations");
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === "student") {
      fetchInvitations();
    } else {
      setError("You must be logged in as a student to view invitations");
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentTab === "all") {
      setFilteredInvitations(invitations);
    } else {
      setFilteredInvitations(invitations.filter((inv) => inv.status === currentTab));
    }
  }, [invitations, currentTab]);

  const handleViewInvitation = async (invitation: JobInvitation) => {
    // Mark as viewed if not already
    if (invitation.status === "sent" && user) {
      try {
        await fetch(`http://localhost:5000/api/job-invitations/${invitation.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "viewed",
            userId: user.uid,
          }),
        });

        // Update local state
        setInvitations((prev) =>
          prev.map((inv) =>
            inv.id === invitation.id ? { ...inv, status: "viewed", viewedAt: Date.now() } : inv
          )
        );
      } catch (err) {
        console.error("Error updating invitation status:", err);
      }
    }
  };

  const handleApplyClick = async (invitation: JobInvitation) => {
    // Mark as clicked
    if (user) {
      try {
        await fetch(`http://localhost:5000/api/job-invitations/${invitation.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "clicked",
            userId: user.uid,
          }),
        });

        // Update local state
        setInvitations((prev) =>
          prev.map((inv) =>
            inv.id === invitation.id
              ? { ...inv, status: "clicked", clickedAt: Date.now() }
              : inv
          )
        );

        // Open application link if available
        if (invitation.job?.applicationLink) {
          window.open(invitation.job.applicationLink, "_blank");
        }
      } catch (err) {
        console.error("Error updating invitation status:", err);
      }
    }
  };

  const handleViewJob = (invitation: JobInvitation) => {
    handleViewInvitation(invitation);
    // Navigate to booth view to see the full job details
    if (invitation.company?.boothId) {
      navigate(`/booth/${invitation.company.boothId}`);
    } else {
      setError("This company doesn't have a booth set up yet.");
    }
  };

  const formatDateTime = (timestamp: number | undefined) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    return date.toLocaleDateString();
  };

  const getStatusChip = (status: string) => {
    const statusConfig = {
      sent: { label: "New", color: "primary" as const },
      viewed: { label: "Viewed", color: "info" as const },
      clicked: { label: "Applied", color: "success" as const },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.sent;
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  const newInvitationsCount = invitations.filter((inv) => inv.status === "sent").length;

  if (user?.role !== "student") {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          You must be logged in as a student to view job invitations.
        </Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
          color: "white",
          py: 3,
          mb: 4,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <IconButton onClick={() => navigate("/dashboard")} sx={{ color: "white" }}>
                <ArrowBackIcon />
              </IconButton>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Job Invitations
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                  {invitations.length} invitation{invitations.length > 1 ? "s" : ""} received
                  {newInvitationsCount > 0 && ` • ${newInvitationsCount} new`}
                </Typography>
              </Box>
            </Box>
            <ProfileMenu />
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ pb: 4 }}>
        {/* Filter Tabs */}
        <Card sx={{ mb: 3 }}>
          <Tabs
            value={currentTab}
            onChange={(_, newValue) => setCurrentTab(newValue)}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab
              label={`All (${invitations.length})`}
              value="all"
            />
            <Tab
              label={`New (${invitations.filter((inv) => inv.status === "sent").length})`}
              value="sent"
            />
            <Tab
              label={`Viewed (${invitations.filter((inv) => inv.status === "viewed").length})`}
              value="viewed"
            />
            <Tab
              label={`Applied (${invitations.filter((inv) => inv.status === "clicked").length})`}
              value="clicked"
            />
          </Tabs>
        </Card>

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Empty State */}
        {!loading && !error && filteredInvitations.length === 0 && (
          <Card>
            <CardContent sx={{ textAlign: "center", py: 8 }}>
              <WorkIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                {currentTab === "all"
                  ? "No job invitations yet"
                  : `No ${currentTab} invitations`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {currentTab === "all"
                  ? "When companies invite you to apply for jobs, they'll appear here."
                  : ""}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* Invitations List */}
        {!loading && !error && filteredInvitations.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredInvitations.map((invitation) => (
              <Card
                key={invitation.id}
                sx={{
                  border: invitation.status === "sent" ? "2px solid #388560" : "1px solid rgba(0, 0, 0, 0.12)",
                  transition: "box-shadow 0.2s",
                  "&:hover": {
                    boxShadow: "0 4px 12px rgba(56, 133, 96, 0.15)",
                  },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  {/* Header */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                        {getStatusChip(invitation.status)}
                        <Typography variant="caption" color="text.secondary">
                          <AccessTimeIcon sx={{ fontSize: 14, verticalAlign: "middle", mr: 0.5 }} />
                          {formatDateTime(invitation.sentAt)}
                        </Typography>
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {invitation.job?.name || "Job Posting (Deleted)"}
                      </Typography>
                      {invitation.company && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                          <BusinessIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                          <Typography variant="body2" color="text.secondary">
                            {invitation.company.companyName}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* Job Details */}
                  {invitation.job && (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: "pre-wrap" }}>
                        {invitation.job.description.length > 200
                          ? `${invitation.job.description.substring(0, 200)}...`
                          : invitation.job.description}
                      </Typography>

                      {invitation.job.majorsAssociated && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="caption" fontWeight="600" color="#388560">
                            Required Skills:
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {invitation.job.majorsAssociated}
                          </Typography>
                        </Box>
                      )}
                    </>
                  )}

                  {/* Personal Message */}
                  {invitation.message && (
                    <Box
                      sx={{
                        bgcolor: "rgba(56, 133, 96, 0.05)",
                        border: "1px solid rgba(56, 133, 96, 0.2)",
                        borderRadius: 1,
                        p: 2,
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                        <PersonIcon sx={{ fontSize: 16, color: "#388560" }} />
                        <Typography variant="caption" fontWeight="600" color="#388560">
                          {invitation.sender
                            ? `${invitation.sender.firstName} ${invitation.sender.lastName}`
                            : "Representative"}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                        "{invitation.message}"
                      </Typography>
                    </Box>
                  )}

                  <Divider sx={{ my: 2 }} />

                  {/* Actions */}
                  <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    <Button
                      variant="outlined"
                      onClick={() => handleViewJob(invitation)}
                      sx={{
                        borderColor: "#388560",
                        color: "#388560",
                        "&:hover": {
                          borderColor: "#2d6b4d",
                          bgcolor: "rgba(56, 133, 96, 0.05)",
                        },
                      }}
                    >
                      View Full Details
                    </Button>
                    {invitation.job?.applicationLink && (
                      <Button
                        variant="contained"
                        endIcon={<LaunchIcon />}
                        onClick={() => handleApplyClick(invitation)}
                        sx={{
                          background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                          "&:hover": {
                            background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                          },
                        }}
                      >
                        Apply Now
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}
