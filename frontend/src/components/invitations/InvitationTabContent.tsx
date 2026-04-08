import { Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { CallInvitation } from '../../utils/callInvitationApi';

type InvitationTabContentProps = {
  invitations: CallInvitation[];
  emptyMessage: string;
  children: (items: CallInvitation[]) => ReactNode;
};

/**
 * Empty state or stacked list for a single invitation tab (employer / student UIs).
 */
export function InvitationTabContent({
  invitations,
  emptyMessage,
  children,
}: Readonly<InvitationTabContentProps>) {
  if (invitations.length === 0) {
    return (
      <Typography sx={{ textAlign: 'center', color: '#999', py: 3 }}>{emptyMessage}</Typography>
    );
  }
  return <Stack spacing={2}>{children(invitations)}</Stack>;
}
