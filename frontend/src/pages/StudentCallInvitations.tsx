import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Stack,
  Paper,
} from '@mui/material';
import BaseLayout from '../components/BaseLayout';
import { TabPanel } from '../components/TabPanel';
import { InvitationTabContent } from '../components/invitations/InvitationTabContent';
import { useCallInvitationsPolling } from '../hooks/useCallInvitationsPolling';
import {
  getIncomingCallInvitations,
  type CallInvitation,
  acceptCallInvitation,
  declineCallInvitation,
} from '../utils/callInvitationApi';
import { CallInvitationCard } from '../components/videoChat/CallInvitationCard';

type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'all';

export function StudentCallInvitations() {
  const navigate = useNavigate();
  const { invitations, loading, error, refresh, setError } = useCallInvitationsPolling(getIncomingCallInvitations);
  const [tabValue, setTabValue] = useState(0);

  const handleRefresh = async () => {
    await refresh();
  };

  const handleAccept = async (invitationId: string) => {
    try {
      const result = await acceptCallInvitation(invitationId);
      if (result.success) {
        await handleRefresh();
      } else {
        setError(result.error || 'Failed to accept invitation');
      }
    } catch (err) {
      console.error('Accept error:', err);
      setError('Failed to accept invitation');
    }
  };

  const handleDecline = async (invitationId: string) => {
    try {
      const result = await declineCallInvitation(invitationId);
      if (result.success) {
        await handleRefresh();
      } else {
        setError(result.error || 'Failed to decline invitation');
      }
    } catch (err) {
      console.error('Decline error:', err);
      setError('Failed to decline invitation');
    }
  };

  const handleJoin = (invitationId: string) => {
    navigate(`/dashboard/1x1-call/${invitationId}`);
  };

  const getFilteredInvitations = (status: InvitationStatus): CallInvitation[] => {
    if (status === 'all') return invitations;
    return invitations.filter((inv) => inv.status === status);
  };

  const pendingCount = invitations.filter((inv) => inv.status === 'pending').length;
  const acceptedCount = invitations.filter((inv) => inv.status === 'accepted').length;
  const declinedCount = invitations.filter((inv) => inv.status === 'declined').length;

  const cardProps = {
    isEmployer: false as const,
    onAccept: (id: string) => handleAccept(id),
    onDecline: (id: string) => handleDecline(id),
    onJoin: (id: string) => handleJoin(id),
  };

  if (loading) {
    return (
      <BaseLayout pageTitle="1x1 Call Invitations">
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Stack direction="row" justifyContent="center" alignItems="center" sx={{ minHeight: '400px' }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Loading invitations...</Typography>
          </Stack>
        </Container>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout pageTitle="1x1 Call Invitations">
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            1x1 Call Invitations
          </Typography>
          <Typography variant="body1" sx={{ color: '#666' }}>
            Manage your invited 1-on-1 calls with employers
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {invitations.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: '#999' }}>
              No invitations yet
            </Typography>
            <Typography variant="body2" sx={{ color: '#aaa', mt: 1 }}>
              Employers will send you 1x1 call invitations that will appear here.
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
                <Tab label={`Declined (${declinedCount})`} id="tab-2" />
                <Tab label="All" id="tab-3" />
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
              <InvitationTabContent
                invitations={getFilteredInvitations('declined')}
                emptyMessage="No declined invitations"
              >
                {(items) =>
                  items.map((invitation) => (
                    <CallInvitationCard key={invitation.id} invitation={invitation} {...cardProps} />
                  ))
                }
              </InvitationTabContent>
            </TabPanel>

            <TabPanel value={tabValue} index={3}>
              <InvitationTabContent invitations={invitations} emptyMessage="No invitations">
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
    </BaseLayout>
  );
}
