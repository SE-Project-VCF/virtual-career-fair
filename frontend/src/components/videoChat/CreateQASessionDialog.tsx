import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Box,
  Typography,
  Stack,
} from '@mui/material';

interface CreateQASessionDialogProps {
  open: boolean;
  fairId?: string;
  fairName?: string;
  onClose: () => void;
  onCreateSession?: (data: {
    fairId: string;
    title: string;
    description: string;
    scheduledTime: string;
    maxDuration: number;
  }) => Promise<void>;
}

/**
 * CreateQASessionDialog Component - Allows employers to create Q&A sessions
 */
export function CreateQASessionDialog({
  open,
  fairId,
  fairName,
  onClose,
  onCreateSession,
}: CreateQASessionDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [maxDuration, setMaxDuration] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setError(null);

      if (!fairId) {
        setError('Fair ID is missing');
        return;
      }

      if (!title.trim()) {
        setError('Please enter a session title');
        return;
      }

      if (!scheduledTime) {
        setError('Please select a scheduled time');
        return;
      }

      const durationNum = parseInt(maxDuration, 10);
      if (isNaN(durationNum) || durationNum <= 0) {
        setError('Duration must be a positive number');
        return;
      }

      // Validate that scheduled time is in the future
      const selectedTime = new Date(scheduledTime);
      if (selectedTime <= new Date()) {
        setError('Scheduled time must be in the future');
        return;
      }

      setIsSubmitting(true);

      await onCreateSession?.({
        fairId,
        title,
        description,
        scheduledTime: selectedTime.toISOString(),
        maxDuration: durationNum,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setScheduledTime('');
      setMaxDuration('60');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Create session error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: 'rgba(76, 175, 80, 0.05)', fontWeight: 600 }}>Create Q&A Session</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {fairName && (
          <Box sx={{ mb: 2, p: 1.5, backgroundColor: '#f0f0f0', borderRadius: 1 }}>
            <Typography variant="body2">
              <strong>Fair:</strong> {fairName}
            </Typography>
          </Box>
        )}

        <Stack spacing={2}>
          <TextField
            fullWidth
            label="Session Title"
            placeholder="e.g., Engineering Q&A with John Smith"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
          />

          <TextField
            fullWidth
            label="Description (optional)"
            placeholder="Describe what you'll be discussing..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={3}
            disabled={isSubmitting}
          />

          <TextField
            fullWidth
            label="Scheduled Time"
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={isSubmitting}
          />

          <TextField
            fullWidth
            label="Max Duration (minutes)"
            type="number"
            value={maxDuration}
            onChange={(e) => setMaxDuration(e.target.value)}
            inputProps={{ min: 1, step: 5 }}
            disabled={isSubmitting}
          />

          <Box sx={{ p: 1.5, backgroundColor: '#e3f2fd', borderRadius: 1 }}>
            <Typography variant="caption" color="textSecondary">
              <strong>Note:</strong> The session will start in presentation mode (all
              students muted). You can switch to Q&A mode after your presentation to
              allow students to ask questions and unmute themselves.
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Session'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
