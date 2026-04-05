import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { VideoRoom } from './VideoRoom';
import { joinCall } from '../../utils/callInvitationApi';

interface Call1x1RoomProps {
  invitationId: string;
  onError?: (error: Error) => void;
}

/**
 * Call1x1Room Component - Full-screen video conference for 1v1 calls
 * Fetches call details and displays Jitsi video room
 * Uses Jitsi's built-in features (including chat)
 */
export function Call1x1Room({ invitationId, onError }: Readonly<Call1x1RoomProps>) {
  const [jitsiRoom, setJitsiRoom] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeCall = async () => {
      try {
        setError(null);
        const result = await joinCall(invitationId);

        if (!result.success) {
          const errorMsg = result.error || 'Failed to join call';
          setError(errorMsg);
          onError?.(new Error(errorMsg));
          return;
        }

        if (!result.jitsiRoom) {
          const errorMsg = 'No room information received';
          setError(errorMsg);
          onError?.(new Error(errorMsg));
          return;
        }

        setJitsiRoom(result.jitsiRoom);
        setUserName(result.userName || 'You');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
        onError?.(error);
        console.error('Initialize call error:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeCall();
  }, [invitationId, onError]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: '#000',
          gap: 2,
          flexDirection: 'column',
        }}
      >
        <CircularProgress sx={{ color: '#fff' }} />
        <Typography sx={{ color: '#fff' }}>Loading call...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: '#000',
          p: 2,
        }}
      >
        <Alert severity="error" sx={{ width: '100%', maxWidth: '500px' }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!jitsiRoom) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: '#000',
          p: 2,
        }}
      >
        <Alert severity="error" sx={{ width: '100%', maxWidth: '500px' }}>
          Failed to initialize call room
        </Alert>
      </Box>
    );
  }

  const handleVideoError = (err: Error) => {
    console.error('[1x1 Call] Video error:', err);
    onError?.(err);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100%',
        backgroundColor: '#000',
        p: 0,
        m: 0,
      }}
    >
      {/* Full-screen video section */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          width: '100%',
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <VideoRoom
            roomName={jitsiRoom}
            userName={userName}
            onError={handleVideoError}
            startWithAudioMuted={true}
          />
        </Box>
      </Box>
    </Box>
  );
}
