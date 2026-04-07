import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import type { ReactNode } from 'react';

export function VideoCallLoadingView({ message }: Readonly<{ message: string }>) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        backgroundColor: '#000',
        gap: 2,
        flexDirection: 'column',
      }}
    >
      <CircularProgress sx={{ color: '#fff' }} />
      <Typography sx={{ color: '#fff' }}>{message}</Typography>
    </Box>
  );
}

export function VideoCallErrorAlert({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        backgroundColor: '#000',
        p: 2,
      }}
    >
      <Alert severity="error" sx={{ width: '100%', maxWidth: '500px' }}>
        {children}
      </Alert>
    </Box>
  );
}
