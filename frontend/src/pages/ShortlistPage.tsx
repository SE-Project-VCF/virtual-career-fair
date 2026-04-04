import { useState } from 'react';
import { Container, Box, Typography } from '@mui/material';
import BaseLayout from '../components/BaseLayout';
import { ShortlistManager, ScheduleCallDialog } from '../components/videoChat';

export default function ShortlistPage() {
  const [scheduleCallDialogOpen, setScheduleCallDialogOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

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

        <ShortlistManager onScheduleCall={handleScheduleCall} />

        {selectedStudentId && (
          <ScheduleCallDialog
            open={scheduleCallDialogOpen}
            onClose={handleCloseDialog}
            studentId={selectedStudentId}
          />
        )}
      </Container>
    </BaseLayout>
  );
}
