import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
} from '@mui/material';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BaseLayout from '../components/BaseLayout';
import { authUtils } from '../utils/auth';
import { API_URL } from '../config';

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

/**
 * CallInvitationsPage - Student view for managing 1v1 call invitations
 */
export default function CallInvitationsPage() {
  const navigate = useNavigate();
  const user = authUtils.getCurrentUser();
  const [invitations, setInvitations] = useState<CallInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<CallInvitation | null>(null);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch invitations
  useEffect(() => {
    if (user?.role !== 'student') {
      navigate('/dashboard');
      return;
    }

    const fetchInvitations = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = await user.getIdToken?.();
        if (!token) return;

        const response = await fetch(`${API_URL}/api/calls/my-invitations`, {
          headers: {
            'Content-Type': 'application/json',
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
  }, [user, navigate]);

  const handleRespond = async (response: 'accepted' | 'declined') => {
    if (!selectedInvite || selectedTimeIndex === null) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const token = await user?.getIdToken?.();
      if (!token) return;

      const responseData = await fetch(
        `${API_URL}/api/calls/${selectedInvite.callId}/respond`,
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
      setInvitations((prev) =>
        prev.map((inv) => {
          if (inv.inviteId === selectedInvite.inviteId) {
            return { ...inv, status: response };
          }
          return inv;
        })
      );

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'success';
      case 'declined':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getPendingCount = () => invitations.filter((inv) => inv.status === 'pending').length;

  return (
    <BaseLayout pageTitle="Call Invitations">
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <VideoCallIcon sx={{ fontSize: 32, color: '#2196F3' }} />
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                1v1 Call Invitations
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Manage your scheduled calls with employers
              </Typography>
            </Box>
          </Stack>
          {getPendingCount() > 0 && (
            <Chip
              label={`${getPendingCount()} pending invitation${getPendingCount() !== 1 ? 's' : ''}`}
              color="warning"
              icon={<AccessTimeIcon />}
            />
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : invitations.length === 0 ? (
          <Card sx={{ textAlign: 'center', py: 8 }}>
            <VideoCallIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="textSecondary" sx={{ mb: 1 }}>
              No call invitations yet
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Employers will send you call invitations when they're interested in speaking with you.
            </Typography>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {invitations.map((invite) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={invite.inviteId}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: 2,
                    borderLeft: `4px solid ${
                      invite.status === 'accepted'
                        ? '#4CAF50'
                        : invite.status === 'declined'
                        ? '#f44336'
                        : '#2196F3'
                    }`,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      boxShadow: 4,
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <CardHeader
                    title={invite.empName}
                    subheader={invite.companyName}
                    action={
                      <Chip
                        label={invite.status}
                        size="small"
                        color={getStatusColor(invite.status)}
                        variant={invite.status === 'pending' ? 'outlined' : 'filled'}
                      />
                    }
                    sx={{
                      bgcolor: 'rgba(33, 150, 243, 0.05)',
                      borderBottom: '1px solid #e0e0e0',
                    }}
                  />
                  <CardContent sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                      Proposed Times:
                    </Typography>
                    <Stack spacing={1} sx={{ mb: 2 }}>
                      {invite.proposedTimes.map((time, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            p: 1,
                            bgcolor: '#f5f5f5',
                            borderRadius: 1,
                            borderLeft: `3px solid #2196F3`,
                          }}
                        >
                          <Typography variant="caption" color="textSecondary">
                            Option {idx + 1}
                          </Typography>
                          <Typography variant="body2">
                            {formatTime(time.startTime)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            - {formatTime(time.endTime)}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                  {invite.status === 'pending' && (
                    <Box
                      sx={{
                        p: 2,
                        borderTop: '1px solid #e0e0e0',
                        bgcolor: 'rgba(33, 150, 243, 0.02)',
                      }}
                    >
                      <Button
                        fullWidth
                        variant="contained"
                        sx={{
                          bgcolor: '#2196F3',
                          '&:hover': { bgcolor: '#1976D2' },
                        }}
                        onClick={() => setSelectedInvite(invite)}
                      >
                        Respond to Invitation
                      </Button>
                    </Box>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      {/* Invitation Response Dialog */}
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
            <DialogTitle sx={{ bgcolor: 'rgba(33, 150, 243, 0.05)', fontWeight: 600 }}>
              Respond to Invitation from {selectedInvite.empName}
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
              {selectedInvite.status !== 'pending' ? (
                <Alert severity="info">
                  You have <strong>{selectedInvite.status}</strong> this call invitation.
                </Alert>
              ) : (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                    Select a time slot:
                  </Typography>
                  <Stack spacing={1.5}>
                    {selectedInvite.proposedTimes.map((time, idx) => (
                      <Button
                        key={idx}
                        variant={selectedTimeIndex === idx ? 'contained' : 'outlined'}
                        onClick={() => setSelectedTimeIndex(idx)}
                        disabled={isSubmitting}
                        sx={{
                          p: 2,
                          textAlign: 'left',
                          justifyContent: 'flex-start',
                          ...(selectedTimeIndex === idx && {
                            bgcolor: '#2196F3',
                            '&:hover': { bgcolor: '#1976D2' },
                          }),
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Option {idx + 1}
                          </Typography>
                          <Typography variant="caption">
                            {formatTime(time.startTime)} - {formatTime(time.endTime)}
                          </Typography>
                        </Box>
                      </Button>
                    ))}
                  </Stack>
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
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
                    variant="outlined"
                    disabled={isSubmitting}
                    startIcon={<CloseIcon />}
                  >
                    Decline
                  </Button>
                  <Button
                    onClick={() => handleRespond('accepted')}
                    variant="contained"
                    sx={{ bgcolor: '#4CAF50', '&:hover': { bgcolor: '#45a049' } }}
                    disabled={isSubmitting}
                    startIcon={<CheckIcon />}
                  >
                    Accept
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </BaseLayout>
  );
}
