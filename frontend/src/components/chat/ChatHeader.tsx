import { Box, Typography, IconButton, Tooltip } from "@mui/material";
import AddCommentIcon from "@mui/icons-material/AddComment";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface ChatHeaderProps {
  title: string;
  onNewChat?: () => void;
  onBack?: () => void;  // ⭐ NEW
}

const ChatHeader = ({ title, onNewChat, onBack }: ChatHeaderProps) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 3,
        py: 2,
        borderBottom: "1px solid rgba(0,0,0,0.1)",
        background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
        color: "white",
      }}
    >
      {/* LEFT SIDE: Back button + Title */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {onBack && (
          <Tooltip title="Back to Dashboard">
            <IconButton
              onClick={onBack}
              sx={{
                color: "white",
                background: "rgba(255,255,255,0.2)",
                "&:hover": { background: "rgba(255,255,255,0.3)" },
              }}
            >
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
        )}

        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>

      {/* RIGHT SIDE: New Chat Button */}
      {onNewChat && (
        <Tooltip title="Start New Chat">
          <IconButton
            onClick={onNewChat}
            sx={{
              color: "white",
              background: "rgba(255,255,255,0.2)",
              "&:hover": { background: "rgba(255,255,255,0.3)" },
            }}
          >
            <AddCommentIcon />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default ChatHeader;
