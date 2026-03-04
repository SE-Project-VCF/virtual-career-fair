import { API_URL } from "../config"

export interface FairStatus {
  isLive: boolean
  scheduleName: string | null
  scheduleDescription: string | null
}

/**
 * Evaluate live status for a specific fair.
 * Calls the backend API — checks the fair's own isLive flag and startTime/endTime window.
 */
export async function evaluateFairStatusForFair(fairId: string): Promise<FairStatus> {
  try {
    const res = await fetch(`${API_URL}/api/fairs/${fairId}/status`)
    if (!res.ok) {
      return { isLive: false, scheduleName: null, scheduleDescription: null }
    }
    const data = await res.json()
    return {
      isLive: data.isLive ?? false,
      scheduleName: data.name ?? null,
      scheduleDescription: data.description ?? null,
    }
  } catch (err) {
    console.error("Error evaluating fair status:", err)
    return { isLive: false, scheduleName: null, scheduleDescription: null }
  }
}
