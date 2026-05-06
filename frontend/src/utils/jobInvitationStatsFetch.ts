/**
 * Fetches per-job invitation stats for the company jobs list (authenticated).
 */
export async function fetchJobInvitationStats<T>(
  apiUrl: string,
  jobId: string,
  userId: string,
  getIdToken: () => Promise<string | null>
): Promise<{ ok: true; stats: T } | { ok: false }> {
  if (!userId) {
    return { ok: false };
  }

  try {
    const token = await getIdToken();
    if (!token) {
      return { ok: false };
    }

    const response = await fetch(
      `${apiUrl}/api/job-invitations/stats/${jobId}?userId=${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return { ok: false };
    }

    const stats = (await response.json()) as T;
    return { ok: true, stats };
  } catch {
    return { ok: false };
  }
}
