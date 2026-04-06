import { useCallback, useRef, useState } from 'react';

/**
 * Hook to control Jitsi video room state
 * Provides methods to control audio, video, and get user info
 */
export function useJitsiControl() {
  const apiRef = useRef<any>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [participants, setParticipants] = useState<string[]>([]);

  // Set the API reference
  const setApi = useCallback((api: any) => {
    apiRef.current = api;
  }, []);

  // Toggle audio mute
  const toggleAudio = useCallback(() => {
    if (!apiRef.current) return;
    try {
      apiRef.current.executeCommand('toggleAudio');
      setIsMuted((prev) => !prev);
    } catch (err) {
      console.error('Error toggling audio:', err);
    }
  }, []);

  // Toggle video on/off
  const toggleVideo = useCallback(() => {
    if (!apiRef.current) return;
    try {
      apiRef.current.executeCommand('toggleVideo');
      setIsVideoOn((prev) => !prev);
    } catch (err) {
      console.error('Error toggling video:', err);
    }
  }, []);

  // Mute all participants (employer only, for Q&A presentation mode)
  const muteAllParticipants = useCallback(() => {
    if (!apiRef.current) return;
    try {
      apiRef.current.executeCommand('muteEveryone');
    } catch (err) {
      console.error('Error muting all:', err);
    }
  }, []);

  // Hang up / leave call
  const hangUp = useCallback(() => {
    if (!apiRef.current) return;
    try {
      apiRef.current.executeCommand('hangup');
    } catch (err) {
      console.error('Error hanging up:', err);
    }
  }, []);

  // Send message in Jitsi chat
  const sendChatMessage = useCallback((message: string) => {
    if (!apiRef.current) return;
    try {
      apiRef.current.executeCommand('sendChatMessage', message);
    } catch (err) {
      console.error('Error sending chat message:', err);
    }
  }, []);

  // Get current participants
  const updateParticipants = useCallback((newParticipants: string[]) => {
    setParticipants(newParticipants);
  }, []);

  return {
    setApi,
    toggleAudio,
    toggleVideo,
    muteAllParticipants,
    hangUp,
    sendChatMessage,
    updateParticipants,
    isMuted,
    isVideoOn,
    participants,
  };
}
