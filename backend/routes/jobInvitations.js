const { Router } = require("express");
const { db } = require("../firebase");
const admin = require("firebase-admin");
const { removeUndefined, verifyFirebaseToken, verifyRepOrOwner } = require("../helpers");

const router = Router();

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

    // Get the job to verify it exists and get company info
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyId = jobData.companyId;

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

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

      // Invitation record created

      batch.set(invitationRef, invitationData);
    }

    await batch.commit();
    console.log(`Successfully created ${invitationIds.length} invitation(s)`);

    // Chat invitations are no longer supported - only dashboard notifications are used

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

    // Build query (without orderBy to avoid needing a composite index)
    let query = db.collection("jobInvitations").where("studentId", "==", userId);

    if (status) {
      query = query.where("status", "==", status);
    }

    const invitationsSnapshot = await query.get();
    // Fetching invitations

    // Get job and company details for each invitation
    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();

        // Get job details
        let jobDetails = null;
        try {
          const jobDoc = await db.collection("jobs").doc(invData.jobId).get();
          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            jobDetails = {
              id: jobDoc.id,
              companyId: jobData.companyId,
              name: jobData.name,
              description: jobData.description,
              majorsAssociated: jobData.majorsAssociated,
              applicationLink: jobData.applicationLink || null,
              applicationForm: jobData.applicationForm || null,
            };
          }
        } catch (err) {
          console.error(`Error fetching job ${invData.jobId}:`, err);
        }

        // Get company details
        let companyDetails = null;
        try {
          const companyDoc = await db.collection("companies").doc(invData.companyId).get();
          if (companyDoc.exists) {
            const companyData = companyDoc.data();
            companyDetails = {
              id: companyDoc.id,
              companyName: companyData.companyName,
              boothId: companyData.boothId || null,
            };
          }
        } catch (err) {
          console.error(`Error fetching company ${invData.companyId}:`, err);
        }

        // Get sender details
        let senderDetails = null;
        try {
          const senderDoc = await db.collection("users").doc(invData.sentBy).get();
          if (senderDoc.exists) {
            const senderData = senderDoc.data();
            senderDetails = {
              id: senderDoc.id,
              firstName: senderData.firstName,
              lastName: senderData.lastName,
              email: senderData.email,
            };
          }
        } catch (err) {
          console.error(`Error fetching sender ${invData.sentBy}:`, err);
        }

        return {
          id: doc.id,
          jobId: invData.jobId,
          companyId: invData.companyId,
          studentId: invData.studentId,
          sentBy: invData.sentBy,
          sentVia: invData.sentVia,
          status: invData.status,
          sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
          viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
          clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
          message: invData.message || null,
          job: jobDetails,
          company: companyDetails,
          sender: senderDetails,
        };
      })
    );

    // Sort invitations by sentAt descending (newest first) in memory
    invitations.sort((a, b) => {
      if (!a.sentAt && !b.sentAt) return 0;
      if (!a.sentAt) return 1;
      if (!b.sentAt) return -1;
      return b.sentAt - a.sentAt;
    });

    // Returning invitation details
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

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // Build query - filter by sentBy or companyId based on what's provided
    let query;
    if (companyId) {
      query = db.collection("jobInvitations").where("companyId", "==", companyId);
    } else {
      query = db.collection("jobInvitations").where("sentBy", "==", userId);
    }

    const invitationsSnapshot = await query.orderBy("sentAt", "desc").get();

    // Get student, job details for each invitation
    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();

        // Get student details
        let studentDetails = null;
        try {
          const studentDoc = await db.collection("users").doc(invData.studentId).get();
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            studentDetails = {
              id: studentDoc.id,
              firstName: studentData.firstName,
              lastName: studentData.lastName,
              email: studentData.email,
            };
          }
        } catch (err) {
          console.error(`Error fetching student ${invData.studentId}:`, err);
        }

        // Get job details
        let jobDetails = null;
        try {
          const jobDoc = await db.collection("jobs").doc(invData.jobId).get();
          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            jobDetails = {
              id: jobDoc.id,
              name: jobData.name,
            };
          }
        } catch (err) {
          console.error(`Error fetching job ${invData.jobId}:`, err);
        }

        return {
          id: doc.id,
          jobId: invData.jobId,
          companyId: invData.companyId,
          studentId: invData.studentId,
          sentBy: invData.sentBy,
          sentVia: invData.sentVia,
          status: invData.status,
          sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
          viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
          clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
          message: invData.message || null,
          student: studentDetails,
          job: jobDetails,
        };
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

    // Verify the user is the intended recipient
    if (invitationData.studentId !== userId) {
      return res.status(403).json({ error: "You can only update your own invitations" });
    }

    const updateData = {
      status,
    };

    if (status === "viewed" && !invitationData.viewedAt) {
      updateData.viewedAt = admin.firestore.Timestamp.now();
    } else if (status === "clicked") {
      updateData.clickedAt = admin.firestore.Timestamp.now();
      // If not already viewed, mark as viewed too
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

    // Get the job to verify it exists and get company info
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyId = jobData.companyId;

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // Get all invitations for this job
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

    // Get the job to verify it exists and get company info
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyId = jobData.companyId;

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // Get all invitations for this job with student details
    const invitationsSnapshot = await db
      .collection("jobInvitations")
      .where("jobId", "==", jobId)
      .get();

    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();

        // Get student details
        let studentDetails = null;
        try {
          const studentDoc = await db.collection("users").doc(invData.studentId).get();
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            studentDetails = {
              id: studentDoc.id,
              firstName: studentData.firstName || "",
              lastName: studentData.lastName || "",
              email: studentData.email || "",
              major: studentData.major || "",
            };
          }
        } catch (err) {
          console.error(`Error fetching student ${invData.studentId}:`, err);
        }

        return {
          id: doc.id,
          studentId: invData.studentId,
          student: studentDetails,
          status: invData.status,
          sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
          viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
          clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
          message: invData.message || null,
        };
      })
    );

    // Sort by sentAt descending (newest first)
    invitations.sort((a, b) => {
      if (!a.sentAt && !b.sentAt) return 0;
      if (!a.sentAt) return 1;
      if (!b.sentAt) return -1;
      return b.sentAt - a.sentAt;
    });

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

    // Fetch the invitation
    const invDoc = await db.collection("jobInvitations").doc(invitationId).get();
    if (!invDoc.exists) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const invData = invDoc.data();

    // Verify the user has permission to view this invitation (must be the recipient)
    if (invData.studentId !== authUser.uid) {
      return res.status(403).json({ error: "Not authorized to view this invitation" });
    }

    // Get job details
    let jobDetails = null;
    try {
      const jobDoc = await db.collection("jobs").doc(invData.jobId).get();
      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        jobDetails = {
          id: jobDoc.id,
          name: jobData.name,
          description: jobData.description,
          majorsAssociated: jobData.majorsAssociated,
          applicationLink: jobData.applicationLink || null,
        };
      }
    } catch (err) {
      console.error(`Error fetching job ${invData.jobId}:`, err);
    }

    // Get company details
    let companyDetails = null;
    try {
      const companyDoc = await db.collection("companies").doc(invData.companyId).get();
      if (companyDoc.exists) {
        const companyData = companyDoc.data();
        companyDetails = {
          id: companyDoc.id,
          companyName: companyData.companyName,
          boothId: companyData.boothId || null,
        };
      }
    } catch (err) {
      console.error(`Error fetching company ${invData.companyId}:`, err);
    }

    // Get sender details
    let senderDetails = null;
    try {
      const senderDoc = await db.collection("users").doc(invData.sentBy).get();
      if (senderDoc.exists) {
        const senderData = senderDoc.data();
        senderDetails = {
          id: senderDoc.id,
          firstName: senderData.firstName,
          lastName: senderData.lastName,
          email: senderData.email,
        };
      }
    } catch (err) {
      console.error(`Error fetching sender ${invData.sentBy}:`, err);
    }

    const invitation = {
      id: invDoc.id,
      jobId: invData.jobId,
      companyId: invData.companyId,
      studentId: invData.studentId,
      sentBy: invData.sentBy,
      sentVia: invData.sentVia,
      status: invData.status,
      sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
      viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
      clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
      message: invData.message || null,
      job: jobDetails,
      company: companyDetails,
      sender: senderDetails,
    };

    return res.json({ data: invitation });
  } catch (err) {
    console.error("Error fetching invitation:", err);
    return res.status(500).json({ error: "Failed to fetch invitation", details: err.message });
  }
});

module.exports = router;
