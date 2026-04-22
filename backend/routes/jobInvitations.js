const { Router } = require("express");
const { db } = require("../firebase");
const admin = require("firebase-admin");
const {
  removeUndefined,
  verifyFirebaseToken,
  verifyRepOrOwner,
  fetchRelatedJobInvDetails,
  serializeJobInvTimestamps,
} = require("../helpers");

const router = Router();

/**
 * Build a standard invitation response object from doc data + related details.
 */
function buildInvitationResponse(docId, invData, related) {
  return {
    id: docId,
    jobId: invData.jobId,
    companyId: invData.companyId,
    studentId: invData.studentId,
    sentBy: invData.sentBy,
    sentVia: invData.sentVia,
    status: invData.status,
    ...serializeJobInvTimestamps(invData),
    message: invData.message || null,
    ...related,
  };
}

/**
 * Sort invitations by sentAt descending (newest first), null-safe.
 */
function sortBySentAtDesc(invitations) {
  return invitations.sort((a, b) => {
    if (!a.sentAt && !b.sentAt) return 0;
    if (!a.sentAt) return 1;
    if (!b.sentAt) return -1;
    return b.sentAt - a.sentAt;
  });
}

/**
 * Verify job exists and user is authorized, returning { jobData, companyId }.
 * Returns null and sends error response if unauthorized.
 */
async function verifyJobAccess(jobId, userId, res) {
  const jobDoc = await db.collection("jobs").doc(jobId).get();
  if (!jobDoc.exists) {
    res.status(404).json({ error: "Job not found" });
    return null;
  }
  const jobData = jobDoc.data();
  const authCheck = await verifyRepOrOwner(userId, jobData.companyId);
  if (authCheck) {
    res.status(authCheck.status).json({ error: authCheck.error });
    return null;
  }
  return { jobData, companyId: jobData.companyId };
}

/* ----------------------------------------------------
   SEND JOB INVITATION(S) TO STUDENT(S)
---------------------------------------------------- */
router.post("/job-invitations/send", verifyFirebaseToken, async (req, res) => {
  try {
    const { jobId, studentIds, message, sentVia, userId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required" });
    }

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: "At least one student ID is required" });
    }

    if (!sentVia || sentVia !== "notification") {
      return res.status(400).json({ error: "sentVia must be 'notification' (chat invitations are not supported)" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const access = await verifyJobAccess(jobId, userId, res);
    if (!access) return;
    const { companyId } = access;

    // Validate all student IDs exist and are students
    const studentChecks = await Promise.all(
      studentIds.map(async (studentId) => {
        const studentDoc = await db.collection("users").doc(studentId).get();
        if (!studentDoc.exists) {
          return { valid: false, id: studentId, error: "Student not found" };
        }
        const studentData = studentDoc.data();
        if (studentData.role !== "student") {
          return { valid: false, id: studentId, error: "User is not a student" };
        }
        return { valid: true, id: studentId };
      })
    );

    const invalidStudents = studentChecks.filter((check) => !check.valid);
    if (invalidStudents.length > 0) {
      return res.status(400).json({
        error: `Invalid student IDs: ${invalidStudents.map((s) => s.id).join(", ")}`,
      });
    }

    // Create invitation records
    const batch = db.batch();
    const invitationIds = [];

    for (const studentId of studentIds) {
      const invitationRef = db.collection("jobInvitations").doc();
      invitationIds.push(invitationRef.id);

      const invitationData = removeUndefined({
        jobId,
        companyId,
        studentId,
        sentBy: userId,
        sentVia,
        status: "sent",
        sentAt: admin.firestore.Timestamp.now(),
        message: message || undefined,
      });

      batch.set(invitationRef, invitationData);
    }

    await batch.commit();
    console.log(`Successfully created ${invitationIds.length} invitation(s)`);

    return res.json({
      success: true,
      invitationsSent: studentIds.length,
      invitationIds,
    });
  } catch (err) {
    console.error("Error sending job invitations:", err);
    return res.status(500).json({ error: "Failed to send invitations", details: err.message });
  }
});

/* ----------------------------------------------------
   GET INVITATIONS RECEIVED BY A STUDENT
---------------------------------------------------- */
router.get("/job-invitations/received", verifyFirebaseToken, async (req, res) => {
  try {
    const { userId, status } = req.query;
    console.log("Fetching job invitations for student");

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Verify user exists and is a student
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    if (userData.role !== "student") {
      return res.status(403).json({ error: "Only students can view received invitations" });
    }

    let query = db.collection("jobInvitations").where("studentId", "==", userId);
    if (status) {
      query = query.where("status", "==", status);
    }

    const invitationsSnapshot = await query.get();

    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();
        const related = await fetchRelatedJobInvDetails(invData, { job: true, jobFull: true, company: true, sender: true }); // NOSONAR - fetchRelatedJobInvDetails is async
        return buildInvitationResponse(doc.id, invData, related);
      })
    );

    sortBySentAtDesc(invitations);

    return res.json({ invitations });
  } catch (err) {
    console.error("Error fetching received invitations:", err);
    return res.status(500).json({ error: "Failed to fetch invitations", details: err.message });
  }
});

