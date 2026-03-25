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
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import WorkIcon from "@mui/icons-material/Work";
import { authUtils } from "../utils/auth";
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

export default function NotificationBell() {
  const navigate = useNavigate();
  const user = authUtils.getCurrentUser();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [invitations, setInvitations] = useState<JobInvitation[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const open = Boolean(anchorEl);

  const fetchInvitations = useCallback(async () => {
    const currentUser = authUtils.getCurrentUser();
    if (currentUser?.role !== "student") return;

    try {
      const response = await fetch(
        `${API_URL}/api/job-invitations/received?userId=${currentUser.uid}&status=sent`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const newInvitations = data.invitations || [];
        setInvitations(newInvitations.slice(0, 5)); // Show only 5 most recent
        setUnreadCount(newInvitations.length);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }, []);

  useEffect(() => {
    if (user?.uid && user?.role === "student") {
      fetchInvitations();

      const interval = setInterval(fetchInvitations, 15000);
      return () => clearInterval(interval);
    }
  }, [user?.uid, user?.role, fetchInvitations]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleViewAll = () => {
    handleClose();
    navigate("/dashboard/job-invitations");
  };

  const handleInvitationClick = () => {
    handleClose();
    navigate("/dashboard/job-invitations");
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

  const invitationLabel = unreadCount === 1 ? "invitation" : "invitations";

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
        <Badge badgeContent={unreadCount} color="error">
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
              width: 360,
              maxHeight: 480,
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
            Job Invitations
          </Typography>
          {unreadCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              {unreadCount} new {invitationLabel}
            </Typography>
          )}
        </Box>

        <Divider />

        {/* Notifications List */}
        {invitations.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <NotificationsIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No new invitations
            </Typography>
          </Box>
        ) : (
          [
            invitations.map((invitation) => (
              <MenuItem
                key={invitation.id}
                onClick={handleInvitationClick}
                sx={{
                  py: 1.5,
                  px: 2,
                  borderLeft: "3px solid #b03a6c",
                  "&:hover": {
                    bgcolor: "rgba(176, 58, 108, 0.08)",
                  },
                }}
              >
                <WorkIcon sx={{ mr: 1.5, color: "#b03a6c" }} />
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
                <Chip label="New" size="small" color="primary" sx={{ ml: 1 }} />
              </MenuItem>
            )),
            <Divider key="divider" />,
            <MenuItem
              key="view-all"
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
              View All Invitations
            </MenuItem>
          ]
        )}
      </Menu>
    </>
  );
}
