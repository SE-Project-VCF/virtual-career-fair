/**
 * Shared Q&A session time formatting and join-window state for booth / session UIs.
 */

export function coerceQaSessionScheduledTime(scheduledTime: unknown): Date {
  if (
    typeof scheduledTime === 'object' &&
    scheduledTime !== null &&
    '_seconds' in scheduledTime &&
    typeof (scheduledTime as { _seconds: unknown })._seconds === 'number'
  ) {
    return new Date((scheduledTime as { _seconds: number })._seconds * 1000);
  }
  return new Date(scheduledTime as string | number);
}

export function formatQaSessionScheduledDisplay(scheduledTime: number | string): string {
  const sessionTime = new Date(scheduledTime);
  if (Number.isNaN(sessionTime.getTime())) {
    return 'Invalid date';
  }
  return sessionTime.toLocaleString();
}

/** "Starts in" line: e.g. "2h 15m" or "45m" */
export function formatStartsInCountdown(minutesUntilStart: number): string {
  const hoursPart = minutesUntilStart > 60 ? `${Math.floor(minutesUntilStart / 60)}h ` : '';
  return `${hoursPart}${minutesUntilStart % 60}m`;
}

export type QaSessionJoinUiState = {
  minutesUntilStart: number;
  minutesUntilEnd: number;
  isUpcoming: boolean;
  isActive: boolean;
  isPast: boolean;
  canJoin: boolean;
  joinButtonLabel: string;
};

/**
 * Join window: from 15 minutes before start through end of scheduled duration.
 */
export function getQaSessionJoinUiState(
  scheduledTime: number | string,
  durationMinutes: number,
  now: Date = new Date()
): QaSessionJoinUiState {
  const sessionTime = new Date(scheduledTime);
  const timeUntilStart = sessionTime.getTime() - now.getTime();
  const minutesUntilStart = Math.floor(timeUntilStart / (1000 * 60));

  const endTime = new Date(sessionTime.getTime() + durationMinutes * 60 * 1000);
  const timeUntilEnd = endTime.getTime() - now.getTime();
  const minutesUntilEnd = Math.floor(timeUntilEnd / (1000 * 60));

  const isUpcoming = timeUntilStart > 0;
  const isActive = timeUntilStart <= 0 && timeUntilEnd > 0;
  const isPast = timeUntilEnd <= 0;
  const canJoin = minutesUntilStart <= 15 && timeUntilEnd > 0;

  let joinButtonLabel = 'Session Ended';
  if (isActive) {
    joinButtonLabel = 'Join Now';
  } else if (isUpcoming && canJoin) {
    joinButtonLabel = 'Join Session';
  } else if (isUpcoming) {
    joinButtonLabel = `Available in ${Math.max(0, minutesUntilStart)}m`;
  }

  return {
    minutesUntilStart,
    minutesUntilEnd,
    isUpcoming,
    isActive,
    isPast,
    canJoin,
    joinButtonLabel,
  };
}
