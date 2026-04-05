import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addToShortlist,
  removeFromShortlist,
  getShortlist,
  respondToCall,
  getMyCallInvitations,
  cancelCall,
} from '../videoChatApi';
import { getAuth } from 'firebase/auth';

// Mock Firebase Auth
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('videoChatApi Utilities', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();

    // Mock Firebase auth
    (getAuth as any).mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue(mockToken),
      },
    });
  });

  describe('addToShortlist', () => {
    it('should add student to shortlist successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Added to shortlist' }),
      });

      const result = await addToShortlist('student-123', 'Strong candidate');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shortlist/add',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual({ success: true, message: 'Added to shortlist' });
    });

    it('should add without notes', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await addToShortlist('student-456');

      expect(result.success).toBe(true);
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Duplicate shortlist entry' }),
      });

      await expect(addToShortlist('student-789')).rejects.toThrow('Duplicate shortlist entry');
    });

    it('should handle unauthenticated user', async () => {
      (getAuth as any).mockReturnValue({
        currentUser: null,
      });

      await expect(addToShortlist('student-123')).rejects.toThrow('User not authenticated');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network failed'));

      await expect(addToShortlist('student-123')).rejects.toThrow('Network failed');
    });

    it('should handle API error without JSON response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        statusText: 'Internal Server Error',
      });

      await expect(addToShortlist('student-123')).rejects.toThrow('API Error: Internal Server Error');
    });
  });

  describe('removeFromShortlist', () => {
    it('should remove student from shortlist successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Removed from shortlist' }),
      });

      const result = await removeFromShortlist('student-123');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shortlist/student-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result).toEqual({ success: true, message: 'Removed from shortlist' });
    });

    it('should handle removal errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Student not in shortlist' }),
      });

      await expect(removeFromShortlist('student-456')).rejects.toThrow('Student not in shortlist');
    });
  });

  describe('getShortlist', () => {
    it('should fetch shortlist', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ students: [] }),
      });

      const result = await getShortlist();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shortlist/list',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${mockToken}` }),
        })
      );
      expect(result).toEqual({ students: [] });
    });
  });

  describe('getMyCallInvitations', () => {
    it('should fetch invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [] }),
      });

      await getMyCallInvitations();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/calls/my-invitations',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${mockToken}` }),
        })
      );
    });
  });

  describe('respondToCall', () => {
    it('should PATCH respond endpoint with body', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      await respondToCall('call-1', 'accepted', 0, 'inv-1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/calls/call-1/respond',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            response: 'accepted',
            acceptedTimeIndex: 0,
            inviteId: 'inv-1',
          }),
        })
      );
    });
  });

  describe('cancelCall', () => {
    it('should PATCH cancel endpoint', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await cancelCall('call-2');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/calls/call-2/cancel',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });
});
