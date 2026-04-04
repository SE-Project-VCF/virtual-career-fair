import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Alert,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Chip,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { authUtils } from '../../utils/auth';

interface QASession {
  sessionId: string;
  fairId: string;
  employerName: string;
  title: string;
  description: string;
  scheduledTime: number;
  maxDuration: number;
  isPresentationMode: boolean;
  isLive: boolean;
  jitsiRoom: string;
  streamChatChannelId: string;
  createdAt: number;
}

interface BrowseQASessionsProps {
  fairId?: string;
  onJoinSession?: (sessionId: string, jitsiRoom: string, channelId: string) => void;
}

/**
 * BrowseQASessions Component - Shows available Q&A sessions students can join
 */
export function BrowseQASessionsPage({
  fairId,
  onJoinSession,
}: BrowseQASessionsProps) {
  const [sessions, setSessions] = useState<QASession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<QASession | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  // Fetch sessions
  useEffect(() => {
    const fetchSessions = async () => {
      if (!fairId) {
        setError('Fair ID is missing');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const token = await authUtils.getIdToken();
        const response = await fetch(`/api/sessions/active/${fairId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch sessions');
        }

        const data = await response.json();
        setSessions(data.sessions || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Fetch sessions error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, [fairId]);

  const handleJoin = async () => {
    if (!selectedSession) return;

    try {
      setIsJoining(true);
      const token = await authUtils.getIdToken();
      const response = await fetch(
        `/api/sessions/${selectedSession.sessionId}/join`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to join session');
      }

      onJoinSession?.(
        selectedSession.sessionId,
        selectedSession.jitsiRoom,
        selectedSession.streamChatChannelId
      );

      setSelectedSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Join session error:', err);
    } finally {
      setIsJoining(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {sessions.length === 0 ? (
        <Alert severity="info">
          No active Q&A sessions at the moment. Check back soon!
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {sessions.map((session) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.sessionId}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    boxShadow: 4,
                    transform: 'translateY(-2px)',
                  },
                }}
                onClick={() => setSelectedSession(session)}
              >
                <CardHeader
                  title={session.title}
                  subheader={session.employerName}
                  action={
                    session.isLive ? (
                      <Chip
                        label="LIVE"
                        color="error"
                        size="small"
                        icon={<PlayArrowIcon />}
                      />
                    ) : (
                      <Chip
                        label="Upcoming"
                        color="warning"
                        size="small"
                      />
                    )
                  }
                />
                <CardContent sx={{ flex: 1, pt: 0 }}>
                  {session.description && (
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ mb: 2 }}
                    >
                      {session.description}
                    </Typography>
                  )}

                  <Stack spacing={1}>
                    <Typography variant="caption">
                      <strong>Time:</strong> {formatTime(session.scheduledTime)}
                    </Typography>
                    <Typography variant="caption">
                      <strong>Duration:</strong> {session.maxDuration} minutes
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Chip
                        size="small"
                        label={
                          session.isPresentationMode
                            ? 'Presentation'
                            : 'Q&A'
                        }
                        color={
                          session.isPresentationMode
                            ? 'default'
                            : 'success'
                        }
                        variant={
                          session.isPresentationMode
                            ? 'outlined'
                            : 'filled'
                        }
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Session Details Dialog */}
      <Dialog
        open={!!selectedSession}
        onClose={() => setSelectedSession(null)}
        maxWidth="sm"
        fullWidth
      >
        {selectedSession && (
          <>
            <DialogTitle>{selectedSession.title}</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  <strong>Presenter:</strong> {selectedSession.employerName}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {selectedSession.description || 'No description provided'}
                </Typography>
                <Typography variant="caption">
                  <strong>Scheduled:</strong> {formatTime(selectedSession.scheduledTime)}
                </Typography>
              </Box>

              <Box sx={{ p: 1.5, backgroundColor: '#f0f0f0', borderRadius: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    label={selectedSession.isLive ? 'LIVE NOW' : 'Upcoming'}
                    color={selectedSession.isLive ? 'error' : 'warning'}
                  />
                  <Chip
                    size="small"
                    label={
                      selectedSession.isPresentationMode
                        ? 'Presentation Mode'
                        : 'Q&A Mode'
                    }
                  />
                </Stack>
                <Typography variant="caption" color="textSecondary">
                  {selectedSession.isPresentationMode
                    ? 'This is a presentation. You will be unable to unmute your microphone.'
                    : 'Q&A is open. You can raise your hand to ask questions.'}
                </Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedSession(null)} disabled={isJoining}>
                Cancel
              </Button>
              <Button
                onClick={handleJoin}
                variant="contained"
                disabled={isJoining || !selectedSession.isLive}
                startIcon={<PlayArrowIcon />}
              >
                {isJoining
                  ? 'Joining...'
                  : selectedSession.isLive
                  ? 'Join Now'
                  : 'Not Live Yet'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
