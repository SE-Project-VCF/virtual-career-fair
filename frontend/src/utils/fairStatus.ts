import { collection, getDocs, doc, getDoc, Timestamp } from "firebase/firestore"
import { db } from "../firebase"

export interface FairStatus {
  isLive: boolean
  scheduleName: string | null
  scheduleDescription: string | null
}

/**
 * Evaluate if fair should be live based on schedules and manual toggle
 * Checks all schedules - fair is live if ANY schedule is active
 * Manual toggle takes precedence over schedules
 */
export async function evaluateFairStatus(): Promise<FairStatus> {
  try {
    const now = Date.now()

    // First check manual toggle status
    const statusDoc = await getDoc(doc(db, "fairSettings", "liveStatus"))
    if (statusDoc.exists()) {
      const data = statusDoc.data()
      if (data.isLive === true) {
        // Manual toggle is on - check if there's an active schedule for name/description
        const activeSchedule = await getActiveSchedule(now)
        return {
          isLive: true,
          scheduleName: activeSchedule?.name || null,
          scheduleDescription: activeSchedule?.description || null,
        }
      }
    }

    // Check schedules
    const activeSchedule = await getActiveSchedule(now)
    if (activeSchedule) {
      return {
        isLive: true,
        scheduleName: activeSchedule.name || null,
        scheduleDescription: activeSchedule.description || null,
      }
    }

    return {
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    }
  } catch (err) {
    console.error("Error evaluating fair status:", err)
    // Fallback to manual status on error
    try {
      const statusDoc = await getDoc(doc(db, "fairSettings", "liveStatus"))
      if (statusDoc.exists()) {
        const data = statusDoc.data()
        return {
          isLive: data.isLive || false,
          scheduleName: null,
          scheduleDescription: null,
        }
      }
    } catch (fallbackErr) {
      console.error("Error fetching manual status:", fallbackErr)
    }
    return {
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    }
  }
}

/**
 * Get the currently active schedule if any
 */
async function getActiveSchedule(now: number): Promise<{ name: string | null; description: string | null } | null> {
  const schedulesSnapshot = await getDocs(collection(db, "fairSchedules"))

  for (const scheduleDoc of schedulesSnapshot.docs) {
    const scheduleData = scheduleDoc.data()

    if (scheduleData.startTime && scheduleData.endTime) {
      const startTime = scheduleData.startTime instanceof Timestamp
        ? scheduleData.startTime.toMillis()
        : scheduleData.startTime
      const endTime = scheduleData.endTime instanceof Timestamp
        ? scheduleData.endTime.toMillis()
        : scheduleData.endTime

      // Check if current time is within this schedule's range
      if (now >= startTime && now <= endTime) {
        return {
          name: scheduleData.name || null,
          description: scheduleData.description || null,
        }
      }
    }
  }

  return null
}

