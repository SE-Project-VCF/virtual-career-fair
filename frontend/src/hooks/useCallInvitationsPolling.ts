import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CallInvitation } from '../utils/callInvitationApi';

const POLL_MS = 30000;

type FetchResult = { success: boolean; data?: CallInvitation[]; error?: string };

/**
 * Loads call invitations on mount, polls on an interval, and exposes refresh.
 */
export function useCallInvitationsPolling(
  fetchInvitations: () => Promise<FetchResult>
): {
  invitations: CallInvitation[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
} {
  const [invitations, setInvitations] = useState<CallInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchInvitations();

      if (!result.success) {
        setError(result.error || 'Failed to load invitations');
        return;
      }

      setInvitations(result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Load invitations error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchInvitations]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { invitations, loading, error, refresh: load, setError };
}
