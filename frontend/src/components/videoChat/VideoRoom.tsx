import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';

interface VideoRoomProps {
  roomName: string;
  userName: string;
  onError?: (error: Error) => void;
  startWithAudioMuted?: boolean;
}

// Jitsi Cloud AppID
const JITSI_APP_ID = 'vpaas-magic-cookie-970d0ce53fce4138ba1a990738291ec0';
const JITSI_DOMAIN = '8x8.vc';

// Global promise to load Jitsi script only once
let jitsiScriptPromise: Promise<any> | null = null;

function loadJitsiScript(): Promise<any> {
  if (jitsiScriptPromise) {
    return jitsiScriptPromise;
  }

  jitsiScriptPromise = new Promise((resolve, reject) => {
    // Check if script is already loaded
    if ((globalThis as any).JitsiMeetExternalAPI) {
      resolve((globalThis as any).JitsiMeetExternalAPI);
      return;
    }

    // Check if script tag already exists
    const scriptUrl = `https://${JITSI_DOMAIN}/${JITSI_APP_ID}/external_api.js`;
    if (document.querySelector(`script[src="${scriptUrl}"]`)) {
      let attempts = 0;
      const checkLoaded = () => {
        if ((globalThis as any).JitsiMeetExternalAPI) {
          resolve((globalThis as any).JitsiMeetExternalAPI);
        } else if (attempts < 50) {
          attempts++;
          setTimeout(checkLoaded, 100);
        } else {
          reject(new Error('Jitsi API failed to load after multiple attempts'));
        }
      };
      checkLoaded();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://${JITSI_DOMAIN}/${JITSI_APP_ID}/external_api.js`;
    script.async = true;

    script.onload = () => {
      let attemptsLoad = 0;
      const checkLoadedAfterScript = () => {
        if ((globalThis as any).JitsiMeetExternalAPI) {
          resolve((globalThis as any).JitsiMeetExternalAPI);
        } else if (attemptsLoad < 50) {
          attemptsLoad++;
          setTimeout(checkLoadedAfterScript, 100);
        } else {
          reject(new Error('Jitsi API not available after script load'));
        }
      };
      checkLoadedAfterScript();
    };

    script.onerror = () => {
      jitsiScriptPromise = null;
      reject(new Error('Failed to load Jitsi API script'));
    };

    document.head.appendChild(script);
  });

  return jitsiScriptPromise;
}

/**
 * VideoRoom Component - Embeds Jitsi Meet for video conferencing
 * Uses public meet.jit.si instance (free, no setup required)
 */
export function VideoRoom({
  roomName,
  userName,
  onError,
  startWithAudioMuted = true,
}: VideoRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const onErrorRef = useRef(onError);
  const previousRoomRef = useRef<string | null>(null);

  // Update onError ref (doesn't trigger effects)
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mountedRef.current) return;
    
    // Prevent multiple simultaneous initializations
    if (initializingRef.current) {
      console.log('[Jitsi] ❌ Already initializing, skipping duplicate init');
      return;
    }
    
    // Only reinit if room name changes
    if (previousRoomRef.current && previousRoomRef.current === roomName && jitsiApiRef.current) {
      console.log('[Jitsi] Room unchanged, skipping reinit');
      return;
    }
    previousRoomRef.current = roomName;

    // Clear any previous state
    setIsLoading(true);
    setError(null);

    let timeoutId: NodeJS.Timeout | undefined;
    let disposed = false;
    initializingRef.current = true;

    const initJitsi = async () => {
      try {
        // Room name must be prefixed with AppID for Jitsi Cloud
        const jitsiRoomName = `${JITSI_APP_ID}/${roomName}`;
        
        const options = {
          roomName: jitsiRoomName,
          parentNode: containerRef.current,
          userInfo: {
            displayName: userName,
          },
          configOverwrite: {
            startAudioOnly: false,
            startWithAudioMuted,
            disableDeepLinking: true,
            prejoinPageEnabled: false,
            enableWelcomePage: false,
            // Disable lobby mode - try both variations
            enableLobbyMode: false,
            lobbyMode: false,
            // Disable moderation on room creation
            requireDisplayName: false,
            // Disable virtual background to prevent TensorFlow kernel registration errors
            disableScreensharingVirtualBackground: true,
          },
          interfaceConfigOverwrite: {
            DISPLAY_WELCOME_PAGE_ON_INIT: false,
            DEFAULT_BACKGROUND: '#000000',
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'closedcaptions',
              'desktop',
              'fullscreen',
              'foyer',
              'hangup',
              'chat',
              'recording',
              'livestream',
              'etherpad',
              'settings',
              'raisehand',
              'videoquality',
              'filmstrip',
              'invite',
              'feedback',
              'stats',
              'shortcuts',
              'tileview',
              'download',
            ],
            SHOW_JITSI_WATERMARK: false,
          },
        };

        // Load Jitsi API
        const JitsiMeetExternalAPI = await loadJitsiScript();

        if (!mountedRef.current || disposed) return;

        // Create Jitsi instance with Jitsi Cloud
        const api = new JitsiMeetExternalAPI(JITSI_DOMAIN, options);
        jitsiApiRef.current = api;
        console.log('[Jitsi] API instance created for room:', jitsiRoomName);

        // Event listeners
        const onVideoConferenceJoined = () => {
          console.log('[Jitsi] ✅ User joined video conference');
          initializingRef.current = false;
          if (mountedRef.current && !disposed && timeoutId) {
            clearTimeout(timeoutId);
          }
          if (mountedRef.current && !disposed) {
            setIsLoading(false);
          }
        };

        const onVideoConferenceLeft = () => {
          console.log('[Jitsi] User left video conference');
        };

        const onParticipantJoined = (event: any) => {
          console.log('[Jitsi] Participant joined:', event.detail);
        };

        const onParticipantLeft = (event: any) => {
          console.log('[Jitsi] Participant left:', event.detail);
        };

        const onReadyToClose = () => {
          console.log('[Jitsi] Ready to close');
        };

        const onConferenceFailed = (error: any) => {
          console.error('[Jitsi] Conference failed:', error);
          // Handle members-only/lobby error
          if (error && error.toLowerCase?.().includes('membersonly')) {
            console.error('[Jitsi] ❌ Room requires moderator approval (membersOnly mode)');
            if (mountedRef.current && !disposed) {
              initializingRef.current = false;
              setError('This session requires moderator approval. Please ask the session host to restart the session.');
              setIsLoading(false);
            }
          }
        };

        api.addEventListener('videoConferenceJoined', onVideoConferenceJoined);
        api.addEventListener('videoConferenceLeft', onVideoConferenceLeft);
        api.addEventListener('participantJoined', onParticipantJoined);
        api.addEventListener('participantLeft', onParticipantLeft);
        api.addEventListener('readyToClose', onReadyToClose);
        api.addEventListener('onConferenceFailed', onConferenceFailed);

        // Fallback: if videoConferenceJoined doesn't fire after 5 seconds, force loading to stop
        console.log('[Jitsi] Setting 5-second fallback timeout for conference join');
        timeoutId = setTimeout(() => {
          if (!disposed && mountedRef.current) {
            console.log('[Jitsi] ⚠️ Fallback: Conference join timeout - forcing loading to stop');
            initializingRef.current = false;
            setIsLoading(false);
          }
        }, 5000);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[Jitsi] ❌ Initialization error:', error);
        initializingRef.current = false;
        if (mountedRef.current && !disposed) {
          setError(error.message);
          onErrorRef.current?.(error);
          setIsLoading(false);
        }
      }
    };

    initJitsi();

    return () => {
      disposed = true;
      initializingRef.current = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Cleanup
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
          jitsiApiRef.current = null;
        } catch (err) {
          console.error('[Jitsi] Error disposing Jitsi API:', err);
        }
      }
    };
  }, [roomName]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        overflow: 'hidden',
      }}
    >
      {error && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        >
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <CircularProgress />
          <span style={{ color: 'white' }}>Loading video conference...</span>
        </Box>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </Box>
  );
}
