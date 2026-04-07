const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../firebase");
const {
  verifyFirebaseToken,
  serializeTimestamps,
  fetchAndAuthorizeCallInvitation,
  respondToCallInvitation,
} = require("../helpers");

const CALL_INV_TIMESTAMP_FIELDS = ["scheduledTime", "createdAt", "respondedAt", "startedAt", "endedAt"];

/**
 * Fetch call invitations by a given field (studentId or employerId).
 */
async function fetchCallInvitations(userId, field) {
  const snapshot = await db
    .collection("call_invitations")
    .where(field, "==", userId)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...serializeTimestamps(doc.data(), CALL_INV_TIMESTAMP_FIELDS),
    }))
    .sort((a, b) => (b.scheduledTime || 0) - (a.scheduledTime || 0));
}

/**
 * Create call invitation (employer to student)
 * POST /api/call-invitations/create
 */
router.post("/call-invitations/create", verifyFirebaseToken, async (req, res) => {
  try {
    const { studentId, scheduledTime, duration, description } = req.body;
    const employerId = req.user.uid;

    if (!studentId || !scheduledTime || !duration) {
      return res.status(400).json({ error: "Missing required fields: studentId, scheduledTime, duration" });
    }

    if (duration <= 0 || duration > 480) {
      return res.status(400).json({ error: "Duration must be between 1 and 480 minutes" });
    }

    const inviteTime = new Date(scheduledTime);
    if (inviteTime <= new Date()) {
      return res.status(400).json({ error: "Scheduled time must be in the future" });
    }

    const employerDoc = await db.collection("users").doc(employerId).get();
    if (!employerDoc.exists) {
      return res.status(404).json({ error: "Employer not found" });
    }
    const employerData = employerDoc.data();

    let employerCompanyId = employerData.companyId;
    let employerCompanyName = "Company";
    if (employerCompanyId) {
      const companyDoc = await db.collection("companies").doc(employerCompanyId).get();
      if (companyDoc.exists) {
        employerCompanyName = companyDoc.data().name || "Company";
      }
    }

    const studentDoc = await db.collection("users").doc(studentId).get();
    if (!studentDoc.exists) {
      return res.status(404).json({ error: "Student not found" });
    }
    const studentData = studentDoc.data();

    // Check for overlapping invitations
    const overlappingQuery = await db
      .collection("call_invitations")
      .where("studentId", "==", studentId)
      .where("status", "in", ["pending", "accepted"])
      .get();

    const endTime = new Date(inviteTime.getTime() + duration * 60 * 1000);
    for (const doc of overlappingQuery.docs) {
      const invite = doc.data();
      const existingStart = new Date(invite.scheduledTime);
      const existingEnd = new Date(existingStart.getTime() + invite.duration * 60 * 1000);

      if (inviteTime < existingEnd && endTime > existingStart) {
        return res.status(409).json({ error: "Student has overlapping call at that time" });
      }
    }

    const jitsiRoom = `call-${employerId}-${studentId}-${Date.now()}`;

    const invitationRef = db.collection("call_invitations").doc();
    const invitationData = {
      id: invitationRef.id,
      employerId,
      employerName: employerData.displayName || employerData.email || "Employer",
      employerCompanyId,
      employerCompanyName,
      studentId,
      studentName: studentData.displayName || studentData.email || "Student",
      scheduledTime: admin.firestore.Timestamp.fromDate(inviteTime),
      duration,
      description: description || "",
      jitsiRoom,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      respondedAt: null,
      startedAt: null,
      endedAt: null,
    };

    await invitationRef.set(invitationData);

    await db.collection("users").doc(studentId).update({
      callInvitations: admin.firestore.FieldValue.arrayUnion(invitationRef.id),
    });

    await db.collection("users").doc(employerId).update({
      outgoingCallInvitations: admin.firestore.FieldValue.arrayUnion(invitationRef.id),
    });

    return res.status(201).json({
      success: true,
      invitationId: invitationRef.id,
      message: "Call invitation sent successfully",
    });
  } catch (err) {
    console.error("POST /api/call-invitations/create error:", err);
    return res.status(500).json({ error: "Failed to create call invitation" });
  }
});

/**
 * Get incoming call invitations (student view)
 * GET /api/call-invitations/incoming
 */
