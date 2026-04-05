import { Card, CardContent, Box, Typography, Button, Stack, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import VideocamIcon from '@mui/icons-material/Videocam';
import { type CallInvitation } from '../../utils/callInvitationApi';

interface CallInvitationCardProps {
  invitation: CallInvitation;
  isEmployer?: boolean;
  onAccept?: (invitationId: string) => void;
  onDecline?: (invitationId: string) => void;
  onCancel?: (invitationId: string) => void;
  onJoin?: (invitationId: string) => void;
  loading?: boolean;
}

export function CallInvitationCard({
  invitation,
  isEmployer = false,
  onAccept,
  onDecline,
  onCancel,
  onJoin,
  loading = false,
}: Readonly<CallInvitationCardProps>) {
  const scheduledDate = new Date(invitation.scheduledTime);
  const now = new Date();
  const timeUntilStart = scheduledDate.getTime() - now.getTime();
  const minutesUntilStart = Math.floor(timeUntilStart / (1000 * 60));

  const endTime = new Date(scheduledDate.getTime() + invitation.duration * 60 * 1000);
  const timeUntilEnd = endTime.getTime() - now.getTime();
  const minutesUntilEnd = Math.floor(timeUntilEnd / (1000 * 60));

  const isUpcoming = timeUntilStart > 0;
  const isActive = timeUntilStart <= 0 && timeUntilEnd > 0;
  const isPast = timeUntilEnd <= 0;

  const canJoin = invitation.status === 'accepted' && timeUntilStart <= 15 * 60 * 1000 && timeUntilEnd > 0;

  const getStatusColor = () => {
    if (invitation.status === 'pending') return 'warning';
    if (invitation.status === 'accepted') return 'success';
    if (invitation.status === 'declined') return 'error';
    if (invitation.status === 'cancelled') return 'error';
    return 'default';
  };

  const getStatusLabel = () => {
    if (isActive) return '🔴 LIVE';
    if (invitation.status === 'pending') return 'Pending';
    if (invitation.status === 'accepted') return 'Accepted';
    if (invitation.status === 'declined') return 'Declined';
    if (invitation.status === 'cancelled') return 'Cancelled';
    return invitation.status;
  };

  let joinButtonLabel = 'Join Call';
  if (isActive) {
    joinButtonLabel = 'Join Now';
  } else if (isUpcoming && canJoin) {
    joinButtonLabel = 'Join Call';
  } else if (isUpcoming) {
    joinButtonLabel = `Available in ${Math.max(0, minutesUntilStart)}m`;
  }

  return (
    <Card sx={{ mb: 2, boxShadow: 1 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              {isEmployer ? invitation.studentName : invitation.employerCompanyName}
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              {isEmployer ? `Student` : invitation.employerName}
            </Typography>
            {invitation.description && (
              <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic', color: '#666' }}>
                "{invitation.description}"
              </Typography>
            )}
          </Box>
          <Chip label={getStatusLabel()} color={getStatusColor() as any} size="small" />
        </Stack>

        <Stack direction="row" spacing={3} sx={{ color: 'textSecondary', fontSize: '0.9rem', mb: 2 }}>
          <Box>
            <strong>Date:</strong> {scheduledDate.toLocaleString()}
          </Box>
          <Box>
            <strong>Duration:</strong> {invitation.duration} min
          </Box>
        </Stack>

        {isUpcoming && invitation.status === 'accepted' && (
          <Typography variant="body2" sx={{ mb: 2, color: '#f57c00', fontWeight: 600 }}>
            Starts in {minutesUntilStart > 60 ? Math.floor(minutesUntilStart / 60) + 'h ' : ''}
            {minutesUntilStart % 60}m
          </Typography>
        )}

        {isActive && invitation.status === 'accepted' && (
          <Typography variant="body2" sx={{ mb: 2, color: '#d32f2f', fontWeight: 600 }}>
            🔴 Call in Progress - Ends in {Math.max(0, minutesUntilEnd)}m
          </Typography>
        )}

        {isPast && <Typography variant="body2" sx={{ mb: 2, color: '#9e9e9e' }}>Call ended</Typography>}

        {/* Student Actions */}
        {!isEmployer && invitation.status === 'pending' && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => onAccept?.(invitation.id)}
              disabled={loading}
              size="small"
            >
              Accept
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<CancelIcon />}
              onClick={() => onDecline?.(invitation.id)}
              disabled={loading}
              size="small"
            >
              Decline
            </Button>
          </Stack>
        )}

        {/* Join Button (both student and employer, when applicable) */}
        {invitation.status === 'accepted' && (
          <Button
            variant="contained"
            startIcon={<VideocamIcon />}
            onClick={() => onJoin?.(invitation.id)}
            disabled={!canJoin || loading}
            sx={{
              background: isActive ? 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)' : 'linear-gradient(135deg, #388560 0%, #2d6b4d 100%)',
              fontWeight: 600,
            }}
            size="small"
          >
            {joinButtonLabel}
          </Button>
        )}

        {/* Employer Actions */}
        {isEmployer && invitation.status === 'pending' && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelIcon />}
            onClick={() => onCancel?.(invitation.id)}
            disabled={loading}
            size="small"
          >
            Cancel
          </Button>
        )}

        {isEmployer && invitation.status === 'accepted' && !isPast && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelIcon />}
            onClick={() => onCancel?.(invitation.id)}
            disabled={loading || isActive}
            size="small"
          >
            {isActive ? 'Call in Progress' : 'Cancel'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
