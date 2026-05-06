import { auth } from "../firebase"
import { API_URL } from "../config"

export const FAIR_BOOTHS_NOT_LIVE_MESSAGE = "The career fair is not currently live."
export const FAIR_BOOTHS_GENERIC_ERROR = "Failed to load booths"

export type FetchFairBoothsResult<T> =
  | { ok: true; booths: T[] }
  | { ok: false; error: string }

export async function fetchFairBoothsForFair<T>(fairId: string): Promise<FetchFairBoothsResult<T>> {
  try {
    const headers: Record<string, string> = {}
    const token = await auth.currentUser?.getIdToken()
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${API_URL}/api/fairs/${fairId}/booths`, { headers })

    if (res.status === 403) {
      return { ok: false, error: FAIR_BOOTHS_NOT_LIVE_MESSAGE }
    }
    if (!res.ok) {
      return { ok: false, error: FAIR_BOOTHS_GENERIC_ERROR }
    }

    const data = (await res.json()) as { booths?: T[] }
    return { ok: true, booths: data.booths ?? [] }
  } catch (err) {
    console.error(err)
    return { ok: false, error: FAIR_BOOTHS_GENERIC_ERROR }
  }
}
