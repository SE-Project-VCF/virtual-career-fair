import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Stack,
  Paper,
  Button,
  Container,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BaseLayout from '../components/BaseLayout';
import { TabPanel } from '../components/TabPanel';
import { InvitationTabContent } from '../components/invitations/InvitationTabContent';
import { useCallInvitationsPolling } from '../hooks/useCallInvitationsPolling';
import { getOutgoingCallInvitations, type CallInvitation, cancelCallInvitation } from '../utils/callInvitationApi';
import { CallInvitationCard } from '../components/videoChat/CallInvitationCard';
import { ScheduleCallDialog } from '../components/videoChat/ScheduleCallDialog';

type InvitationStatus = 'pending' | 'accepted' | 'all';

export function EmployerMyCalls() {
  const navigate = useNavigate();
  const { invitations, loading, error, refresh, setError } = useCallInvitationsPolling(getOutgoingCallInvitations);
  const [tabValue, setTabValue] = useState(0);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const handleRefresh = async () => {
    await refresh();
  };

  const handleCancel = async (invitationId: string) => {
    try {
      const result = await cancelCallInvitation(invitationId);
      if (result.success) {
        await handleRefresh();
      } else {
        setError(result.error || 'Failed to cancel invitation');
      }
    } catch (err) {
      console.error('Cancel error:', err);
      setError('Failed to cancel invitation');
    }
  };

  const handleJoin = (invitationId: string) => {
    navigate(`/dashboard/1x1-call/${invitationId}`);
  };

  const handleScheduleSuccess = async () => {
    await handleRefresh();
  };

  const getFilteredInvitations = (status: InvitationStatus): CallInvitation[] => {
    if (status === 'all') return invitations;
    return invitations.filter((inv) => inv.status === status);
  };

  const pendingCount = invitations.filter((inv) => inv.status === 'pending').length;
  const acceptedCount = invitations.filter((inv) => inv.status === 'accepted').length;

  const cardProps = {
    isEmployer: true as const,
    onCancel: (id: string) => handleCancel(id),
    onJoin: (id: string) => handleJoin(id),
  };

  if (loading) {
    return (
      <BaseLayout pageTitle="My 1x1 Calls">
        <Stack direction="row" justifyContent="center" alignItems="center" sx={{ minHeight: '400px' }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading calls...</Typography>
        </Stack>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout pageTitle="My 1x1 Calls">
      <Box sx={{ bgcolor: '#f5f5f5', minHeight: 'calc(100vh - 140px)', py: 4 }}>
        <Container maxWidth="lg">
          <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="body1" sx={{ color: '#666' }}>
              Schedule and manage your 1-on-1 calls with students
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setScheduleDialogOpen(true)}
              sx={{ background: 'linear-gradient(135deg, #388560 0%, #2d6b4d 100%)', flexShrink: 0, ml: 2 }}
            >
              Schedule Call
            </Button>
          </Box>

          <ScheduleCallDialog
            open={scheduleDialogOpen}
            onClose={() => setScheduleDialogOpen(false)}
            onSuccess={handleScheduleSuccess}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {invitations.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: '#999' }}>
                No calls scheduled yet
              </Typography>
              <Typography variant="body2" sx={{ color: '#aaa', mt: 1 }}>
                Click "Schedule Call" to set up a 1-on-1 with a student.
              </Typography>
            </Paper>
          ) : (
            <Box>
              <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                  value={tabValue}
                  onChange={(_, newValue) => setTabValue(newValue)}
                  aria-label="invitation status tabs"
                >
                  <Tab label={`Pending (${pendingCount})`} id="tab-0" />
                  <Tab label={`Accepted (${acceptedCount})`} id="tab-1" />
                  <Tab label="All" id="tab-2" />
                </Tabs>
              </Paper>

              <TabPanel value={tabValue} index={0}>
                <InvitationTabContent
                  invitations={getFilteredInvitations('pending')}
                  emptyMessage="No pending invitations"
                >
                  {(items) =>
                    items.map((invitation) => (
                      <CallInvitationCard key={invitation.id} invitation={invitation} {...cardProps} />
                    ))
                  }
                </InvitationTabContent>
              </TabPanel>

              <TabPanel value={tabValue} index={1}>
                <InvitationTabContent
                  invitations={getFilteredInvitations('accepted')}
                  emptyMessage="No accepted invitations"
                >
                  {(items) =>
                    items.map((invitation) => (
                      <CallInvitationCard key={invitation.id} invitation={invitation} {...cardProps} />
                    ))
                  }
                </InvitationTabContent>
              </TabPanel>

              <TabPanel value={tabValue} index={2}>
                <InvitationTabContent invitations={invitations} emptyMessage="No calls">
                  {(items) =>
                    items.map((invitation) => (
                      <CallInvitationCard key={invitation.id} invitation={invitation} {...cardProps} />
                    ))
                  }
                </InvitationTabContent>
              </TabPanel>
            </Box>
          )}
        </Container>
      </Box>
    </BaseLayout>
  );
}
