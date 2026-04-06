import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCallInvitation,
  getIncomingCallInvitations,
  getOutgoingCallInvitations,
  acceptCallInvitation,
  declineCallInvitation,
  cancelCallInvitation,
  joinCall,
  type CallInvitation,
} from '../callInvitationApi';
import { authUtils } from '../auth';

// Mock authUtils
vi.mock('../auth', () => ({
  authUtils: {
    getIdToken: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

const mockToken = 'test-token-123';
const mockInvitation: CallInvitation = {
  id: 'inv-1',
  employerId: 'emp-1',
  employerName: 'Test Company',
  employerCompanyName: 'Test Inc',
  studentId: 'std-1',
  studentName: 'John Doe',
  scheduledTime: Date.now() + 86400000,
  duration: 60,
  description: 'Interview call',
  jitsiRoom: 'test-call-room',
  status: 'pending',
  createdAt: Date.now(),
};

describe('callInvitationApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.getIdToken as any).mockResolvedValue(mockToken);
  });

  describe('createCallInvitation', () => {
    it('should create a call invitation successfully', async () => {
      const mockResponse = { invitationId: 'inv-1' };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await createCallInvitation('std-1', new Date(Date.now() + 86400000), 60, 'Test call');

      expect(result.success).toBe(true);
      expect(result.invitationId).toBe('inv-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/call-invitations/create'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token-123' }),
        })
      );
    });

    it('should handle creation failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid student ID' }),
      });

      const result = await createCallInvitation('invalid', new Date(), 60);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid student ID');
    });

    it('should handle network errors during creation', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await createCallInvitation('std-1', new Date(), 60);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle missing authentication token', async () => {
      (authUtils.getIdToken as any).mockResolvedValueOnce(null);

      const result = await createCallInvitation('std-1', new Date(), 60);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');
    });
  });

  describe('getIncomingCallInvitations', () => {
    it('should fetch incoming invitations successfully', async () => {
      const mockResponse = { invitations: [mockInvitation] };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getIncomingCallInvitations();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].id).toBe('inv-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/call-invitations/incoming'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token-123' }),
        })
      );
    });

    it('should handle empty invitations list', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [] }),
      });

      const result = await getIncomingCallInvitations();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle fetch errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const result = await getIncomingCallInvitations();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server error');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection failed'));

      const result = await getIncomingCallInvitations();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection failed');
    });
  });

  describe('getOutgoingCallInvitations', () => {
    it('should fetch outgoing invitations successfully', async () => {
      const mockResponse = { invitations: [mockInvitation] };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getOutgoingCallInvitations();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/call-invitations/outgoing'),
        expect.anything()
      );
    });

    it('should handle errors when fetching outgoing invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Unauthorized' }),
      });

      const result = await getOutgoingCallInvitations();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('acceptCallInvitation', () => {
    it('should accept a call invitation successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await acceptCallInvitation('inv-1');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/call-invitations/inv-1/accept'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle acceptance errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invitation not found' }),
      });

      const result = await acceptCallInvitation('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation not found');
    });

    it('should handle network errors during acceptance', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

      const result = await acceptCallInvitation('inv-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });
  });

  describe('declineCallInvitation', () => {
    it('should decline a call invitation successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await declineCallInvitation('inv-1');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/call-invitations/inv-1/decline'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle decline errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Already responded' }),
      });

      const result = await declineCallInvitation('inv-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already responded');
    });
  });

  describe('cancelCallInvitation', () => {
    it('should cancel a call invitation successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await cancelCallInvitation('inv-1');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/call-invitations/inv-1/cancel'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle cancel errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Cannot cancel accepted invitation' }),
      });

      const result = await cancelCallInvitation('inv-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot cancel accepted invitation');
    });
  });

  describe('joinCall', () => {
    it('should join a call successfully', async () => {
      const mockResponse = {
        jitsiRoom: 'test-call-room',
        userName: 'John Doe',
        employerName: 'Test Company',
      };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await joinCall('inv-1');

      expect(result.success).toBe(true);
      expect(result.jitsiRoom).toBe('test-call-room');
      expect(result.userName).toBe('John Doe');
      expect(result.employerName).toBe('Test Company');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/call-invitations/inv-1/join'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle join errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Call is not active' }),
      });

      const result = await joinCall('inv-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Call is not active');
    });

    it('should handle network errors during join', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection lost'));

      const result = await joinCall('inv-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection lost');
    });
  });
});
