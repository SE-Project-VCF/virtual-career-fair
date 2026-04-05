import { describe, it, expect } from 'vitest';
import {
  coerceQaSessionScheduledTime,
  formatQaSessionScheduledDisplay,
  formatStartsInCountdown,
  getQaSessionJoinUiState,
} from '../qaSessionUi';

describe('qaSessionUi', () => {
  describe('coerceQaSessionScheduledTime', () => {
    it('converts Firestore-like _seconds object to Date', () => {
      const d = coerceQaSessionScheduledTime({ _seconds: 1700000000, _nanoseconds: 0 });
      expect(d.getTime()).toBe(1700000000 * 1000);
    });

    it('parses ISO string', () => {
      const d = coerceQaSessionScheduledTime('2026-01-15T12:00:00.000Z');
      expect(d.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    });
  });

  describe('formatQaSessionScheduledDisplay', () => {
    it('returns Invalid date for invalid input', () => {
      expect(formatQaSessionScheduledDisplay('not-a-date')).toBe('Invalid date');
    });

    it('formats valid timestamp', () => {
      const s = formatQaSessionScheduledDisplay(1700000000000);
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toBe('Invalid date');
    });
  });

  describe('formatStartsInCountdown', () => {
    it('formats under one hour', () => {
      expect(formatStartsInCountdown(45)).toBe('45m');
    });

    it('formats over one hour', () => {
      expect(formatStartsInCountdown(90)).toBe('1h 30m');
    });

    it('formats exactly over 60 minutes with hour part', () => {
      expect(formatStartsInCountdown(61)).toBe('1h 1m');
    });
  });

  describe('getQaSessionJoinUiState', () => {
    const durationMin = 60;

    it('upcoming session far in future: cannot join yet', () => {
      const start = new Date('2026-06-01T14:00:00.000Z');
      const now = new Date('2026-06-01T12:00:00.000Z');
      const state = getQaSessionJoinUiState(start.getTime(), durationMin, now);
      expect(state.isUpcoming).toBe(true);
      expect(state.canJoin).toBe(false);
      expect(state.joinButtonLabel).toMatch(/^Available in /);
    });

    it('within 15 minutes before start: can join', () => {
      const start = new Date('2026-06-01T12:10:00.000Z');
      const now = new Date('2026-06-01T12:00:00.000Z');
      const state = getQaSessionJoinUiState(start.getTime(), durationMin, now);
      expect(state.isUpcoming).toBe(true);
      expect(state.canJoin).toBe(true);
      expect(state.joinButtonLabel).toBe('Join Session');
    });

    it('active session', () => {
      const start = new Date('2026-06-01T11:30:00.000Z');
      const now = new Date('2026-06-01T12:00:00.000Z');
      const state = getQaSessionJoinUiState(start.getTime(), durationMin, now);
      expect(state.isActive).toBe(true);
      expect(state.joinButtonLabel).toBe('Join Now');
      expect(state.canJoin).toBe(true);
    });

    it('ended session', () => {
      const start = new Date('2026-06-01T09:00:00.000Z');
      const now = new Date('2026-06-01T12:00:00.000Z');
      const state = getQaSessionJoinUiState(start.getTime(), durationMin, now);
      expect(state.isPast).toBe(true);
      expect(state.joinButtonLabel).toBe('Session Ended');
      expect(state.canJoin).toBe(false);
    });
  });
});
