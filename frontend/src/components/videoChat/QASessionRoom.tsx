import { VideoRoom } from './VideoRoom';
import { VideoRoomShell } from './VideoRoomShell';

interface QASessionRoomProps {
  jitsiRoom: string;
  userName: string;
  onError?: (error: Error) => void;
}

/**
 * Q&A session full-screen Jitsi room (moderator controls in Jitsi UI).
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
    <VideoRoomShell height="100vh">
      <VideoRoom
        roomName={jitsiRoom}
        userName={userName}
        onError={handleVideoError}
        startWithAudioMuted={true}
      />
    </VideoRoomShell>
  );
}
