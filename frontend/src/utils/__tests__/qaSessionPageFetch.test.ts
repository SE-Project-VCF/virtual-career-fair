import { describe, it, expect, vi } from 'vitest';
import {
  fetchIdTokenWithRetries,
  availableSessionsFromQaApiPayload,
  filterJoinableQaSessions,
} from '../qaSessionPageFetch';

describe('qaSessionPageFetch', () => {
  describe('fetchIdTokenWithRetries', () => {
    it('returns token on first success', async () => {
      const getToken = vi.fn().mockResolvedValueOnce('tok');
      await expect(fetchIdTokenWithRetries(getToken, 3, 10)).resolves.toBe('tok');
      expect(getToken).toHaveBeenCalledTimes(1);
    });

    it('retries until token is returned', async () => {
      const getToken = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('ok');
      await expect(fetchIdTokenWithRetries(getToken, 3, 1)).resolves.toBe('ok');
      expect(getToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('availableSessionsFromQaApiPayload', () => {
    it('prefers non-empty qaSessions array', () => {
      const a = { id: '1' };
      const b = { id: '2' };
      expect(
        availableSessionsFromQaApiPayload({ qaSessions: [a, b], qaSession: { id: 'x' } })
      ).toEqual([a, b]);
    });

    it('uses legacy qaSession', () => {
      const legacy = { id: 'L' };
      expect(availableSessionsFromQaApiPayload({ qaSession: legacy })).toEqual([legacy]);
    });

    it('returns empty when nothing present', () => {
      expect(availableSessionsFromQaApiPayload({})).toEqual([]);
    });
  });

  describe('filterJoinableQaSessions', () => {
    it('keeps session in join window', () => {
      const start = new Date('2026-06-01T12:10:00.000Z');
      const now = new Date('2026-06-01T12:00:00.000Z');
      const sessions = [{ scheduledTime: start.getTime(), duration: 60 }];
      const out = filterJoinableQaSessions(sessions, now);
      expect(out).toHaveLength(1);
    });

    it('drops invalid rows', () => {
      expect(filterJoinableQaSessions([null, {}], new Date())).toHaveLength(0);
    });
  });
});
