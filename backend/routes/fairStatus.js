const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const admin = require("firebase-admin");
const { verifyAdmin, verifyFirebaseToken, parseUTCToTimestamp, generateInviteCode, removeUndefined } = require("../helpers");

/* ----------------------------------------------------
   HELPER: Evaluate if fair should be live based on schedules
   Checks all schedules - fair is live if ANY schedule is active
---------------------------------------------------- */
async function evaluateFairStatus() {
  try {
    const now = admin.firestore.Timestamp.now();

    // Check all schedules in the schedules collection
    const schedulesSnapshot = await db.collection("fairSchedules").get();

    // Check if any schedule is currently active
    for (const scheduleDoc of schedulesSnapshot.docs) {
      const scheduleData = scheduleDoc.data();

      if (scheduleData.startTime && scheduleData.endTime) {
        const startTime = scheduleData.startTime;
        const endTime = scheduleData.endTime;

        // Check if current time is within this schedule's range
        if (now.toMillis() >= startTime.toMillis() && now.toMillis() <= endTime.toMillis()) {
          return {
            isLive: true,
            source: "schedule",
            activeScheduleId: scheduleDoc.id,
            activeScheduleName: scheduleData.name || null,
            activeScheduleDescription: scheduleData.description || null
          };
        }
      }
    }

    // No active schedules found, check manual toggle status
    const statusDoc = await db.collection("fairSettings").doc("liveStatus").get();
    if (!statusDoc.exists) {
      return { isLive: false, source: "manual" };
    }

    const data = statusDoc.data();
    return { isLive: data.isLive || false, source: "manual" };
  } catch (err) {
    console.error("Error evaluating fair status:", err);
    // Fallback to manual status on error
    const statusDoc = await db.collection("fairSettings").doc("liveStatus").get();
    if (!statusDoc.exists) {
      return { isLive: false, source: "manual" };
    }
    const data = statusDoc.data();
    return { isLive: data.isLive || false, source: "manual" };
  }
}

/**
 * Resolves schedule times for updates, using existing values as fallback.
 * Returns { start, end } or null if validation fails.
 */
function resolveScheduleTimes(existingData, startTime, endTime) {
  const start = startTime === undefined
    ? existingData.startTime
    : parseUTCToTimestamp(startTime);
  const end = endTime === undefined
    ? existingData.endTime
    : parseUTCToTimestamp(endTime);

  if (!start || !end) return { error: "Both start time and end time are required" };
  if (end.toMillis() <= start.toMillis()) return { error: "End time must be after start time" };
  return { start, end };
}

/* ----------------------------------------------------
   GET CAREER FAIR LIVE STATUS
---------------------------------------------------- */
router.get("/fair-status", async (req, res) => {
  try {
    const status = await evaluateFairStatus();
    return res.json({
      isLive: status.isLive,
      source: status.source,
      scheduleName: status.activeScheduleName || null,
      scheduleDescription: status.activeScheduleDescription || null
    });
  } catch (err) {
    console.error("Error fetching fair status:", err);
    return res.status(500).json({ error: "Failed to fetch fair status" });
  }
});

/* ----------------------------------------------------
   TOGGLE CAREER FAIR LIVE STATUS (Admin only)
   Note: Manual toggle will override schedule temporarily
---------------------------------------------------- */
router.post("/toggle-fair-status", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Verify user is administrator
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    if (userData.role !== "administrator") {
      return res.status(403).json({ error: "Only administrators can toggle fair status" });
    }

    // Get current evaluated status (combines schedule + manual)
    const currentStatus = await evaluateFairStatus();

    // Toggle based on the current evaluated status
    const newStatus = !currentStatus.isLive;

    // Update manual status (this overrides any schedule)
    const statusRef = db.collection("fairSettings").doc("liveStatus");
    await statusRef.set({
      isLive: newStatus,
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: userId,
    }, { merge: true });

    // Manual toggle disables all schedules to allow manual override
    // Note: We don't disable schedules here - manual toggle takes precedence
    // Schedules will be re-evaluated when manual toggle is turned off

    return res.json({ success: true, isLive: newStatus });
  } catch (err) {
    console.error("Error toggling fair status:", err);
    return res.status(500).json({ error: "Failed to toggle fair status" });
  }
});