/* ----------------------------------------------------
   GET INVITATIONS SENT BY A REPRESENTATIVE
---------------------------------------------------- */
router.get("/job-invitations/sent", verifyFirebaseToken, async (req, res) => {
  try {
    const { userId, companyId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    let query;
    if (companyId) {
      query = db.collection("jobInvitations").where("companyId", "==", companyId);
    } else {
      query = db.collection("jobInvitations").where("sentBy", "==", userId);
    }

    const invitationsSnapshot = await query.orderBy("sentAt", "desc").get();

    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();
        const related = await fetchRelatedJobInvDetails(invData, { student: true, job: true }); // NOSONAR - fetchRelatedJobInvDetails is async
        return buildInvitationResponse(doc.id, invData, related);
      })
    );

    return res.json({ invitations });
  } catch (err) {
    console.error("Error fetching sent invitations:", err);
    return res.status(500).json({ error: "Failed to fetch invitations", details: err.message });
  }
});

/* ----------------------------------------------------
   UPDATE JOB INVITATION STATUS
---------------------------------------------------- */
router.patch("/job-invitations/:id/status", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, userId } = req.body;

    if (!status || !["viewed", "clicked"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'viewed' or 'clicked'" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const invitationRef = db.collection("jobInvitations").doc(id);
    const invitationDoc = await invitationRef.get();

    if (!invitationDoc.exists) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const invitationData = invitationDoc.data();

    if (invitationData.studentId !== userId) {
      return res.status(403).json({ error: "You can only update your own invitations" });
    }

    const updateData = { status };

    if (status === "viewed" && !invitationData.viewedAt) {
      updateData.viewedAt = admin.firestore.Timestamp.now();
    } else if (status === "clicked") {
      updateData.clickedAt = admin.firestore.Timestamp.now();
      if (!invitationData.viewedAt) {
        updateData.viewedAt = admin.firestore.Timestamp.now();
      }
    }

    await invitationRef.update(updateData);

    return res.json({ success: true });
  } catch (err) {
    console.error("Error updating invitation status:", err);
    return res.status(500).json({ error: "Failed to update invitation status", details: err.message });
  }
});

/* ----------------------------------------------------
   GET INVITATION STATS FOR A JOB
---------------------------------------------------- */
router.get("/job-invitations/stats/:jobId", verifyFirebaseToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const access = await verifyJobAccess(jobId, userId, res);
    if (!access) return;

    const invitationsSnapshot = await db
      .collection("jobInvitations")
      .where("jobId", "==", jobId)
      .get();

    const totalSent = invitationsSnapshot.size;
    let totalViewed = 0;
    let totalClicked = 0;

    invitationsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.viewedAt) totalViewed++;
      if (data.clickedAt) totalClicked++;
    });

    return res.json({
      totalSent,
      totalViewed,
      totalClicked,
      viewRate: totalSent > 0 ? ((totalViewed / totalSent) * 100).toFixed(1) : "0",
      clickRate: totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : "0",
    });
  } catch (err) {
    console.error("Error fetching invitation stats:", err);
    return res.status(500).json({ error: "Failed to fetch stats", details: err.message });
  }
});

/* ----------------------------------------------------
   GET DETAILED INVITATION DATA FOR A JOB
---------------------------------------------------- */
router.get("/job-invitations/details/:jobId", verifyFirebaseToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const access = await verifyJobAccess(jobId, userId, res);
    if (!access) return;

    const invitationsSnapshot = await db
      .collection("jobInvitations")
      .where("jobId", "==", jobId)
      .get();

    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();
        const related = await fetchRelatedJobInvDetails(invData, { student: true, studentExtra: true }); // NOSONAR - fetchRelatedJobInvDetails is async
        return {
          id: doc.id,
          studentId: invData.studentId,
          student: related.student || null,
          status: invData.status,
          ...serializeJobInvTimestamps(invData),
          message: invData.message || null,
        };
      })
    );

    sortBySentAtDesc(invitations);

    return res.json({ invitations });
  } catch (err) {
    console.error("Error fetching detailed invitations:", err);
    return res.status(500).json({ error: "Failed to fetch invitation details", details: err.message });
  }
});

/* ----------------------------------------------------
   GET SPECIFIC INVITATION BY ID (Dynamic route - must be last)
---------------------------------------------------- */
router.get("/job-invitations/:invitationId", verifyFirebaseToken, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const authUser = req.user;

    if (!invitationId) {
      return res.status(400).json({ error: "Invitation ID is required" });
    }

    const invDoc = await db.collection("jobInvitations").doc(invitationId).get();
    if (!invDoc.exists) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const invData = invDoc.data();

    if (invData.studentId !== authUser.uid) {
      return res.status(403).json({ error: "Not authorized to view this invitation" });
    }

    const related = await fetchRelatedJobInvDetails(invData, { job: true, jobFull: true, company: true, sender: true }); // NOSONAR - fetchRelatedJobInvDetails is async
    const invitation = buildInvitationResponse(invDoc.id, invData, related);

    return res.json({ data: invitation });
  } catch (err) {
    console.error("Error fetching invitation:", err);
    return res.status(500).json({ error: "Failed to fetch invitation", details: err.message });
  }
});

module.exports = router;
