import { useState, useEffect } from 'react';
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
import { getOutgoingCallInvitations, type CallInvitation, cancelCallInvitation } from '../utils/callInvitationApi';
import { CallInvitationCard } from '../components/videoChat/CallInvitationCard';
import { ScheduleCallDialog } from '../components/videoChat/ScheduleCallDialog';

type InvitationStatus = 'pending' | 'accepted' | 'all';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
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

export function EmployerMyCalls() {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<CallInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const loadInvitations = async () => {
    try {
      setError(null);
      const result = await getOutgoingCallInvitations();

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
                        isEmployer={true}
                        onCancel={(id) => handleCancel(id)}
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
                        isEmployer={true}
                        onCancel={(id) => handleCancel(id)}
                        onJoin={(id) => handleJoin(id)}
                      />
                    ))}
                  </Stack>
                )}
              </TabPanel>

              <TabPanel value={tabValue} index={2}>
                {invitations.length === 0 ? (
                  <Typography sx={{ textAlign: 'center', color: '#999', py: 3 }}>
                    No calls
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {invitations.map((invitation) => (
                      <CallInvitationCard
                        key={invitation.id}
                        invitation={invitation}
                        isEmployer={true}
                        onCancel={(id) => handleCancel(id)}
                        onJoin={(id) => handleJoin(id)}
                      />
                    ))}
                  </Stack>
                )}
              </TabPanel>
            </Box>
          )}
        </Container>
      </Box>
    </BaseLayout>
  );
}
