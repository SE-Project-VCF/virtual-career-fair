import { useEffect, useState, type ReactNode } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { authUtils } from '../../utils/auth';
import { UserSearchSelector, type UserSearchResult } from './UserSearchSelector';

interface ShortlistEntry {
  studentId: string;
  studentName: string;
  studentEmail: string;
  notes: string;
  addedAt: number;
}

interface ShortlistManagerProps {
  onScheduleCall?: (studentId: string, studentName: string) => void;
}

/**
 * ShortlistManager Component - Manage employer's candidate shortlist
 */
export function ShortlistManager({ onScheduleCall }: Readonly<ShortlistManagerProps>) {
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<UserSearchResult | null>(null);
  const [newNotes, setNewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch shortlist
  useEffect(() => {
    const fetchShortlist = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = await authUtils.getIdToken();
        if (!token) {
          throw new Error('Not authenticated. Please log in again.');
        }

        const response = await fetch('/api/shortlist/list', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication failed. Please log in again.');
          }
          throw new Error(`Failed to fetch shortlist (${response.status})`);
        }

        const data = await response.json();
        setShortlist(data.shortlist || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Fetch shortlist error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchShortlist();
  }, []);

  // Remove from shortlist
  const handleRemove = async (studentId: string) => {
    try {
      const token = await authUtils.getIdToken();
      if (!token) {
        setError('Not authenticated. Please log in again.');
        return;
      }

      const response = await fetch(`/api/shortlist/${studentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to remove from shortlist');
      }

      setShortlist((prev) =>
        prev.filter((entry) => entry.studentId !== studentId)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Remove error:', err);
    }
  };

  // Add to shortlist
  const handleAddToShortlist = async () => {
    if (!selectedStudent) {
      setError('Please select a student');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const token = await authUtils.getIdToken();
      if (!token) {
        setError('Not authenticated. Please log in again.');
        setIsSubmitting(false);
        return;
      }

      const response = await fetch('/api/shortlist/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          notes: newNotes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add to shortlist');
      }

      // Refresh list
      const listResponse = await fetch('/api/shortlist/list', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (listResponse.ok) {
        const data = await listResponse.json();
        setShortlist(data.shortlist || []);
      }

      setOpenDialog(false);
      setSelectedStudent(null);
      setNewNotes('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Add to shortlist error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  let shortlistMainContent: ReactNode;
  if (isLoading) {
    shortlistMainContent = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  } else if (shortlist.length === 0) {
    shortlistMainContent = (
      <Alert severity="info">
        No candidates in shortlist yet. Add students to start scheduling calls!
      </Alert>
    );
  } else {
    shortlistMainContent = (
      <List disablePadding>
        {shortlist.map((entry) => (
          <ListItem
            key={entry.studentId}
            disablePadding
            divider
            secondaryAction={
              <Stack direction="row" spacing={0.5}>
                <IconButton
                  edge="end"
                  size="small"
                  title="Schedule call"
                  onClick={() =>
                    onScheduleCall?.(entry.studentId, entry.studentName)
                  }
                >
                  <EventAvailableIcon />
                </IconButton>
                <IconButton
                  edge="end"
                  size="small"
                  color="error"
                  onClick={() => handleRemove(entry.studentId)}
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            }
          >
            <ListItemButton>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <span>{entry.studentName}</span>
                    <Chip label="Shortlisted" size="small" />
                  </Stack>
                }
                secondary={
                  <>
                    {entry.studentEmail}
                    {entry.notes && (
                      <>
                        <br />
                        <span style={{ fontSize: '0.85em', color: '#666' }}>
                          Notes: {entry.notes}
                        </span>
                      </>
                    )}
                  </>
                }
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    );
  }

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', boxShadow: 2 }}>
      <CardHeader
        title="Candidate Shortlist"
        titleTypographyProps={{ variant: 'h6', sx: { fontWeight: 600 } }}
        action={
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
            sx={{
              bgcolor: '#b03a6c',
              '&:hover': { bgcolor: '#8b2a50' },
            }}
          >
            Add Candidate
          </Button>
        }
        sx={{ bgcolor: 'rgba(176, 58, 108, 0.05)', borderBottom: '1px solid #e0e0e0' }}
      />

      <CardContent sx={{ flex: 1, overflow: 'auto' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {shortlistMainContent}
      </CardContent>

      {/* Add to Shortlist Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Student to Shortlist</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <UserSearchSelector
            value={selectedStudent}
            onChange={setSelectedStudent}
            disabled={isSubmitting}
            label="Search Student *"
            placeholder="Search by name or email"
          />
          <TextField
            fullWidth
            label="Notes (optional)"
            placeholder="e.g., Great candidate for engineering role"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            multiline
            rows={3}
            disabled={isSubmitting}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleAddToShortlist}
            variant="contained"
            disabled={isSubmitting || !selectedStudent}
          >
            {isSubmitting ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
