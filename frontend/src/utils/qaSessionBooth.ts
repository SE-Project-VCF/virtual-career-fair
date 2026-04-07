import { API_URL } from '../config';
import { authUtils } from './auth';

export type QaSessionApiPayload = {
  qaSessions?: unknown[];
  qaSession?: unknown;
};

/**
 * Merges GET /api/booth/:boothId/qa-session JSON into booth payload (array + legacy single session).
 */
export function mergeQaSessionsIntoBooth(
  boothData: Record<string, unknown>,
  qaData: QaSessionApiPayload
): void {
  if (qaData.qaSessions && qaData.qaSessions.length > 0) {
    boothData.qaSessions = qaData.qaSessions;
    boothData.qaSession = qaData.qaSessions[0];
  } else if (qaData.qaSession) {
    boothData.qaSession = qaData.qaSession;
    boothData.qaSessions = [qaData.qaSession];
  }
}

export async function fetchQaSessionsAndMergeIntoBooth(
  boothId: string,
  boothData: Record<string, unknown>,
  isMounted: () => boolean
): Promise<void> {
  try {
    const token = await authUtils.getIdToken();
    const qaRes = await fetch(`${API_URL}/api/booth/${boothId}/qa-session`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!qaRes?.ok) {
      console.warn(
        'Failed to fetch Q&A sessions - status:',
        qaRes?.status ?? 'no response'
      );
      return;
    }
    const qaData = (await qaRes.json()) as QaSessionApiPayload;
    if (isMounted()) {
      mergeQaSessionsIntoBooth(boothData, qaData);
    }
  } catch (err) {
    console.warn('Failed to fetch Q&A sessions:', err);
  }
}
