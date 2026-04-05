import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Chip,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { authUtils } from '../../utils/auth';

interface TimeSlot {
  startTime: number;
  endTime: number;
  status: string;
}

interface CallInvitation {
  inviteId: string;
  callId: string;
  empName: string;
  empEmail: string;
  companyName: string;
  proposedTimes: TimeSlot[];
  status: 'pending' | 'accepted' | 'declined';
  jitsiRoom: string;
  streamChatChannelId: string;
  createdAt: number;
}

interface CallInvitationsListProps {
  onJoinCall?: (callId: string, jitsiRoom: string, channelId: string) => void;
}

function invitationStatusChipColor(
  status: CallInvitation['status']
): 'success' | 'error' | 'warning' {
  if (status === 'accepted') return 'success';
  if (status === 'declined') return 'error';
  return 'warning';
}

/**
 * CallInvitationsList Component - Shows student's call invitations
 */
export function CallInvitationsList({ onJoinCall }: Readonly<CallInvitationsListProps>) {
  const [invitations, setInvitations] = useState<CallInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<CallInvitation | null>(null);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch invitations
  useEffect(() => {
    const fetchInvitations = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = await authUtils.getIdToken();
        const response = await fetch('/api/calls/my-invitations', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch invitations');
        }

        const data = await response.json();
        setInvitations(data.invitations || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Fetch invitations error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvitations();
  }, []);

  // Handle response
  const handleRespond = async (response: 'accepted' | 'declined') => {
    if (!selectedInvite || selectedTimeIndex === null) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const token = await authUtils.getIdToken();
      const responseData = await fetch(
        `/api/calls/${selectedInvite.callId}/respond`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            response,
            acceptedTimeIndex: response === 'accepted' ? selectedTimeIndex : undefined,
            inviteId: selectedInvite.inviteId,
          }),
        }
      );

      if (!responseData.ok) {
        const data = await responseData.json();
        throw new Error(data.error || 'Failed to respond');
      }

      // Update local state
      setInvitations((prev) => {
        const updated = prev.map((inv) => {
          if (inv.inviteId === selectedInvite.inviteId) {
            return { ...inv, status: response };
          }
          return inv;
        });
        return updated;
      });

      // If accepted, offer to join
      if (response === 'accepted') {
        onJoinCall?.(
          selectedInvite.callId,
          selectedInvite.jitsiRoom,
          selectedInvite.streamChatChannelId
        );
      }

      setSelectedInvite(null);
      setSelectedTimeIndex(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Respond error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', boxShadow: 2 }}>
      <CardHeader 
        title="Call Invitations" 
        titleTypographyProps={{ variant: 'h6', sx: { fontWeight: 600 } }}
        sx={{ bgcolor: 'rgba(33, 150, 243, 0.05)', borderBottom: '1px solid #e0e0e0' }}
      />

      <CardContent sx={{ flex: 1, overflow: 'auto' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : invitations.length === 0 ? (
          <Alert severity="info">
            No call invitations yet. Check back soon!
          </Alert>
        ) : (
          <List disablePadding>
            {invitations.map((invite) => (
              <ListItem
                key={invite.inviteId}
                disablePadding
                divider
                onClick={() => setSelectedInvite(invite)}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(33, 150, 243, 0.05)' } }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{invite.empName}</span>
                      <Chip
                        label={invite.companyName}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={invite.status}
                        size="small"
                        color={invitationStatusChipColor(invite.status)}
                      />
                    </Stack>
                  }
                  secondary={
                    <Box component="div" sx={{ mt: 1 }}>
                      <Typography variant="body2" color="textSecondary">
                        {invite.proposedTimes.length} proposed time slot
                        {invite.proposedTimes.length === 1 ? '' : 's'}:
                      </Typography>
                      {invite.proposedTimes.map((time, idx) => (
                        <div key={idx} style={{ fontSize: '0.85em', color: '#666', marginTop: '4px' }}>
                          {formatTime(time.startTime)} - {formatTime(time.endTime)}
                        </div>
                      ))}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>

      {/* Invitation Details Dialog */}
      <Dialog
        open={!!selectedInvite}
        onClose={() => {
          setSelectedInvite(null);
          setSelectedTimeIndex(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        {selectedInvite && (
          <>
            <DialogTitle>
              Call from {selectedInvite.empName} ({selectedInvite.companyName})
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              {selectedInvite.status !== 'pending' ? (
                <Alert severity="info">
                  You have{' '}
                  <strong>{selectedInvite.status}</strong> this call invitation.
                </Alert>
              ) : (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    Select a time slot:
                  </Typography>
                  <Stack spacing={1}>
                    {selectedInvite.proposedTimes.map((time, idx) => (
                      <Button
                        key={idx}
                        variant={selectedTimeIndex === idx ? 'contained' : 'outlined'}
                        onClick={() => setSelectedTimeIndex(idx)}
                        disabled={isSubmitting}
                      >
                        {formatTime(time.startTime)} - {formatTime(time.endTime)}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setSelectedInvite(null);
                  setSelectedTimeIndex(null);
                }}
                disabled={isSubmitting}
              >
                Close
              </Button>
              {selectedInvite.status === 'pending' && selectedTimeIndex !== null && (
                <>
                  <Button
                    onClick={() => handleRespond('declined')}
                    color="error"
                    disabled={isSubmitting}
                  >
                    Decline
                  </Button>
                  <Button
                    onClick={() => handleRespond('accepted')}
                    variant="contained"
                    startIcon={<CheckIcon />}
                    disabled={isSubmitting}
                  >
                    Accept
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Card>
  );
}
