import { useState } from 'react';
import { Container, Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import BaseLayout from '../components/BaseLayout';
import { ShortlistManager, ScheduleCallDialog } from '../components/videoChat';
import StudentProfileCard from '../components/StudentProfileCard';

export default function ShortlistPage() {
  const [scheduleCallDialogOpen, setScheduleCallDialogOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  const handleScheduleCall = (studentId: string) => {
    setSelectedStudentId(studentId);
    setScheduleCallDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setScheduleCallDialogOpen(false);
    setSelectedStudentId(null);
  };

  return (
    <BaseLayout>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a', mb: 1 }}>
            📋 Candidate Shortlist
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Manage your candidate shortlist and schedule 1v1 video calls with interested students.
          </Typography>
        </Box>

        <ShortlistManager
          onScheduleCall={handleScheduleCall}
          onViewStudent={(studentId) => setProfileStudentId(studentId)}
        />

        {selectedStudentId && (
          <ScheduleCallDialog
            open={scheduleCallDialogOpen}
            onClose={handleCloseDialog}
            studentId={selectedStudentId}
          />
        )}

        <Dialog
          open={profileStudentId !== null}
          onClose={() => setProfileStudentId(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ bgcolor: 'rgba(56, 133, 96, 0.1)', fontWeight: 'bold' }}>
            Student Profile
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            {profileStudentId ? (
              <StudentProfileCard
                studentId={profileStudentId}
                enableEmployerMessaging
                onBeforeNavigateToChat={() => setProfileStudentId(null)}
              />
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setProfileStudentId(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Container>
    </BaseLayout>
  );
}
