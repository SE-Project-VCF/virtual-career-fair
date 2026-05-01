import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  ListItemText,
  Chip,
  Tabs,
  Tab,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import WorkIcon from "@mui/icons-material/Work";
import VideoCallIcon from "@mui/icons-material/VideoCall";
import { authUtils } from "../utils/auth";
import { auth } from "../firebase";
import { API_URL } from "../config";

interface JobInvitation {
  id: string;
  jobId: string;
  status: string;
  sentAt: number;
  job: {
    name: string;
  } | null;
  company: {
    companyName: string;
  } | null;
}

interface VideoCallInvitation {
  id: string;
  employerId: string;
  employerName: string;
  employerCompanyName: string;
  studentId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  scheduledTime: number;
  jitsiRoom: string;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const user = authUtils.getCurrentUser();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [jobInvitations, setJobInvitations] = useState<JobInvitation[]>([]);
  const [videoCallInvitations, setVideoCallInvitations] = useState<VideoCallInvitation[]>([]);
  const [unreadJobCount, setUnreadJobCount] = useState(0);
  const [unreadVideoCount, setUnreadVideoCount] = useState(0);
  const [selectedTab, setSelectedTab] = useState(0);

  const open = Boolean(anchorEl);

  const fetchJobInvitations = useCallback(async () => {
    const currentUser = authUtils.getCurrentUser();
    if (currentUser?.role !== "student") return;

    try {
      const token = await authUtils.getIdToken();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/job-invitations/received?userId=${currentUser.uid}&status=sent`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const newInvitations = data.invitations || [];
        setJobInvitations(newInvitations.slice(0, 5));
        setUnreadJobCount(newInvitations.length);
      }
    } catch (err) {
      console.error("Error fetching job notifications:", err);
    }
  }, []);

  const fetchVideoCallInvitations = useCallback(async () => {
    const currentUser = authUtils.getCurrentUser();
    if (currentUser?.role !== "student") return;

    try {
      const token = await currentUser.getIdToken?.();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/call-invitations/incoming`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const invitations = data.invitations || [];
        const pendingInvites = invitations.filter(
          (inv: VideoCallInvitation) => inv.status === 'pending'
        );
        // Convert timestamp to milliseconds if needed
        const invitesWithTime = pendingInvites.map((inv: VideoCallInvitation) => ({
          ...inv,
          createdAt: typeof inv.createdAt === 'object' ? (inv.createdAt as any).toMillis?.() || Date.now() : inv.createdAt || Date.now(),
        }));
        setVideoCallInvitations(invitesWithTime.slice(0, 5));
        setUnreadVideoCount(pendingInvites.length);
      }
    } catch (err) {
      console.error("Error fetching video call notifications:", err);
    }
  }, []);

  useEffect(() => {
    if (user?.uid && user?.role === "student") {
      fetchJobInvitations();
      fetchVideoCallInvitations();

      const interval = setInterval(() => {
        fetchJobInvitations();
        fetchVideoCallInvitations();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [user?.uid, user?.role, fetchJobInvitations, fetchVideoCallInvitations]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  const handleViewAll = () => {
    handleClose();
    if (selectedTab === 0) {
      navigate("/dashboard/job-invitations");
    } else {
      navigate("/dashboard/call-invitations");
    }
  };

  const handleJobInvitationClick = () => {
    handleClose();
    navigate("/dashboard/job-invitations");
  };

  const handleVideoCallClick = () => {
    handleClose();
    navigate("/dashboard/call-invitations");
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Only show for students
  if (user?.role !== "student") {
    return null;
  }

  const totalUnread = unreadJobCount + unreadVideoCount;

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        sx={{
          color: "white",
          "&:hover": {
            bgcolor: "rgba(255, 255, 255, 0.1)",
          },
        }}
      >
        <Badge badgeContent={totalUnread} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              width: 400,
              maxHeight: 520,
              mt: 1.5,
            },
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, bgcolor: "rgba(176, 58, 108, 0.05)" }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Notifications
          </Typography>
          {totalUnread > 0 && (
            <Typography variant="caption" color="text.secondary">
              {totalUnread} new notification{totalUnread === 1 ? '' : 's'}
            </Typography>
          )}
        </Box>

        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          sx={{
            borderBottom: "1px solid #e0e0e0",
          }}
          variant="fullWidth"
        >
          <Tab 
            label={`Jobs (${unreadJobCount})`} 
            icon={<WorkIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{ py: 1, minHeight: 'auto' }}
          />
          <Tab 
            label={`Calls (${unreadVideoCount})`}
            icon={<VideoCallIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{ py: 1, minHeight: 'auto' }}
          />
        </Tabs>

        {/* Job Invitations Tab */}
        {selectedTab === 0 && (
          jobInvitations.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <WorkIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No new job invitations
              </Typography>
            </Box>
          ) : (
            [
              jobInvitations.map((invitation) => (
                <MenuItem
                  key={invitation.id}
                  onClick={handleJobInvitationClick}
                  sx={{
                    py: 1.5,
                    px: 2,
                    borderLeft: "3px solid #b03a6c",
                    "&:hover": {
                      bgcolor: "rgba(176, 58, 108, 0.08)",
                    },
                  }}
                >
                  <WorkIcon sx={{ mr: 1.5, color: "#b03a6c", flexShrink: 0 }} />
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {invitation.job?.name || "Job Opportunity"}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {invitation.company?.companyName || "Company"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTime(invitation.sentAt)}
                        </Typography>
                      </Box>
                    }
                  />
                  <Chip label="New" size="small" color="primary" sx={{ ml: 1, flexShrink: 0 }} />
                </MenuItem>
              )),
              <Divider key="job-divider" />,
              <MenuItem
                key="view-all-jobs"
                onClick={handleViewAll}
                sx={{
                  py: 1.5,
                  justifyContent: "center",
                  color: "#b03a6c",
                  fontWeight: 600,
                  "&:hover": {
                    bgcolor: "rgba(176, 58, 108, 0.08)",
                  },
                }}
              >
                View All Job Invitations
              </MenuItem>
            ]
          )
        )}

        {/* Video Call Invitations Tab */}
        {selectedTab === 1 && (
          videoCallInvitations.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <VideoCallIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No new call invitations
              </Typography>
            </Box>
          ) : (
            [
              videoCallInvitations.map((invitation) => (
                <MenuItem
                  key={invitation.id}
                  onClick={handleVideoCallClick}
                  sx={{
                    py: 1.5,
                    px: 2,
                    borderLeft: "3px solid #2196F3",
                    "&:hover": {
                      bgcolor: "rgba(33, 150, 243, 0.08)",
                    },
                  }}
                >
                  <VideoCallIcon sx={{ mr: 1.5, color: "#2196F3", flexShrink: 0 }} />
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {invitation.employerName || "Employer"}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {invitation.employerCompanyName || "Company"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTime(invitation.createdAt)}
                        </Typography>
                      </Box>
                    }
                  />
                  <Chip label="New" size="small" color="info" sx={{ ml: 1, flexShrink: 0 }} />
                </MenuItem>
              )),
              <Divider key="call-divider" />,
              <MenuItem
                key="view-all-calls"
                onClick={handleViewAll}
                sx={{
                  py: 1.5,
                  justifyContent: "center",
                  color: "#2196F3",
                  fontWeight: 600,
                  "&:hover": {
                    bgcolor: "rgba(33, 150, 243, 0.08)",
                  },
                }}
              >
                View All Call Invitations
              </MenuItem>
            ]
          )
        )}
      </Menu>
    </>
  );
}

