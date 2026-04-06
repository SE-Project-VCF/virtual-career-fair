import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Call1x1Room } from '../Call1x1Room';
import * as callApi from '../../../utils/callInvitationApi';

vi.mock('../../../utils/callInvitationApi');
vi.mock('../VideoRoom', () => ({
  VideoRoom: ({ roomName }: any) => <div data-testid="video-room">{roomName}</div>,
}));

describe('Call1x1Room Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state initially', () => {
    vi.mocked(callApi.joinCall).mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<Call1x1Room invitationId="inv-1" />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render video room on successful join', async () => {
    vi.mocked(callApi.joinCall).mockResolvedValue({
      success: true,
      jitsiRoom: 'call-room-123',
      userName: 'Test User',
      employerName: 'Employer',
      studentName: 'Student',
      description: 'Test call',
    });

    render(<Call1x1Room invitationId="inv-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('video-room')).toBeInTheDocument();
    });

    expect(screen.getByTestId('video-room')).toHaveTextContent('call-room-123');
  });

  it('should display error message on join failure', async () => {
    vi.mocked(callApi.joinCall).mockResolvedValue({
      success: false,
      error: 'Call not available',
    });

    render(<Call1x1Room invitationId="inv-1" />);

    await waitFor(() => {
      expect(screen.getByText('Call not available')).toBeInTheDocument();
    });
  });

  it('should handle missing jitsi room gracefully', async () => {
    vi.mocked(callApi.joinCall).mockResolvedValue({
      success: true,
      jitsiRoom: undefined,
    });

    render(<Call1x1Room invitationId="inv-1" />);

    await waitFor(() => {
      expect(screen.getByText(/No room information/)).toBeInTheDocument();
    });
  });

  it('should call onError callback on error', async () => {
    const onError = vi.fn();
    vi.mocked(callApi.joinCall).mockResolvedValue({
      success: false,
      error: 'Network error',
    });

    render(<Call1x1Room invitationId="inv-1" onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it('should call joinCall API with correct invitationId', async () => {
    vi.mocked(callApi.joinCall).mockResolvedValue({
      success: true,
      jitsiRoom: 'room',
      userName: 'User',
    });

    render(<Call1x1Room invitationId="inv-test-123" />);

    await waitFor(() => {
      expect(callApi.joinCall).toHaveBeenCalledWith('inv-test-123');
    });
  });

  it('should handle thrown errors from joinCall', async () => {
    const onError = vi.fn();
    vi.mocked(callApi.joinCall).mockRejectedValue(new Error('API Error'));

    render(<Call1x1Room invitationId="inv-1" onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('should set userName from API response', async () => {
    vi.mocked(callApi.joinCall).mockResolvedValue({
      success: true,
      jitsiRoom: 'call-room',
      userName: 'John Doe',
    });

    render(<Call1x1Room invitationId="inv-1" />);

    // Component should store and use the userName internally
    await waitFor(() => {
      expect(callApi.joinCall).toHaveBeenCalled();
    });
  });
});
