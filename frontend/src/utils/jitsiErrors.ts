/**
 * Normalize Jitsi / conference error values for logging and string matching.
 * Avoids implicit [object Object] when stringifying unknown error shapes.
 */
export function formatConferenceErrorForMatch(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') {
      return msg;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return '';
  }
}
