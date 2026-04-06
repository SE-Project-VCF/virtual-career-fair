import { useEffect, useState } from 'react';
import { VideoRoom } from './VideoRoom';
import { VideoRoomShell } from './VideoRoomShell';
import { VideoCallLoadingView, VideoCallErrorAlert } from './VideoCallRoomStates';
import { joinCall } from '../../utils/callInvitationApi';

interface Call1x1RoomProps {
  invitationId: string;
  onError?: (error: Error) => void;
}

/**
 * 1x1 call: join via API, then full-screen Jitsi (incl. chat).
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
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e.message);
        onError?.(e);
        console.error('Initialize call error:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeCall();
  }, [invitationId, onError]);

  if (loading) {
    return <VideoCallLoadingView message="Loading call..." />;
  }

  if (error) {
    return <VideoCallErrorAlert>{error}</VideoCallErrorAlert>;
  }

  if (!jitsiRoom) {
    return <VideoCallErrorAlert>Failed to initialize call room</VideoCallErrorAlert>;
  }

  const handleVideoError = (err: Error) => {
    console.error('[1x1 Call] Video error:', err);
    onError?.(err);
  };

  return (
    <VideoRoomShell height="100%">
      <VideoRoom
        roomName={jitsiRoom}
        userName={userName}
        onError={handleVideoError}
        startWithAudioMuted={true}
      />
    </VideoRoomShell>
  );
}
