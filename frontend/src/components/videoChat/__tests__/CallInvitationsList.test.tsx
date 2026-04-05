import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallInvitationsList } from '../CallInvitationsList';
import { authUtils } from '../../../utils/auth';

vi.mock('../../../utils/auth');

describe('CallInvitationsList', () => {
  const mockOnJoinCall = vi.fn();

  const mockInvitation = {
    inviteId: 'inv-1',
    callId: 'call-1',
    empName: 'Jane Smith',
    empEmail: 'jane@company.com',
    companyName: 'Tech Corp',
    proposedTimes: [
      {
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 90000000,
        status: 'proposed',
      },
    ],
    status: 'pending' as const,
    jitsiRoom: 'room-123',
    streamChatChannelId: 'channel-123',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.getIdToken as any).mockResolvedValue('test-token');
    global.fetch = vi.fn();
  });

  it('should render loading state initially', () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<CallInvitationsList />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render call invitations list', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    });

    render(<CallInvitationsList />);

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });
  });

  it('should render empty state when no invitations', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invitations: [] }),
    });

    render(<CallInvitationsList />);

    await waitFor(() => {
      expect(screen.getByText(/No invitations/i)).toBeInTheDocument();
    });
  });

  it('should handle fetch errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Failed to load invitations' }),
    });

    render(<CallInvitationsList />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('should call onJoinCall when join button clicked', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    });

    const user = userEvent.setup();
    render(<CallInvitationsList onJoinCall={mockOnJoinCall} />);

    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });

    const joinButton = screen.getByRole('button', { name: /Join/i });
    await user.click(joinButton);

    expect(mockOnJoinCall).toHaveBeenCalledWith('call-1', 'room-123', 'channel-123');
  });

  it('should display company name', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    });

    render(<CallInvitationsList />);

    await waitFor(() => {
      expect(screen.getByText(/Tech Corp/)).toBeInTheDocument();
    });
  });

  it('should show invitation status', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invitations: [{ ...mockInvitation, status: 'accepted' }],
      }),
    });

    render(<CallInvitationsList />);

    await waitFor(() => {
      expect(screen.getByText(/accepted/i)).toBeInTheDocument();
    });
  });
});