/* ----------------------------------------------------
   GET ALL FAIR SCHEDULES (Admin only)
---------------------------------------------------- */
router.get("/fair-schedules", async (req, res) => {
  try {
    const userId = req.query.userId;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    const schedulesSnapshot = await db.collection("fairSchedules")
      .orderBy("startTime", "asc")
      .get();

    const schedules = [];
    schedulesSnapshot.forEach((doc) => {
      const data = doc.data();
      schedules.push({
        id: doc.id,
        name: data.name || null,
        startTime: data.startTime ? data.startTime.toMillis() : null,
        endTime: data.endTime ? data.endTime.toMillis() : null,
        description: data.description || null,
        createdAt: data.createdAt ? data.createdAt.toMillis() : null,
        updatedAt: data.updatedAt ? data.updatedAt.toMillis() : null,
        createdBy: data.createdBy || null,
        updatedBy: data.updatedBy || null,
      });
    });

    return res.json({ schedules });
  } catch (err) {
    console.error("Error fetching fair schedules:", err);
    return res.status(500).json({ error: "Failed to fetch fair schedules" });
  }
});

/* ----------------------------------------------------
   GET PUBLIC FAIR SCHEDULES (All users)
---------------------------------------------------- */
router.get("/public/fair-schedules", async (req, res) => {
  try {
    // Get all schedules (no orderBy to avoid composite index requirement)
    const schedulesSnapshot = await db.collection("fairSchedules").get();

    const schedules = [];
    schedulesSnapshot.forEach((doc) => {
      const data = doc.data();
      schedules.push({
        id: doc.id,
        name: data.name || null,
        startTime: data.startTime ? data.startTime.toMillis() : null,
        endTime: data.endTime ? data.endTime.toMillis() : null,
        description: data.description || null,
      });
    });

    // Sort by start time in memory (ascending)
    schedules.sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime - b.startTime;
    });

    return res.json({ schedules });
  } catch (err) {
    console.error("Error fetching public fair schedules:", err);
    return res.status(500).json({ error: "Failed to fetch fair schedules" });
  }
});

/* ----------------------------------------------------
   CREATE FAIR SCHEDULE (Admin only)
---------------------------------------------------- */
router.post("/fair-schedules", async (req, res) => {
  try {
    const { userId, name, startTime, endTime, description } = req.body;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: "Start time and end time are required" });
    }

    // Parse dates as UTC to ensure consistent storage
    const start = parseUTCToTimestamp(startTime);
    const end = parseUTCToTimestamp(endTime);
    if (end.toMillis() <= start.toMillis()) {
      return res.status(400).json({ error: "End time must be after start time" });
    }

    // Create schedule document
    const scheduleData = {
      name: name || null,
      description: description || null,
      startTime: start,
      endTime: end,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      createdBy: userId,
      updatedBy: userId,
    };

    const scheduleRef = await db.collection("fairSchedules").add(scheduleData);

    return res.json({
      success: true,
      schedule: {
        id: scheduleRef.id,
        name: scheduleData.name,
        startTime: start.toMillis(),
        endTime: end.toMillis(),
        description: scheduleData.description,
      },
    });
  } catch (err) {
    console.error("Error creating fair schedule:", err);
    return res.status(500).json({ error: "Failed to create fair schedule" });
  }
});

