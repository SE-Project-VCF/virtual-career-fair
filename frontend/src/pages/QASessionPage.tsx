import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Box, CircularProgress, Alert, Card, CardContent, Button, Typography, Radio, RadioGroup, FormControlLabel } from '@mui/material';
import BaseLayout from '../components/BaseLayout';
import { QASessionRoom } from '../components/videoChat/QASessionRoom';
import { authUtils } from '../utils/auth';
import { API_URL } from '../config';

export default function QASessionPage() {
  const { boothId } = useParams<{ boothId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState(authUtils.getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]); // Array of sessions
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [hasJoined, setHasJoined] = useState(false); // Track if user has clicked join

  // Monitor auth state changes
  useEffect(() => {
    const checkAuthState = () => {
      const currentUser = authUtils.getCurrentUser();
      setUser(currentUser);
    };

    const interval = setInterval(checkAuthState, 100);
    return () => clearInterval(interval);
  }, []);

  const fetchSessionData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!boothId) {
        throw new Error('Booth ID is required');
      }

      // Get current user and token
      const currentUser = authUtils.getCurrentUser();
      if (!currentUser?.uid) {
        console.error('[QA Session] User not authenticated');
        throw new Error('Not authenticated. Please log in.');
      }

      // Get token with retry logic (helps with new tab/refresh scenarios)
      let idToken: string | null = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (!idToken && attempts < maxAttempts) {
        try {
          const token = await authUtils.getIdToken();
          if (token) {
            idToken = token;
          } else {
            console.warn(`[QA Session] Token is null (attempt ${attempts + 1}/${maxAttempts})`);
          }
        } catch (tokenErr) {
          console.warn(`[QA Session] Failed to get ID token (attempt ${attempts + 1}/${maxAttempts}):`, tokenErr);
        }

        if (!idToken) {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`[QA Session] Retrying token fetch (${attempts}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      if (!idToken) {
        throw new Error('Failed to obtain authentication token - please log in again');
      }

      console.log(`[Q&A Session] Fetching sessions for booth: ${boothId}`);

      const response = await fetch(`${API_URL}/api/booth/${boothId}/qa-session`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        throw new Error('Not authenticated. Please log in again.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch sessions');
      }

      const data = await response.json();
      console.log('[Q&A Session] Received sessions data:', data);

      // Support new array format (qaSessions) and backwards compatibility (qaSession)
      let availableSessions = [];
      if (data.qaSessions && Array.isArray(data.qaSessions) && data.qaSessions.length > 0) {
        availableSessions = data.qaSessions;
        console.log(`[Q&A Session] Found ${availableSessions.length} available session(s)`);
      } else if (data.qaSession) {
        availableSessions = [data.qaSession];
        console.log('[Q&A Session] Found 1 session (legacy format)');
      } else {
        throw new Error('No active sessions for this booth');
      }

      // Verify sessions are available (within 15 mins before start through entire duration)
      const now = new Date();
      const activeSessions = availableSessions.filter((s: any) => {
        const sessionTime = typeof s.scheduledTime === 'object' && s.scheduledTime._seconds
          ? new Date(s.scheduledTime._seconds * 1000)
          : typeof s.scheduledTime === 'number'
          ? new Date(s.scheduledTime)
          : new Date(s.scheduledTime);

        const endTime = new Date(sessionTime.getTime() + s.duration * 60 * 1000);
        const timeUntilStart = sessionTime.getTime() - now.getTime();
        const canJoin = timeUntilStart <= 15 * 60 * 1000 && now <= endTime;
        return canJoin;
      });

      if (activeSessions.length === 0) {
        throw new Error('No available sessions. Sessions are available from 15 minutes before start time through the entire call duration.');
      }

      setSessions(activeSessions.map((s: any) => ({ ...s, boothId })));
      setSelectedSessionIndex(0);
      setError(null);
    } catch (err) {
      console.error('[Q&A Session] Failed to fetch sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [boothId]);

  // Fetch sessions when user is authenticated and boothId is available
  useEffect(() => {
    if (!boothId) {
      setError('Booth ID is required');
      setLoading(false);
      return;
    }

    if (!user?.uid) {
      // User not authenticated yet - wait a bit and try again
      console.log('[Q&A Session] Waiting for authentication...');
      const timer = setTimeout(() => {
        const currentUser = authUtils.getCurrentUser();
        if (currentUser?.uid) {
          setUser(currentUser);
          fetchSessionData();
        } else {
          setError('Not authenticated. Please log in.');
          setLoading(false);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }

    // User is authenticated, fetch session data
    fetchSessionData();
  }, [boothId, user?.uid, fetchSessionData]);

  if (loading) {
    return (
      <BaseLayout>
        <Container maxWidth="lg" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Container>
      </BaseLayout>
    );
  }

  if (error) {
    return (
      <BaseLayout>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="error">{error}</Alert>
            <Box>
              <button onClick={() => navigate(-1)}>← Go Back</button>
            </Box>
          </Box>
        </Container>
      </BaseLayout>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <BaseLayout>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Alert severity="info">No available sessions for this booth</Alert>
        </Container>
      </BaseLayout>
    );
  }

  if (!boothId) {
    return (
      <BaseLayout>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Alert severity="error">Booth ID is required</Alert>
        </Container>
      </BaseLayout>
    );
  }

  const session = sessions[selectedSessionIndex];

  // Show session selector if multiple sessions are available and user hasn't joined yet
  if (sessions.length > 1 && !hasJoined) {
    return (
      <BaseLayout pageTitle="Select Q&A Session">
        <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100vh', py: 4 }}>
          <Container maxWidth="md">
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ mb: 3 }}>
                  Multiple Q&A Sessions Available
                </Typography>
                <Typography variant="body2" sx={{ mb: 3, color: '#666' }}>
                  Please select which session you'd like to join:
                </Typography>

                <RadioGroup
                  value={selectedSessionIndex.toString()}
                  onChange={(e) => setSelectedSessionIndex(parseInt(e.target.value, 10))}
                  sx={{ mb: 3 }}
                >
                  {sessions.map((s, idx) => {
                    const sessionTime = typeof s.scheduledTime === 'object' && s.scheduledTime._seconds
                      ? new Date(s.scheduledTime._seconds * 1000)
                      : typeof s.scheduledTime === 'number'
                      ? new Date(s.scheduledTime)
                      : new Date(s.scheduledTime);

                    return (
                      <FormControlLabel
                        key={idx}
                        value={idx.toString()}
                        control={<Radio />}
                        label={
                          <Box sx={{ ml: 1 }}>
                            <Typography variant="subtitle2">{s.title}</Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                              {sessionTime.toLocaleString()} • {s.duration} min
                            </Typography>
                            {s.description && (
                              <Typography variant="body2" sx={{ mt: 0.5, color: '#999' }}>
                                {s.description}
                              </Typography>
                            )}
                          </Box>
                        }
                        sx={{ mb: 2, alignItems: 'flex-start', pt: 1 }}
                      />
                    );
                  })}
                </RadioGroup>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="contained"
                    onClick={() => {
                      // Navigate to session view - just set hasJoined flag
                      setHasJoined(true);
                    }}
                  >
                    Join Selected Session
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => navigate(-1)}
                  >
                    Cancel
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Container>
        </Box>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout pageTitle="Q&A Session">
      <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100vh' }}>
        <Container maxWidth="lg" sx={{ py: 2 }}>
          <QASessionRoom
            sessionId={session.id || boothId}
            jitsiRoom={session.jitsiRoom || `qa-session-${boothId}-${selectedSessionIndex}`}

            userName={user?.displayName || user?.email || 'Guest'}
            isEmployer={user?.role === 'representative' || user?.role === 'companyOwner'}
            onError={(error) => setError(error.message)}
          />
        </Container>
      </Box>
    </BaseLayout>
  );
}
