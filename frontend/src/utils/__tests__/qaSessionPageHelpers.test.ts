import { describe, it, expect } from 'vitest';
import { qaSessionRadioKey } from '../qaSessionPageHelpers';

describe('qaSessionRadioKey', () => {
  it('uses sessionId when present', () => {
    expect(qaSessionRadioKey({ sessionId: 'abc', scheduledTime: 0 }, 0)).toBe('abc');
  });

  it('uses id when sessionId missing', () => {
    expect(qaSessionRadioKey({ id: 'id1', scheduledTime: 0 }, 0)).toBe('id1');
  });

  it('builds fallback from title and time', () => {
    const k = qaSessionRadioKey({ title: 'Talk', scheduledTime: 1700000000000 }, 2);
    expect(k).toContain('Talk');
    expect(k).toContain('-2');
  });
});
