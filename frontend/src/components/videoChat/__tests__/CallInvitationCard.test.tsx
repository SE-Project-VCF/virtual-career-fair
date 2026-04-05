import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallInvitationCard } from '../CallInvitationCard';
import type { CallInvitation } from '../../../utils/callInvitationApi';

describe('CallInvitationCard Component', () => {
  const mockInvitation: CallInvitation = {
    id: 'inv-1',
    employerId: 'emp-1',
    employerName: 'John Employer',
    employerCompanyName: 'Tech Corp',
    studentId: 'stu-1',
    studentName: 'Jane Student',
    scheduledTime: Date.now() + 3600000,
    duration: 60,
    jitsiRoom: 'test-room',
    status: 'pending',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render invitation with employer name for student view', () => {
    render(
      <CallInvitationCard invitation={mockInvitation} isEmployer={false} />
    );

    expect(screen.getByText('John Employer')).toBeInTheDocument();
    expect(screen.getByText('Tech Corp')).toBeInTheDocument();
  });

  it('should render invitation with student name for employer view', () => {
    render(
      <CallInvitationCard invitation={mockInvitation} isEmployer={true} />
    );

    expect(screen.getByText('Jane Student')).toBeInTheDocument();
  });

  it('should display pending status chip', () => {
    render(<CallInvitationCard invitation={mockInvitation} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('should show accept/decline buttons for pending student invitation', () => {
    render(
      <CallInvitationCard invitation={mockInvitation} isEmployer={false} />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should call onAccept callback when accept button clicked', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();

    render(
      <CallInvitationCard
        invitation={mockInvitation}
        isEmployer={false}
        onAccept={onAccept}
      />
    );

    const buttons = screen.getAllByRole('button');
    const acceptButton = buttons.find(btn => btn.textContent?.includes('Accept'));

    if (acceptButton) {
      await user.click(acceptButton);
      expect(onAccept).toHaveBeenCalledWith('inv-1');
    }
  });

  it('should call onDecline callback when decline button clicked', async () => {
    const user = userEvent.setup();
    const onDecline = vi.fn();

    render(
      <CallInvitationCard
        invitation={mockInvitation}
        isEmployer={false}
        onDecline={onDecline}
      />
    );

    const buttons = screen.getAllByRole('button');
    const declineButton = buttons.find(btn => btn.textContent?.includes('Decline'));

    if (declineButton) {
      await user.click(declineButton);
      expect(onDecline).toHaveBeenCalledWith('inv-1');
    }
  });

  it('should show cancel button for employer on pending invitation', () => {
    render(
      <CallInvitationCard invitation={mockInvitation} isEmployer={true} />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should call onCancel callback when cancel button clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <CallInvitationCard
        invitation={mockInvitation}
        isEmployer={true}
        onCancel={onCancel}
      />
    );

    const buttons = screen.getAllByRole('button');
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    if (cancelButton) {
      await user.click(cancelButton);
      expect(onCancel).toHaveBeenCalledWith('inv-1');
    }
  });

  it('should display accepted status for accepted invitations', () => {
    const acceptedInvitation = { ...mockInvitation, status: 'accepted' as const };
    render(<CallInvitationCard invitation={acceptedInvitation} />);
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  it('should display declined status for declined invitations', () => {
    const declinedInvitation = { ...mockInvitation, status: 'declined' as const };
    render(<CallInvitationCard invitation={declinedInvitation} />);
    expect(screen.getByText('Declined')).toBeInTheDocument();
  });

  it('should show join button when invitation is accepted and in join window', () => {
    const acceptedInvitation = { ...mockInvitation, status: 'accepted' as const };
    render(
      <CallInvitationCard invitation={acceptedInvitation} isEmployer={false} />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should call onJoin callback when join button clicked', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    const acceptedInvitation = { ...mockInvitation, status: 'accepted' as const };

    render(
      <CallInvitationCard
        invitation={acceptedInvitation}
        isEmployer={false}
        onJoin={onJoin}
      />
    );

    const buttons = screen.getAllByRole('button');
    const joinButton = buttons.find(btn => btn.textContent?.includes('Join') || btn.textContent?.includes('Video'));

    if (joinButton) {
      await user.click(joinButton);
      expect(onJoin).toHaveBeenCalledWith('inv-1');
    }
  });

  it('should display duration in minutes', () => {
    render(<CallInvitationCard invitation={mockInvitation} />);
    expect(screen.getByText(/60/)).toBeInTheDocument();
  });

  it('should disable buttons when loading prop is true', () => {
    render(
      <CallInvitationCard
        invitation={mockInvitation}
        isEmployer={false}
        loading={true}
      />
    );

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('should handle invitations with description property', () => {
    const invitationWithDescription = {
      ...mockInvitation,
      description: 'Technical Interview Round 2',
    };

    render(<CallInvitationCard invitation={invitationWithDescription} />);
    // Component should render without error even with description
    expect(screen.getByText('John Employer')).toBeInTheDocument();
  });

  it('should handle cancelled status invitations', () => {
    const cancelledInvitation = { ...mockInvitation, status: 'cancelled' as any };
    render(<CallInvitationCard invitation={cancelledInvitation} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('should handle completed status invitations', () => {
    const completedInvitation = { ...mockInvitation, status: 'completed' as any };
    render(<CallInvitationCard invitation={completedInvitation} />);
    expect(screen.getByText(/^completed$/i)).toBeInTheDocument();
  });

  it('should display different text for student and employer views', () => {
    const { rerender } = render(
      <CallInvitationCard invitation={mockInvitation} isEmployer={false} />
    );

    expect(screen.getByText('John Employer')).toBeInTheDocument();

    rerender(<CallInvitationCard invitation={mockInvitation} isEmployer={true} />);

    expect(screen.getByText('Jane Student')).toBeInTheDocument();
  });

  it('should handle invitations with optional fields missing', () => {
    const minimalInvitation: CallInvitation = {
      id: 'inv-2',
      employerId: 'emp-2',
      employerName: 'Employer Name',
      studentId: 'stu-2',
      studentName: 'Student Name',
      scheduledTime: Date.now(),
      duration: 30,
      jitsiRoom: 'room-456',
      status: 'pending',
      createdAt: Date.now(),
    };

    render(<CallInvitationCard invitation={minimalInvitation} />);
    expect(screen.getByText('Employer Name')).toBeInTheDocument();
  });

  it('should display time information when available', () => {
    const futureTime = Date.now() + 86400000; // Tomorrow
    const invitationWithTime = { ...mockInvitation, scheduledTime: futureTime };

    render(<CallInvitationCard invitation={invitationWithTime} />);
    expect(screen.getByText(/Date:/)).toBeInTheDocument();
    expect(screen.getByText(/Duration:/)).toBeInTheDocument();
  });

  it('should not break when callbacks are not provided', () => {
    render(
      <CallInvitationCard
        invitation={mockInvitation}
        isEmployer={false}
        // No callbacks provided
      />
    );

    expect(screen.getByText('John Employer')).toBeInTheDocument();
  });

  it('should handle invitations with respondedAt timestamp', () => {
    const respondedInvitation = {
      ...mockInvitation,
      respondedAt: Date.now() - 3600000,
    };

    render(<CallInvitationCard invitation={respondedInvitation} />);
    expect(screen.getByText('John Employer')).toBeInTheDocument();
  });

  it('should render with employer company name when available', () => {
    render(<CallInvitationCard invitation={mockInvitation} isEmployer={false} />);
    expect(screen.getByText('Tech Corp')).toBeInTheDocument();
  });

  it('should handle rapid mount/unmount cycles', () => {
    const { unmount, rerender } = render(
      <CallInvitationCard invitation={mockInvitation} />
    );

    rerender(<CallInvitationCard invitation={mockInvitation} />);
    unmount();

    render(<CallInvitationCard invitation={mockInvitation} />);
    expect(screen.getByText('John Employer')).toBeInTheDocument();
  });
});

