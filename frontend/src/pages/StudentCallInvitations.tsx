import { useState, useEffect } from 'react';
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
import { getIncomingCallInvitations, type CallInvitation, acceptCallInvitation, declineCallInvitation } from '../utils/callInvitationApi';
import { CallInvitationCard } from '../components/videoChat/CallInvitationCard';

type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'all';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: Readonly<TabPanelProps>) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export function StudentCallInvitations() {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<CallInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  const loadInvitations = async () => {
    try {
      setError(null);
      const result = await getIncomingCallInvitations();

      if (!result.success) {
        setError(result.error || 'Failed to load invitations');
        return;
      }

      setInvitations(result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Load invitations error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvitations();
    // Refresh every 30 seconds
    const interval = setInterval(loadInvitations, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    await loadInvitations();
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
            {getFilteredInvitations('pending').length === 0 ? (
              <Typography sx={{ textAlign: 'center', color: '#999', py: 3 }}>
                No pending invitations
              </Typography>
            ) : (
              <Stack spacing={2}>
                {getFilteredInvitations('pending').map((invitation) => (
                  <CallInvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    isEmployer={false}
                    onAccept={(id) => handleAccept(id)}
                    onDecline={(id) => handleDecline(id)}
                    onJoin={(id) => handleJoin(id)}
                  />
                ))}
              </Stack>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            {getFilteredInvitations('accepted').length === 0 ? (
              <Typography sx={{ textAlign: 'center', color: '#999', py: 3 }}>
                No accepted invitations
              </Typography>
            ) : (
              <Stack spacing={2}>
                {getFilteredInvitations('accepted').map((invitation) => (
                  <CallInvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    isEmployer={false}
                    onAccept={(id) => handleAccept(id)}
                    onDecline={(id) => handleDecline(id)}
                    onJoin={(id) => handleJoin(id)}
                  />
                ))}
              </Stack>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            {getFilteredInvitations('declined').length === 0 ? (
              <Typography sx={{ textAlign: 'center', color: '#999', py: 3 }}>
                No declined invitations
              </Typography>
            ) : (
              <Stack spacing={2}>
                {getFilteredInvitations('declined').map((invitation) => (
                  <CallInvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    isEmployer={false}
                    onAccept={(id) => handleAccept(id)}
                    onDecline={(id) => handleDecline(id)}
                    onJoin={(id) => handleJoin(id)}
                  />
                ))}
              </Stack>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            {invitations.length === 0 ? (
              <Typography sx={{ textAlign: 'center', color: '#999', py: 3 }}>
                No invitations
              </Typography>
            ) : (
              <Stack spacing={2}>
                {invitations.map((invitation) => (
                  <CallInvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    isEmployer={false}
                    onAccept={(id) => handleAccept(id)}
                    onDecline={(id) => handleDecline(id)}
                    onJoin={(id) => handleJoin(id)}
                  />
                ))}
              </Stack>
            )}
          </TabPanel>
        </Box>
      )}
    </Container>
    </BaseLayout>
  );
}
