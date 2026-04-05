import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addToShortlist, removeFromShortlist } from '../videoChatApi';
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
        '/api/shortlist/remove',
        expect.objectContaining({
          method: 'POST',
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
});
