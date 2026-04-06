import { Box } from '@mui/material';
import type { ReactNode } from 'react';

type VideoRoomShellProps = {
  children: ReactNode;
  /** Outer container height (e.g. `100vh` for full page, `100%` when parent sets height) */
  height?: string;
};

/**
 * Shared full-bleed black layout wrapping {@link VideoRoom} (Q&A and 1x1 calls).
 */
export function VideoRoomShell({ children, height = '100vh' }: Readonly<VideoRoomShellProps>) {
  return (
    <Box
      sx={{
        display: 'flex',
        height,
        backgroundColor: '#000',
        p: 0,
        m: 0,
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          width: '100%',
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
