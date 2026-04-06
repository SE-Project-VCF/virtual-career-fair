import { coerceQaSessionScheduledTime } from './qaSessionUi';

/**
 * Stable React key for Q&A session radio rows when API ids may be missing.
 */
export function qaSessionRadioKey(session: Record<string, unknown>, index: number): string {
  const id = session.sessionId ?? session.id;
  if (typeof id === 'string' && id.length > 0) {
    return id;
  }
  const t = coerceQaSessionScheduledTime(session.scheduledTime).getTime();
  const title = typeof session.title === 'string' ? session.title : 'session';
  return `${title}-${t}-${index}`;
}