/* ----------------------------------------------------
   UPDATE FAIR SCHEDULE (Admin only)
---------------------------------------------------- */
router.put("/fair-schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, name, startTime, endTime, description } = req.body;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    const scheduleRef = db.collection("fairSchedules").doc(id);
    const scheduleDoc = await scheduleRef.get();

    if (!scheduleDoc.exists) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const updateData = {
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: userId,
    };

    // Update fields if provided
    if (name !== undefined) updateData.name = name || null;
    if (description !== undefined) updateData.description = description || null;

    if (startTime !== undefined || endTime !== undefined) {
      const timeResult = resolveScheduleTimes(scheduleDoc.data(), startTime, endTime);
      if (timeResult.error) {
        return res.status(400).json({ error: timeResult.error });
      }
      updateData.startTime = timeResult.start;
      updateData.endTime = timeResult.end;
    }

    await scheduleRef.update(updateData);

    const updatedDoc = await scheduleRef.get();
    const updatedData = updatedDoc.data();

    return res.json({
      success: true,
      schedule: {
        id: updatedDoc.id,
        name: updatedData.name || null,
        startTime: updatedData.startTime ? updatedData.startTime.toMillis() : null,
        endTime: updatedData.endTime ? updatedData.endTime.toMillis() : null,
        description: updatedData.description || null,
      },
    });
  } catch (err) {
    console.error("Error updating fair schedule:", err);
    return res.status(500).json({ error: "Failed to update fair schedule" });
  }
});

/* ----------------------------------------------------
   DELETE FAIR SCHEDULE (Admin only)
---------------------------------------------------- */
router.delete("/fair-schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    const scheduleRef = db.collection("fairSchedules").doc(id);
    const scheduleDoc = await scheduleRef.get();

    if (!scheduleDoc.exists) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    await scheduleRef.delete();

    return res.json({ success: true, message: "Schedule deleted successfully" });
  } catch (err) {
    console.error("Error deleting fair schedule:", err);
    return res.status(500).json({ error: "Failed to delete fair schedule" });
  }
});

/* ----------------------------------------------------
   UPDATE COMPANY INVITE CODE (Owner only)
---------------------------------------------------- */
router.post("/update-invite-code", async (req, res) => {
  try {
    const { companyId, userId, newInviteCode } = req.body;

    if (!companyId || !userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify user is the owner of the company
    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res.status(404).json({ error: "Company not found" });
    }

    const companyData = companyDoc.data();
    if (companyData.ownerId !== userId) {
      return res.status(403).json({ error: "Only the company owner can update the invite code" });
    }

    // Generate new invite code if not provided, or validate provided one
    let inviteCode;
    if (newInviteCode) {
      // Validate custom invite code (alphanumeric, 4-20 characters)
      if (!/^[A-Z0-9]{4,20}$/.test(newInviteCode.toUpperCase())) {
        return res.status(400).json({
          error: "Invite code must be 4-20 characters and contain only letters and numbers"
        });
      }
      inviteCode = newInviteCode.toUpperCase();
    } else {
      // Generate random 8-character code
      inviteCode = generateInviteCode();
    }

    // Duplicate check: ensure no other company uses this invite code
    const companiesSnapshot = await db.collection("companies").where("inviteCode", "==", inviteCode.toUpperCase()).get();
    const companiesWithCode = companiesSnapshot.docs.filter((doc) => doc.id !== companyId);

    if (companiesWithCode.length > 0) {
      return res.status(400).json({ error: "This invite code is already in use by another company" });
    }

    await db.runTransaction(async (transaction) => {
      const companyRef = db.collection("companies").doc(companyId);
      const companySnap = await transaction.get(companyRef);

      if (!companySnap.exists) {
        throw new Error("Company not found");
      }

      transaction.update(companyRef, {
        inviteCode: inviteCode.toUpperCase(),
        inviteCodeUpdatedAt: admin.firestore.Timestamp.now(),
      });
    });

    return res.json({ success: true, inviteCode });
  } catch (err) {
    console.error("Error updating invite code:", err);
    return res.status(500).json({ error: "Failed to update invite code" });
  }
});

module.exports = router;
