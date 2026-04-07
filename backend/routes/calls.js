const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../firebase");
const { verifyFirebaseToken } = require("../helpers");
const { streamServerClient } = require("../streamServerClient");

/**
 * Employer schedules 1v1 call with student
 * POST /api/calls/schedule-1v1
 */
router.post("/calls/schedule-1v1", verifyFirebaseToken, async (req, res) => {
  try {
    const { studentId, proposedTimes, notes } = req.body;
    const employerId = req.user.uid;

    if (!studentId || !proposedTimes || proposedTimes.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify student exists
    const studentDoc = await db.collection("users").doc(studentId).get();
    if (!studentDoc.exists) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Get employer info
    const employerDoc = await db.collection("users").doc(employerId).get();
    const employerData = employerDoc.data();

    // Generate unique room name and channel ID
    const callId = `call_${employerId}_${studentId}_${Date.now()}`;
    const jitsiRoom = `call_1v1_${callId}`;
    const channelId = `call_1v1_${callId}`;

    // Create StreamChat channel
    try {
      const channel = streamServerClient.channel("messaging", channelId, {
        members: [employerId, studentId],
        created_by_id: employerId,
      });
      await channel.create();
    } catch (channelErr) {
      console.error("StreamChat channel creation error:", channelErr);
    }

    // Create call record
    const callRef = db
      .collection("employers")
      .doc(employerId)
      .collection("scheduled_calls")
      .doc();

    const callData = {
      callId: callRef.id,
      studentId,
      studentName: studentDoc.data().name || studentDoc.data().firstName || "",
      studentEmail: studentDoc.data().email || "",
      employerId,
      employerName: employerData.name || employerData.firstName || "",
      employerEmail: employerData.email || "",
      proposedTimes: proposedTimes.map((time) => ({
        startTime: admin.firestore.Timestamp.fromDate(new Date(time.startTime)),
        endTime: admin.firestore.Timestamp.fromDate(new Date(time.endTime)),
        status: "proposed",
      })),
      status: "pending",
      jitsiRoom,
      streamChatChannelId: channelId,
      notes: notes || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await callRef.set(callData);

    // Create mirror record in student's invitations
    const inviteRef = db
      .collection("students")
      .doc(studentId)
      .collection("call_invitations")
      .doc();

    await inviteRef.set({
      inviteId: inviteRef.id,
      callId: callRef.id,
      empId: employerId,
      empName: employerData.name || employerData.firstName || "",
      empEmail: employerData.email || "",
      companyName: employerData.companyName || "",
      proposedTimes: callData.proposedTimes,
      status: "pending",
      jitsiRoom,
      streamChatChannelId: channelId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      callId: callRef.id,
      message: "Call invitation sent to student",
    });
  } catch (err) {
    console.error("POST /api/calls/schedule-1v1 error:", err);
    return res.status(500).json({ error: "Failed to schedule call" });
  }
});

/**
 * Get employer's scheduled 1v1 calls
 * GET /api/calls/my-scheduled
 */
router.get("/calls/my-scheduled", verifyFirebaseToken, async (req, res) => {
  try {
    const employerId = req.user.uid;

    const callsSnapshot = await db
      .collection("employers")
      .doc(employerId)
      .collection("scheduled_calls")
      .orderBy("createdAt", "desc")
      .get();

    const calls = callsSnapshot.docs.map((doc) => ({
      callId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis() || null,
      updatedAt: doc.data().updatedAt?.toMillis() || null,
      proposedTimes: doc.data().proposedTimes.map((time) => ({
        startTime: time.startTime?.toMillis() || null,
        endTime: time.endTime?.toMillis() || null,
        status: time.status,
      })),
    }));

    return res.json({ success: true, calls });
  } catch (err) {
    console.error("GET /api/calls/my-scheduled error:", err);
    return res.status(500).json({ error: "Failed to fetch scheduled calls" });
  }
});

/**
 * Get student's call invitations
 * GET /api/calls/my-invitations
 */
router.get("/calls/my-invitations", verifyFirebaseToken, async (req, res) => {
  try {
    const studentId = req.user.uid;

    const invitesSnapshot = await db
      .collection("students")
      .doc(studentId)
      .collection("call_invitations")
      .orderBy("createdAt", "desc")
      .get();

    const invitations = invitesSnapshot.docs.map((doc) => ({
      inviteId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis() || null,
      respondedAt: doc.data().respondedAt?.toMillis() || null,
      proposedTimes: doc.data().proposedTimes.map((time) => ({
        startTime: time.startTime?.toMillis() || null,
        endTime: time.endTime?.toMillis() || null,
        status: time.status,
      })),
    }));

    return res.json({ success: true, invitations });
  } catch (err) {
    console.error("GET /api/calls/my-invitations error:", err);
    return res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

/**
 * Student responds to call invitation (accept/decline)
 * PATCH /api/calls/{callId}/respond
 */
router.patch("/calls/:callId/respond", verifyFirebaseToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const { response, acceptedTimeIndex, inviteId } = req.body;
    const studentId = req.user.uid;

    if (!response || !["accepted", "declined"].includes(response)) {
      return res.status(400).json({ error: "Invalid response" });
    }

    if (response === "accepted" && acceptedTimeIndex === undefined) {
      return res.status(400).json({ error: "Accepted time index required" });
    }

    // Update student's invitation
    if (inviteId) {
      await db
        .collection("students")
        .doc(studentId)
        .collection("call_invitations")
        .doc(inviteId)
        .update({
          status: response,
          respondedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(response === "accepted" && {
            finalTime: admin.firestore.FieldValue.serverTimestamp(),
            acceptedTimeIndex,
          }),
        });
    }

    // Find and update employer's call record
    const callsSnapshot = await db
      .collection("employers")
      .collectionGroup("scheduled_calls")
      .where("callId", "==", callId)
      .limit(1)
      .get();

    if (callsSnapshot.empty) {
      return res.status(404).json({ error: "Call not found" });
    }

    const callDoc = callsSnapshot.docs[0];
    await callDoc.ref.update({
      status: response,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(response === "accepted" && {
        finalTime: callDoc.data().proposedTimes[acceptedTimeIndex].startTime,
      }),
    });

    return res.json({ success: true, message: `Call ${response}` });
  } catch (err) {
    console.error("PATCH /api/calls/:callId/respond error:", err);
    return res.status(500).json({ error: "Failed to respond to invitation" });
  }
});

/**
 * Get call details and join link
 * GET /api/calls/{callId}/join
 */
router.get("/calls/:callId/join", verifyFirebaseToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.uid;

    let callData = null;

    const employerCallsSnapshot = await db
      .collectionGroup("scheduled_calls")
      .where("callId", "==", callId)
      .limit(1)
      .get();

    if (!employerCallsSnapshot.empty) {
      callData = employerCallsSnapshot.docs[0].data();
    }

    if (!callData) {
      return res.status(404).json({ error: "Call not found" });
    }

    if (userId !== callData.employerId && userId !== callData.studentId) {
      return res.status(403).json({ error: "Not authorized to join this call" });
    }

    const userDoc = await db.collection("users").doc(userId).get();
    const userName = userDoc.data().name || userDoc.data().firstName || "";

    return res.json({
      success: true,
      callId,
      jitsiRoom: callData.jitsiRoom,
      streamChatChannelId: callData.streamChatChannelId,
      userName,
      callData: {
        studentName: callData.studentName,
        employerName: callData.employerName,
        status: callData.status,
      },
    });
  } catch (err) {
    console.error("GET /api/calls/:callId/join error:", err);
    return res.status(500).json({ error: "Failed to get call details" });
  }
});

/**
 * Cancel a call
 * PATCH /api/calls/{callId}/cancel
 */
router.patch("/calls/:callId/cancel", verifyFirebaseToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.uid;

    const callsSnapshot = await db
      .collectionGroup("scheduled_calls")
      .where("callId", "==", callId)
      .limit(1)
      .get();

    if (callsSnapshot.empty) {
      return res.status(404).json({ error: "Call not found" });
    }

    const callDoc = callsSnapshot.docs[0];
    const callData = callDoc.data();

    if (userId !== callData.employerId && userId !== callData.studentId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await callDoc.ref.update({
      status: "cancelled",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, message: "Call cancelled" });
  } catch (err) {
    console.error("PATCH /api/calls/:callId/cancel error:", err);
    return res.status(500).json({ error: "Failed to cancel call" });
  }
});

module.exports = router;
