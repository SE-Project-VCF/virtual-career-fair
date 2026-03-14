import { collection, getDocs, doc, getDoc, Timestamp } from "firebase/firestore"
import { db } from "../firebase"

export interface FairStatus {
  isLive: boolean
  scheduleName: string | null
  scheduleDescription: string | null
  activeScheduleId: string | null
  requiresInviteCode: boolean
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
          activeScheduleId: activeSchedule?.id || null,
          requiresInviteCode: Boolean(activeSchedule?.inviteCode),
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
        activeScheduleId: activeSchedule.id,
        requiresInviteCode: Boolean(activeSchedule.inviteCode),
      }
    }

    return {
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
      activeScheduleId: null,
      requiresInviteCode: false,
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
          activeScheduleId: null,
          requiresInviteCode: false,
        }
      }
    } catch (fallbackErr) {
      console.error("Error fetching manual status:", fallbackErr)
    }
    return {
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
      activeScheduleId: null,
      requiresInviteCode: false,
    }
  }
}

/**
 * Get the currently active schedule if any
 */
async function getActiveSchedule(now: number): Promise<{ id: string; name: string | null; description: string | null; inviteCode?: string | null } | null> {
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
          id: scheduleDoc.id,
          name: scheduleData.name || null,
          description: scheduleData.description || null,
          inviteCode: scheduleData.inviteCode || null,
        }
      }
    }
  }

  return null
}

