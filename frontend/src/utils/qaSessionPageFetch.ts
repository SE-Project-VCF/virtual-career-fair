import { coerceQaSessionScheduledTime } from './qaSessionUi';

const JOIN_WINDOW_MS = 15 * 60 * 1000;

export async function fetchIdTokenWithRetries(
  getToken: () => Promise<string | null>,
  maxAttempts: number,
  delayMs: number
): Promise<string | null> {
  let idToken: string | null = null;
  let attempts = 0;

  while (!idToken && attempts < maxAttempts) {
    try {
      const token = await getToken();
      if (token) {
        idToken = token;
      } else {
        console.warn(`[QA Session] Token is null (attempt ${attempts + 1}/${maxAttempts})`);
      }
    } catch (tokenErr) {
      console.warn(
        `[QA Session] Failed to get ID token (attempt ${attempts + 1}/${maxAttempts}):`,
        tokenErr
      );
    }

    if (!idToken) {
      attempts += 1;
      if (attempts < maxAttempts) {
        console.log(`[QA Session] Retrying token fetch (${attempts}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return idToken;
}

export function availableSessionsFromQaApiPayload(data: Record<string, unknown>): unknown[] {
  const list = data.qaSessions;
  if (Array.isArray(list) && list.length > 0) {
    return list;
  }
  if (data.qaSession) {
    return [data.qaSession];
  }
  return [];
}

type SessionLike = { scheduledTime: unknown; duration: number };

export function filterJoinableQaSessions(sessions: unknown[], now: Date): SessionLike[] {
  return sessions.filter((s): s is SessionLike => {
    if (!s || typeof s !== 'object' || !('duration' in s)) {
      return false;
    }
    const row = s as SessionLike;
    const sessionTime = coerceQaSessionScheduledTime(row.scheduledTime);
    const endTime = new Date(sessionTime.getTime() + row.duration * 60 * 1000);
    const timeUntilStart = sessionTime.getTime() - now.getTime();
    return timeUntilStart <= JOIN_WINDOW_MS && now <= endTime;
  });
}
