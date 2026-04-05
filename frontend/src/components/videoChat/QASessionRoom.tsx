import { Box } from '@mui/material';
import { VideoRoom } from './VideoRoom';

interface QASessionRoomProps {
  jitsiRoom: string;
  userName: string;
  onError?: (error: Error) => void;
}

/**
 * QASessionRoom Component - Full-screen video conference for Q&A sessions
 * Uses Jitsi's built-in moderator controls for muting/unmuting participants
 */
export function QASessionRoom({
  jitsiRoom,
  userName,
  onError,
}: Readonly<QASessionRoomProps>) {
  const handleVideoError = (err: Error) => {
    console.error('[QA Session] Video error:', err);
    onError?.(err);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
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
