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
  Stack,
  IconButton,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

interface TimeSlot {
  startTime: string;
  endTime: string;
}

interface ScheduleCallDialogProps {
  open: boolean;
  studentId?: string;
  studentName?: string;
  onClose: () => void;
  onSchedule?: (data: {
    studentId: string;
    proposedTimes: { startTime: string; endTime: string }[];
    notes: string;
  }) => Promise<void>;
}

/**
 * ScheduleCallDialog Component - Allows employers to schedule 1v1 calls
 */
export function ScheduleCallDialog({
  open,
  studentId,
  studentName,
  onClose,
  onSchedule,
}: ScheduleCallDialogProps) {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([
    { startTime: '', endTime: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddTimeSlot = () => {
    setTimeSlots([...timeSlots, { startTime: '', endTime: '' }]);
  };

  const handleRemoveTimeSlot = (index: number) => {
    setTimeSlots(timeSlots.filter((_, i) => i !== index));
  };

  const handleTimeChange = (
    index: number,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    const newSlots = [...timeSlots];
    newSlots[index] = {
      ...newSlots[index],
      [field]: value,
    };
    setTimeSlots(newSlots);
  };

  const handleSubmit = async () => {
    try {
      setError(null);

      // Validate
      if (!studentId) {
        setError('Student ID is missing');
        return;
      }

      if (timeSlots.some((slot) => !slot.startTime || !slot.endTime)) {
        setError('Please fill in all time slots');
        return;
      }

      // Validate times
      for (const slot of timeSlots) {
        const start = new Date(slot.startTime);
        const end = new Date(slot.endTime);
        if (start >= end) {
          setError('End time must be after start time');
          return;
        }
      }

      setIsSubmitting(true);

      await onSchedule?.({
        studentId,
        proposedTimes: timeSlots.map((slot) => ({
          startTime: new Date(slot.startTime).toISOString(),
          endTime: new Date(slot.endTime).toISOString(),
        })),
        notes,
      });

      // Reset form
      setTimeSlots([{ startTime: '', endTime: '' }]);
      setNotes('');
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
      <DialogTitle sx={{ bgcolor: 'rgba(176, 58, 108, 0.05)', fontWeight: 600 }}>Schedule Call with {studentName}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Proposed Time Slots
          </Typography>
          <Stack spacing={2}>
            {timeSlots.map((slot, index) => (
              <Stack key={index} direction="row" spacing={1} alignItems="flex-end">
                <TextField
                  label="Start Time"
                  type="datetime-local"
                  value={slot.startTime}
                  onChange={(e) =>
                    handleTimeChange(index, 'startTime', e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                  disabled={isSubmitting}
                  sx={{ flex: 1, minWidth: '150px' }}
                />
                <TextField
                  label="End Time"
                  type="datetime-local"
                  value={slot.endTime}
                  onChange={(e) =>
                    handleTimeChange(index, 'endTime', e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                  disabled={isSubmitting}
                  sx={{ flex: 1, minWidth: '150px' }}
                />
                {timeSlots.length > 1 && (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveTimeSlot(index)}
                    disabled={isSubmitting}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Stack>
            ))}
          </Stack>
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddTimeSlot}
            disabled={isSubmitting}
            sx={{ mt: 1 }}
          >
            Add Time Slot
          </Button>
        </Box>

        <TextField
          fullWidth
          label="Notes (optional)"
          placeholder="e.g., I'm interested in discussing your experience with React..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          rows={3}
          disabled={isSubmitting}
        />
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
          {isSubmitting ? 'Scheduling...' : 'Schedule Call'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
