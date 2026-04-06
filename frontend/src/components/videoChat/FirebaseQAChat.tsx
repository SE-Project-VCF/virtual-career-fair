import { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
  Typography,
  Paper,
  Stack,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { db } from '../../firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getDocs,
  type QueryDocumentSnapshot,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { authUtils } from '../../utils/auth';

interface QAChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: Timestamp;
  role: 'employer' | 'student';
}

interface FirebaseQAChatProps {
  sessionId: string;
  isEmployer: boolean;
  onError?: (error: Error) => void;
}

function messageFromDoc(doc: QueryDocumentSnapshot<DocumentData>): QAChatMessage {
  const data = doc.data();
  return {
    id: doc.id,
    userId: data.userId,
    userName: data.userName,
    text: data.text,
    timestamp: data.timestamp,
    role: data.role,
  };
}

function messagesFromSnapshot(snapshot: QuerySnapshot<DocumentData>): QAChatMessage[] {
  const allMessages: QAChatMessage[] = [];
  snapshot.forEach((doc) => {
    allMessages.push(messageFromDoc(doc));
  });
  return allMessages;
}

/**
 * FirebaseQAChat - Firebase Firestore-based chat for Q&A sessions
 * Replaces Stream Chat to avoid rate limiting and reduce costs
 */
export function FirebaseQAChat({
  sessionId,
  isEmployer,
  onError,
}: Readonly<FirebaseQAChatProps>) {
  const [messages, setMessages] = useState<QAChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  const user = authUtils.getCurrentUser();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load messages and set up real-time listener
  useEffect(() => {
    if (!sessionId || !user?.uid || loadedRef.current) return;
    loadedRef.current = true;

    const setupListener = async () => {
      try {
        const messagesRef = collection(db, 'qa_sessions', sessionId, 'messages');
        
        console.log('[Firebase QA Chat] Starting setup');
        console.log('[Firebase QA Chat] User authenticated:', Boolean(user));

        // First, load existing messages
        console.log('[Firebase QA Chat] Fetching existing messages...');
        let existingSnapshot;
        try {
          existingSnapshot = await getDocs(
            query(messagesRef, orderBy('timestamp', 'asc'))
          );
          console.log('[Firebase QA Chat] Successfully fetched existing messages');
        } catch (docsErr) {
          const errObj = docsErr as any;
          console.error(`[Firebase QA Chat] ❌ getDocs() failed:`, docsErr);
          console.error(`[Firebase QA Chat] Error code:`, errObj.code);
          console.error(`[Firebase QA Chat] Error message:`, errObj.message);
          
          // If permission denied, still allow setting up listener
          if (errObj.code === 'permission-denied') {
            console.warn(`[Firebase QA Chat] ⚠️ Permission denied on initial fetch, but continuing with real-time listener`);
            existingSnapshot = { forEach: (_: any) => {} } as any; // Empty snapshot
          } else {
            throw docsErr;
          }
        }

        setMessages(messagesFromSnapshot(existingSnapshot as QuerySnapshot<DocumentData>));
        setLoading(false);

        // Set up real-time listener for new messages
        console.log(`[Firebase QA Chat] Setting up real-time listener...`);
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            console.log('[Firebase QA Chat] Real-time update received');
            setMessages(messagesFromSnapshot(snapshot));
          },
          (err) => {
            console.error('[Firebase QA Chat] ❌ Real-time listener error:', err);
            console.error('[Firebase QA Chat] Error code:', err.code);
            console.error('[Firebase QA Chat] Error message:', err.message);
            setError('Failed to load messages');
            onError?.(new Error('Failed to load chat messages'));
          }
        );

        return unsubscribe;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[Firebase QA Chat] Setup error:', error);
        setError(error.message);
        onError?.(error);
        setLoading(false);
      }
    };

    const unsubscribePromise = setupListener();
    return () => {
      unsubscribePromise.then((unsub) => unsub?.());
    };
  }, [sessionId, user?.uid, onError]);

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user?.uid) return;

    try {
      setSending(true);
      const messagesRef = collection(db, 'qa_sessions', sessionId, 'messages');

      await addDoc(messagesRef, {
        userId: user.uid,
        userName: user.displayName || user.email || 'Guest',
        text: newMessage.trim(),
        timestamp: serverTimestamp(),
        role: isEmployer ? 'employer' : 'student',
      });

      setNewMessage('');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[Firebase QA Chat] Error sending message:', error);
      setError('Failed to send message');
      onError?.(error);
    } finally {
      setSending(false);
    }
  };

  // Format timestamp
  const formatTime = (timestamp: Timestamp | null) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate();
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  // Students can always send messages
  const canSendMessage = isEmployer || true;

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Messages List */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
            }}
          >
            <Typography variant="body2">No messages yet</Typography>
          </Box>
        ) : (
          messages.map((msg) => {
            let paperBg = '#f5f5f5';
            if (msg.userId === user?.uid) {
              paperBg = '#e3f2fd';
            } else if (msg.role === 'employer') {
              paperBg = '#fff3e0';
            }
            return (
            <Paper
              key={msg.id}
              sx={{
                p: 1.5,
                backgroundColor: paperBg,
                borderLeft:
                  msg.role === 'employer' ? '4px solid #ff9800' : 'none',
              }}
            >
              <Stack spacing={0.5}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: msg.role === 'employer' ? '#ff6f00' : '#1976d2',
                    }}
                  >
                    {msg.userName}
                    {msg.role === 'employer' && (
                      <Typography
                        variant="caption"
                        sx={{
                          ml: 0.5,
                          px: 0.75,
                          py: 0.25,
                          backgroundColor:
                            msg.role === 'employer' ? '#ffe0b2' : '#e0e0e0',
                          borderRadius: 1,
                          fontWeight: 'bold',
                        }}
                      >
                        Employer
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#999' }}>
                    {formatTime(msg.timestamp)}
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.text}
                </Typography>
              </Stack>
            </Paper>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Message Input */}
      {canSendMessage && (
        <Box
          component="form"
          onSubmit={handleSendMessage}
          sx={{
            borderTop: '1px solid #e0e0e0',
            p: 1.5,
            display: 'flex',
            gap: 1,
          }}
        >
          <TextField
            size="small"
            fullWidth
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={sending}
            multiline
            maxRows={3}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
              },
            }}
          />
          <IconButton
            type="submit"
            disabled={!newMessage.trim() || sending}
            sx={{
              color: '#b03a6c',
            }}
          >
            {sending ? <CircularProgress size={20} /> : <SendIcon />}
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
