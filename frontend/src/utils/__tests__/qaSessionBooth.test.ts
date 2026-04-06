import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeQaSessionsIntoBooth, fetchQaSessionsAndMergeIntoBooth } from '../qaSessionBooth';
import { authUtils } from '../auth';

vi.mock('../auth', () => ({
  authUtils: {
    getIdToken: vi.fn(),
  },
}));

describe('qaSessionBooth', () => {
  describe('mergeQaSessionsIntoBooth', () => {
    it('prefers qaSessions array when non-empty', () => {
      const booth: Record<string, unknown> = {};
      const s1 = { id: 'a' };
      const s2 = { id: 'b' };
      mergeQaSessionsIntoBooth(booth, { qaSessions: [s1, s2] });
      expect(booth.qaSessions).toEqual([s1, s2]);
      expect(booth.qaSession).toBe(s1);
    });

    it('uses qaSession when qaSessions empty but legacy qaSession present', () => {
      const booth: Record<string, unknown> = {};
      const legacy = { id: 'legacy' };
      mergeQaSessionsIntoBooth(booth, { qaSessions: [], qaSession: legacy });
      expect(booth.qaSession).toBe(legacy);
      expect(booth.qaSessions).toEqual([legacy]);
    });

    it('uses only qaSession when qaSessions missing', () => {
      const booth: Record<string, unknown> = {};
      const legacy = { id: 'only' };
      mergeQaSessionsIntoBooth(booth, { qaSession: legacy });
      expect(booth.qaSession).toBe(legacy);
      expect(booth.qaSessions).toEqual([legacy]);
    });
  });

  describe('fetchQaSessionsAndMergeIntoBooth', () => {
    beforeEach(() => {
      vi.mocked(authUtils.getIdToken).mockResolvedValue('test-token');
      globalThis.fetch = vi.fn();
    });

    it('merges payload when response ok and mounted', async () => {
      const booth: Record<string, unknown> = {};
      const payload = { qaSession: { title: 'Hi' } };
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => payload,
      } as Response);

      await fetchQaSessionsAndMergeIntoBooth('booth-1', booth, () => true);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/booth/booth-1/qa-session'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      );
      expect(booth.qaSession).toEqual({ title: 'Hi' });
    });

    it('skips merge when unmounted', async () => {
      const booth: Record<string, unknown> = {};
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ qaSession: { title: 'x' } }),
      } as Response);

      await fetchQaSessionsAndMergeIntoBooth('b', booth, () => false);

      expect(booth.qaSession).toBeUndefined();
    });

    it('warns when response not ok', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const booth: Record<string, unknown> = {};
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await fetchQaSessionsAndMergeIntoBooth('b', booth, () => true);

      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('warns on network error', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network'));

      await fetchQaSessionsAndMergeIntoBooth('b', {}, () => true);

      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('warns when fetch returns no response object', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(globalThis.fetch).mockResolvedValue(undefined as unknown as Response);

      await fetchQaSessionsAndMergeIntoBooth('b', {}, () => true);

      expect(warn).toHaveBeenCalledWith(
        'Failed to fetch Q&A sessions - status:',
        'no response'
      );
      warn.mockRestore();
    });
  });
});
