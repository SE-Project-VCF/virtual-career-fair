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
  CircularProgress,
} from '@mui/material';
import { createCallInvitation } from '../../utils/callInvitationApi';
import { StudentSelector, type Student } from './StudentSelector';

interface ScheduleCallDialogProps {
  open: boolean;
  studentId?: string;
  studentName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * ScheduleCallDialog Component - Allows employers to schedule 1x1 calls
 * Directly schedules a specific time slot (not proposing multiple options)
 */
export function ScheduleCallDialog({
  open,
  studentId: preSelectedStudentId,
  studentName,
  onClose,
  onSuccess,
}: Readonly<ScheduleCallDialogProps>) {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(
    preSelectedStudentId
      ? {
          id: preSelectedStudentId,
          firstName: studentName?.split(' ')[0] || 'Student',
          lastName: studentName?.split(' ').slice(1).join(' ') || '',
          email: '',
        }
      : null
  );
  const [scheduledTime, setScheduledTime] = useState('');
  const [duration, setDuration] = useState('30');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSchedule = async () => {
    try {
      setError(null);

      // Validate
      if (!selectedStudent?.id) {
        setError('Please select a student');
        return;
      }

      if (!scheduledTime) {
        setError('Please select a date and time');
        return;
      }

      const durationNum = parseInt(duration, 10);
      if (!durationNum || durationNum <= 0 || durationNum > 480) {
        setError('Duration must be between 1 and 480 minutes');
        return;
      }

      // Validate time is in the future
      const scheduledDate = new Date(scheduledTime);
      const now = new Date();
      if (scheduledDate <= now) {
        setError('Please select a future date and time');
        return;
      }

      setIsSubmitting(true);

      const result = await createCallInvitation(
        selectedStudent.id,
        scheduledDate,
        durationNum,
        description
      );

      if (!result.success) {
        setError(result.error || 'Failed to schedule call');
        return;
      }

      // Reset form
      setSelectedStudent(null);
      setScheduledTime('');
      setDuration('30');
      setDescription('');
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Schedule call error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: 'rgba(56, 133, 96, 0.05)', fontWeight: 600 }}>
        Schedule 1x1 Call {selectedStudent && `with ${selectedStudent.firstName} ${selectedStudent.lastName}`}
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!preSelectedStudentId && (
            <Box>
              <StudentSelector
                value={selectedStudent}
                onChange={setSelectedStudent}
                disabled={isSubmitting}
                label="Select Student *"
              />
            </Box>
          )}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Date & Time *
            </Typography>
            <TextField
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              fullWidth
              size="small"
              disabled={isSubmitting}
              inputProps={{
                min: new Date(Date.now() + 60 * 60 * 1000)
                  .toISOString()
                  .slice(0, 16),
              }}
            />
            <Typography variant="caption" sx={{ color: '#666', mt: 0.5, display: 'block' }}>
              Schedule at least 1 hour from now
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Duration (minutes) *
            </Typography>
            <TextField
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              fullWidth
              size="small"
              disabled={isSubmitting}
              inputProps={{ min: '1', max: '480', step: '5' }}
            />
            <Typography variant="caption" sx={{ color: '#666', mt: 0.5, display: 'block' }}>
              Recommended: 15-60 minutes
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Description or Agenda (optional)
            </Typography>
            <TextField
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Discuss role, resume review, company culture..."
              fullWidth
              size="small"
              disabled={isSubmitting}
            />
          </Box>

          <Typography variant="body2" sx={{ color: '#666', fontStyle: 'italic' }}>
            The student will receive a notification and can accept or decline this invitation.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSchedule}
          variant="contained"
          disabled={isSubmitting || !scheduledTime || !selectedStudent?.id}
          sx={{ background: 'linear-gradient(135deg, #388560 0%, #2d6b4d 100%)' }}
        >
          {isSubmitting ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Scheduling...
            </>
          ) : (
            'Schedule Call'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
