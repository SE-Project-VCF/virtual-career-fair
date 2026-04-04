import { useEffect, useState } from 'react';
import { Box, Card, CardHeader, CircularProgress, Alert } from '@mui/material';
import { Channel, MessageInput, MessageList, Thread } from 'stream-chat-react';
import { StreamChat } from 'stream-chat';
import { authUtils } from '../../utils/auth';
import { VideoRoom } from './VideoRoom';
import 'stream-chat-react/css/v2/index.css';

interface CallRoomProps {
  jitsiRoom: string;
  streamChannelId: string;
  userName: string;
  onError?: (error: Error) => void;
}

/**
 * CallRoom Component - Combines VideoRoom + StreamChat for 1v1 calls
 * Displays video on left, live chat on right
 */
export function CallRoom({
  jitsiRoom,
  streamChannelId,
  userName,
  onError,
}: CallRoomProps) {
  const [channel, setChannel] = useState<any>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(true);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        // Get Stream token from backend
        const tokenResponse = await fetch('/api/stream-token', {
          headers: {
            Authorization: `Bearer ${await authUtils.getIdToken()}`,
          },
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to get Stream token');
        }

        const { token } = await tokenResponse.json();

        // Initialize Stream Chat client
        const client = StreamChat.getInstance((window as any).STREAM_API_KEY);

        await client.connectUser(
          {
            id: (window as any).firebaseUser.uid,
            name: userName,
          },
          token
        );

        // Get or create channel
        const channelInstance = client.channel('messaging', streamChannelId);
        await channelInstance.watch();
        setChannel(channelInstance);
        setIsLoadingChat(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Chat initialization error:', error);
        setChatError(error.message);
        onError?.(error);
        setIsLoadingChat(false);
      }
    };

    initializeChat();
  }, [streamChannelId, userName, onError]);

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        gap: 1,
        backgroundColor: '#f5f5f5',
        p: 1,
      }}
    >
      {/* Video Section */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <Card
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 2,
          }}
        >
          <VideoRoom
            roomName={jitsiRoom}
            userName={userName}
            onError={onError}
            startWithAudioMuted={true}
          />
        </Card>
      </Box>

      {/* Chat Section */}
      <Box
        sx={{
          width: '350px',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Card
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: 2,
          }}
        >
          <CardHeader
            title="Chat"
            sx={{
              backgroundColor: '#f0f0f0',
              borderBottom: '1px solid #e0e0e0',
            }}
          />

          {chatError && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{chatError}</Alert>
            </Box>
          )}

          {isLoadingChat ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress />
            </Box>
          ) : channel ? (
            <Channel channel={channel}>
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    overflow: 'auto',
                    p: 1,
                  }}
                >
                  <MessageList />
                  <Thread />
                </Box>
                <Box
                  sx={{
                    borderTop: '1px solid #e0e0e0',
                    p: 1,
                  }}
                >
                  <MessageInput />
                </Box>
              </Box>
            </Channel>
          ) : null}
        </Card>
      </Box>
    </Box>
  );
}
