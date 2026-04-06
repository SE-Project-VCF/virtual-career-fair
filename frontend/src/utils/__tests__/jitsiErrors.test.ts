import { describe, it, expect } from 'vitest';
import { formatConferenceErrorForMatch } from '../jitsiErrors';

describe('formatConferenceErrorForMatch', () => {
  it('returns string as-is', () => {
    expect(formatConferenceErrorForMatch('membersOnly')).toBe('membersOnly');
  });

  it('uses Error.message', () => {
    expect(formatConferenceErrorForMatch(new Error('membersOnly room'))).toBe('membersOnly room');
  });

  it('uses object message when present', () => {
    expect(formatConferenceErrorForMatch({ message: 'x' })).toBe('x');
  });

  it('stringifies plain objects', () => {
    expect(formatConferenceErrorForMatch({ code: 1 })).toBe('{"code":1}');
  });

  it('returns empty for unstringifiable', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatConferenceErrorForMatch(circular)).toBe('');
  });

  it('matches membersonly case-insensitively when used by caller', () => {
    const t = formatConferenceErrorForMatch({ message: 'MemberSOnly blocked' });
    expect(t.toLowerCase().includes('membersonly')).toBe(true);
  });
});