router.get("/call-invitations/incoming", verifyFirebaseToken, async (req, res) => {
  try {
    const invitations = await fetchCallInvitations(req.user.uid, "studentId");
    return res.json({ success: true, invitations });
  } catch (err) {
    console.error("GET /api/call-invitations/incoming error:", err);
    return res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

/**
 * Get outgoing call invitations (employer view)
 * GET /api/call-invitations/outgoing
 */
router.get("/call-invitations/outgoing", verifyFirebaseToken, async (req, res) => {
  try {
    const invitations = await fetchCallInvitations(req.user.uid, "employerId");
    return res.json({ success: true, invitations });
  } catch (err) {
    console.error("GET /api/call-invitations/outgoing error:", err);
    return res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

/**
 * Accept call invitation (student only)
 * POST /api/call-invitations/:invitationId/accept
 */
router.post("/call-invitations/:invitationId/accept", verifyFirebaseToken, async (req, res) => {
  try {
    await respondToCallInvitation(req.params.invitationId, req.user.uid, "accepted", res);
  } catch (err) {
    console.error("POST /api/call-invitations/:invitationId/accept error:", err);
    return res.status(500).json({ error: "Failed to accept invitation" });
  }
});

/**
 * Decline call invitation (student only)
 * POST /api/call-invitations/:invitationId/decline
 */
router.post("/call-invitations/:invitationId/decline", verifyFirebaseToken, async (req, res) => {
  try {
    await respondToCallInvitation(req.params.invitationId, req.user.uid, "declined", res);
  } catch (err) {
    console.error("POST /api/call-invitations/:invitationId/decline error:", err);
    return res.status(500).json({ error: "Failed to decline invitation" });
  }
});

/**
 * Cancel call invitation (employer only)
 * POST /api/call-invitations/:invitationId/cancel
 */
router.post("/call-invitations/:invitationId/cancel", verifyFirebaseToken, async (req, res) => {
  try {
    const result = await fetchAndAuthorizeCallInvitation(req.params.invitationId, req.user.uid, "employerId", res);
    if (!result) return;

    const { invitation } = result;
    const scheduledTime = new Date(invitation.scheduledTime);
    if (scheduledTime <= new Date()) {
      return res.status(409).json({ error: "Cannot cancel a call that has already started" });
    }

    await db.collection("call_invitations").doc(req.params.invitationId).update({
      status: "cancelled",
    });

    return res.json({ success: true, message: "Call invitation cancelled" });
  } catch (err) {
    console.error("POST /api/call-invitations/:invitationId/cancel error:", err);
    return res.status(500).json({ error: "Failed to cancel invitation" });
  }
});

/**
 * Join 1x1 call (get join details)
 * POST /api/call-invitations/:invitationId/join
 */
router.post("/call-invitations/:invitationId/join", verifyFirebaseToken, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const userId = req.user.uid;

    const invitationDoc = await db.collection("call_invitations").doc(invitationId).get();
    if (!invitationDoc.exists) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const invitation = invitationDoc.data();

    if (invitation.employerId !== userId && invitation.studentId !== userId) {
      return res.status(403).json({ error: "Not authorized to join this call" });
    }

    if (invitation.status !== "accepted") {
      return res.status(409).json({ error: "Call invitation must be accepted to join" });
    }

    const scheduledTime = new Date(invitation.scheduledTime);
    const endTime = new Date(scheduledTime.getTime() + invitation.duration * 60 * 1000);
    const now = new Date();
    const timeUntilStart = scheduledTime.getTime() - now.getTime();

    if (timeUntilStart > 15 * 60 * 1000) {
      return res.status(400).json({ error: "Call not yet available. Join window opens 15 minutes before start time." });
    }

    if (now > endTime) {
      return res.status(400).json({ error: "Call has ended" });
    }

    const userDoc = await db.collection("users").doc(userId).get();
    const userName = userDoc.data().displayName || userDoc.data().email || "User";

    if (!invitation.startedAt) {
      await db.collection("call_invitations").doc(invitationId).update({
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.json({
      success: true,
      jitsiRoom: invitation.jitsiRoom,
      userName,
      employerName: invitation.employerName,
      studentName: invitation.studentName,
      description: invitation.description,
    });
  } catch (err) {
    console.error("POST /api/call-invitations/:invitationId/join error:", err);
    return res.status(500).json({ error: "Failed to join call" });
  }
});

module.exports = router;
