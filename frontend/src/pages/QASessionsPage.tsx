import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Stack,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Chip,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LaunchIcon from '@mui/icons-material/Launch';
import BaseLayout from '../components/BaseLayout';
import { authUtils } from '../utils/auth';
import { API_URL } from '../config';

interface Booth {
  id: string;
  name: string;
  fairId: string;
  fairName: string;
}

interface QASession {
  sessionId: string;
  boothId: string;
  boothName: string;
  fairName: string;
  title: string;
  description?: string;
  scheduledTime: string;
  duration: number;
  createdAt: string;
}

export default function QASessionsPage() {
  const [booths, setBooths] = useState<Booth[]>([]);
  const [sessions, setSessions] = useState<QASession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create session dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState({
    title: '',
    description: '',
    scheduledTime: '',
    duration: 60,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete session dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<QASession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit session dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<QASession | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    scheduledTime: '',
    duration: 60,
  });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchBooths();
    fetchSessions();
  }, []);

  const fetchBooths = async () => {
    try {
      const token = await authUtils.getIdToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/api/employer/booths`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to fetch booths');
      const data = await response.json();
      setBooths(data.booths || []);
    } catch (err) {
      console.error('Fetch booths error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load booths');
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const token = await authUtils.getIdToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/employer/qa-sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Fetch sessions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateDialog = (boothId: string) => {
    setSelectedBoothId(boothId);
    setSessionForm({ title: '', description: '', scheduledTime: '', duration: 60 });
    setCreateDialogOpen(true);
  };

  const handleCreateSession = async () => {
    try {
      if (!selectedBoothId) return;
      if (!sessionForm.title.trim()) {
        setError('Please enter a session title');
        return;
      }
      if (!sessionForm.scheduledTime) {
        setError('Please select a scheduled time');
        return;
      }
      if (sessionForm.duration <= 0) {
        setError('Duration must be greater than 0');
        return;
      }

      const scheduledTime = new Date(sessionForm.scheduledTime);
      if (scheduledTime <= new Date()) {
        setError('Scheduled time must be in the future');
        return;
      }

      setIsSubmitting(true);
      const token = await authUtils.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${API_URL}/api/booth/${selectedBoothId}/schedule-qa-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: sessionForm.title,
          description: sessionForm.description,
          scheduledTime: scheduledTime.toISOString(),
          duration: sessionForm.duration,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create session');
      }

      setCreateDialogOpen(false);
      setError(null);
      fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;

    try {
      setIsDeleting(true);
      const token = await authUtils.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${API_URL}/api/booth/${sessionToDelete.boothId}/qa-session/${sessionToDelete.sessionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete session');
      }

      setDeleteDialogOpen(false);
      setSessionToDelete(null);
      setError(null);
      fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenEditDialog = (session: QASession) => {
    setSessionToEdit(session);
    // Parse the scheduledTime into a format suitable for datetime-local input
    const date = new Date(session.scheduledTime);
    const isoString = date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    setEditForm({
      title: session.title,
      description: session.description || '',
      scheduledTime: isoString,
      duration: session.duration,
    });
    setEditDialogOpen(true);
  };

  const handleEditSession = async () => {
    if (!sessionToEdit) return;

    try {
      if (!editForm.title.trim()) {
        setError('Please enter a session title');
        return;
      }
      if (!editForm.scheduledTime) {
        setError('Please select a scheduled time');
        return;
      }
      if (editForm.duration <= 0) {
        setError('Duration must be greater than 0');
        return;
      }

      const scheduledTime = new Date(editForm.scheduledTime);
      if (scheduledTime <= new Date()) {
        setError('Scheduled time must be in the future');
        return;
      }

      setIsEditing(true);
      const token = await authUtils.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${API_URL}/api/booth/${sessionToEdit.boothId}/qa-session/${sessionToEdit.sessionId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: editForm.title,
            description: editForm.description,
            scheduledTime: scheduledTime.toISOString(),
            duration: editForm.duration,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update session');
      }

      setEditDialogOpen(false);
      setSessionToEdit(null);
      setError(null);
      fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session');
    } finally {
      setIsEditing(false);
    }
  };

  const formatDate = (dateValue: string | number | null | undefined) => {
    if (!dateValue) return "Invalid date";
    try {
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return "Invalid date";
      return date.toLocaleString();
    } catch {
      return "Invalid date";
    }
  };

  return (
    <BaseLayout>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a', mb: 1 }}>
            📹 Q&A Sessions Manager
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Create and manage Q&A sessions for your booths. Sessions appear in booth views for students to join within 15 minutes of start time.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Available Booths */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#1a1a1a' }}>
                Your Booths
              </Typography>
              {booths.length === 0 ? (
                <Alert severity="info">
                  You don't have any booths yet. Create a booth to schedule Q&A sessions.
                </Alert>
              ) : (
                <Grid container spacing={2}>
                  {booths.map((booth) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={booth.id}>
                      <Card
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: 2,
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: 4,
                            transform: 'translateY(-2px)',
                          },
                        }}
                      >
                        <CardHeader
                          title={booth.name}
                          subheader={booth.fairName}
                          sx={{ pb: 1 }}
                        />
                        <CardContent sx={{ flex: 1, pb: 1 }}>
                          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                            Booth ID: {booth.id}
                          </Typography>
                          <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => handleOpenCreateDialog(booth.id)}
                            fullWidth
                            sx={{
                              background: 'linear-gradient(135deg, #388560 0%, #2d6b4d 100%)',
                              fontWeight: 600,
                            }}
                          >
                            Schedule Session
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>

            {/* Scheduled Sessions */}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#1a1a1a' }}>
                Scheduled Sessions ({sessions.length})
              </Typography>
              {sessions.length === 0 ? (
                <Alert severity="info">
                  No Q&A sessions scheduled yet. Click "Schedule Session" on a booth to create one.
                </Alert>
              ) : (
                <Grid container spacing={2}>
                  {sessions.map((session) => {
                    // Convert scheduledTime to proper Date object
                    const scheduledDate = new Date(session.scheduledTime);

                    const isValidDate = !Number.isNaN(scheduledDate.getTime());
                    const now = new Date();
                    let isUpcoming = false;
                    let isActive = false;
                    let minutesUntilStart = 0;
                    let minutesUntilEnd = 0;
                    let canJoin = false;

                    if (isValidDate) {
                      const timeUntilStart = scheduledDate.getTime() - now.getTime();
                      const endDate = new Date(scheduledDate.getTime() + session.duration * 60 * 1000);
                      const timeUntilEnd = endDate.getTime() - now.getTime();
                      
                      minutesUntilStart = Math.floor(timeUntilStart / (1000 * 60));
                      minutesUntilEnd = Math.floor(timeUntilEnd / (1000 * 60));
                      
                      isUpcoming = timeUntilStart > 0;
                      isActive = timeUntilStart <= 0 && timeUntilEnd > 0;
                      
                      // Can join from 15 mins before start through entire duration
                      canJoin = minutesUntilStart <= 15 && timeUntilEnd > 0;
                    }

                    let sessionStatusLabel = 'Ended';
                    let sessionStatusColor: 'error' | 'warning' | 'default' = 'default';
                    if (isActive) {
                      sessionStatusLabel = '🔴 LIVE';
                      sessionStatusColor = 'error';
                    } else if (isUpcoming) {
                      sessionStatusLabel = 'Upcoming';
                      sessionStatusColor = 'warning';
                    }

                    const joinButtonLabel = (() => {
                      if (isActive) return 'Join Now';
                      if (isUpcoming && canJoin) return 'Join Session';
                      if (isUpcoming) return `Available in ${Math.max(0, minutesUntilStart)}m`;
                      return 'Session Ended';
                    })();

                    return (
                      <Grid size={{ xs: 12 }} key={session.sessionId}>
                        <Card sx={{ boxShadow: 1 }}>
                          <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                                  {session.title}
                                </Typography>
                                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                                  {session.fairName} • {session.boothName}
                                </Typography>
                                {session.description && (
                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                    {session.description}
                                  </Typography>
                                )}
                              </Box>
                              <Stack direction="row" gap={1}>
                                <Chip
                                  label={sessionStatusLabel}
                                  color={sessionStatusColor}
                                  size="small"
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenEditDialog(session)}
                                  sx={{ color: '#1976d2' }}
                                  title="Edit session"
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setSessionToDelete(session);
                                    setDeleteDialogOpen(true);
                                  }}
                                  sx={{ color: '#d32f2f' }}
                                  title="Delete session"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </Stack>
                            <Stack direction="row" spacing={3} sx={{ color: 'textSecondary', fontSize: '0.9rem', mb: 2 }}>
                              <Box>
                                <strong>Time:</strong> {formatDate(session.scheduledTime)}
                              </Box>
                              <Box>
                                <strong>Duration:</strong> {session.duration} minutes
                              </Box>
                              {isUpcoming && (
                                <Box>
                                  <strong>In:</strong> {minutesUntilStart > 60 
                                    ? `${Math.floor(minutesUntilStart / 60)}h ${minutesUntilStart % 60}m`
                                    : `${minutesUntilStart}m`}
                                </Box>
                              )}
                              {isActive && (
                                <Box sx={{ color: '#d32f2f', fontWeight: 600 }}>
                                  <strong>Ends in:</strong> {Math.max(0, minutesUntilEnd)}m
                                </Box>
                              )}
                            </Stack>
                            {/* Join Link */}
                            <Button
                              variant="outlined"
                              endIcon={<LaunchIcon />}
                              onClick={() => globalThis.open(`/qa-session/${session.boothId}`, '_blank')}
                              disabled={!canJoin}
                              size="small"
                              sx={{ 
                                color: isActive ? '#d32f2f' : '#388560', 
                                borderColor: isActive ? '#d32f2f' : '#388560' 
                              }}
                            >
                              {joinButtonLabel}
                            </Button>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>
          </>
        )}

        {/* Create Session Dialog */}
        <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: 'rgba(76, 175, 80, 0.05)', fontWeight: 600 }}>
            Schedule Q&A Session
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Session Title"
                value={sessionForm.title}
                onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
                placeholder="e.g., Company Overview & Q&A"
              />
              <TextField
                fullWidth
                label="Description (optional)"
                value={sessionForm.description}
                onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
                placeholder="Describe what you'll cover"
                multiline
                rows={3}
              />
              <TextField
                fullWidth
                label="Scheduled Date & Time"
                type="datetime-local"
                value={sessionForm.scheduledTime}
                onChange={(e) => setSessionForm({ ...sessionForm, scheduledTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="Duration (minutes)"
                type="number"
                value={sessionForm.duration}
                onChange={(e) => setSessionForm({ ...sessionForm, duration: Number.parseInt(e.target.value, 10) || 60 })}
                inputProps={{ min: 5, max: 480 }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateSession}
              variant="contained"
              disabled={isSubmitting}
              sx={{ background: 'linear-gradient(135deg, #388560 0%, #2d6b4d 100%)' }}
            >
              {isSubmitting ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Session Dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: 'rgba(211, 47, 47, 0.05)', fontWeight: 600 }}>
            Delete Q&A Session
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Typography>
              Are you sure you want to delete the session "<strong>{sessionToDelete?.title}</strong>"? This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleDeleteSession}
              variant="contained"
              disabled={isDeleting}
              sx={{ background: '#d32f2f' }}
            >
              {isDeleting ? 'Deleting...' : 'Delete Session'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Session Dialog */}
        <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: 'rgba(25, 118, 210, 0.05)', fontWeight: 600 }}>
            Edit Q&A Session
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Session Title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="e.g., Company Overview & Q&A"
              />
              <TextField
                fullWidth
                label="Description (optional)"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Describe what you'll cover"
                multiline
                rows={3}
              />
              <TextField
                fullWidth
                label="Scheduled Date & Time"
                type="datetime-local"
                value={editForm.scheduledTime}
                onChange={(e) => setEditForm({ ...editForm, scheduledTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="Duration (minutes)"
                type="number"
                value={editForm.duration}
                onChange={(e) => setEditForm({ ...editForm, duration: Number.parseInt(e.target.value, 10) || 60 })}
                inputProps={{ min: 5, max: 480 }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditSession}
              variant="contained"
              disabled={isEditing}
              sx={{ background: 'linear-gradient(135deg, #1976d2 0%, #1567c0 100%)' }}
            >
              {isEditing ? 'Updating...' : 'Update Session'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </BaseLayout>
  );
}
