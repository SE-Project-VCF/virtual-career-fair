import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { authUtils } from '../utils/auth';

/**
 * CallInvitationsPage - Redirect to StudentCallInvitations for consistency
 * This page is kept for backward compatibility but redirects to the main 1x1 calls page
 */
export default function CallInvitationsPage() {
  const navigate = useNavigate();
  const user = authUtils.getCurrentUser();

  useEffect(() => {
    if (user?.role === 'student') {
      // Redirect to the main 1x1 calls page which uses the new system
      navigate('/dashboard/1x1-calls', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  // Show loading while redirecting
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <CircularProgress />
    </Box>
  );
}
