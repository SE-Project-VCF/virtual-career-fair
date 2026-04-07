const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const admin = require("firebase-admin");
const {
  verifyFirebaseToken,
  validateJobInput,
  checkCompanyAuthorization,
  removeUndefined,
  fetchJobAndAuthorizeCompany,
} = require("../helpers");

/* ----------------------------------------------------
   CREATE JOB POSTING
---------------------------------------------------- */
router.post("/jobs", verifyFirebaseToken, async (req, res) => {
  try {
    const {
      companyId,
      name,
      description,
      majorsAssociated,
      applicationLink,
    } = req.body;

    // Validate required fields
    const validationError = validateJobInput(req.body);
    if (validationError) {
      return res.status(400).send({ success: false, error: validationError });
    }


    const authResult = await checkCompanyAuthorization(companyId, req.user.uid);
    if (!authResult.authorized) {
      const status = authResult.error === "Invalid company ID" ? 404 : 403;
      const error = status === 404 ? "Company not found" : authResult.error;
      return res.status(status).send({ success: false, error });
    }


    // Sanitize inputs (trim and remove null bytes)
    const sanitizedName = name.trim().replaceAll('\0', '');
    const sanitizedDescription = description.trim().replaceAll('\0', '');
    const sanitizedMajors = majorsAssociated.trim().replaceAll('\0', '');
    const sanitizedAppLink = applicationLink?.trim().replaceAll('\0', '') || undefined;

    const jobRef = await db.collection("jobs").add(
      removeUndefined({
        companyId,
        name: sanitizedName,
        description: sanitizedDescription,
        majorsAssociated: sanitizedMajors,
        applicationLink: sanitizedAppLink,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, jobId: jobRef.id });
  } catch (err) {
    console.error("Error adding job:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   GET JOBS BY COMPANY ID
---------------------------------------------------- */
router.get("/jobs", async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    // Query without orderBy to avoid composite index requirement
    // We'll sort in memory instead
    const jobsSnapshot = await db.collection("jobs")
      .where("companyId", "==", companyId)
      .get();

    const jobs = [];
    jobsSnapshot.forEach((doc) => {
      const data = doc.data();
      jobs.push({
        id: doc.id,
        companyId: data.companyId,
        name: data.name,
        description: data.description,
        majorsAssociated: data.majorsAssociated,
        applicationLink: data.applicationLink || null,
        createdAt: data.createdAt ? data.createdAt.toMillis() : null,
        applicationForm: data.applicationForm || null,
      });
    });

    // Sort by createdAt descending in memory
    jobs.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt - a.createdAt;
    });

    return res.json({ success: true, jobs });
  } catch (err) {
    console.error("Error fetching jobs:", err);
    return res.status(500).json({ error: "Failed to fetch jobs", details: err.message });
  }
});

/* ----------------------------------------------------
   UPDATE JOB
---------------------------------------------------- */
router.put("/jobs/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, majorsAssociated, applicationLink } = req.body;

    // Validate required fields
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: "Job title is required" });
    }

    if (!description?.trim()) {
      return res.status(400).json({ success: false, error: "Job description is required" });
    }

    if (!majorsAssociated?.trim()) {
      return res.status(400).json({ success: false, error: "Skills are required" });
    }

    // Validate application link format if provided
    if (applicationLink?.trim()) {
      try {
        new URL(applicationLink.trim());
      } catch {
        console.error("Invalid application URL provided");
        return res.status(400).json({ success: false, error: "Invalid application URL format" });
      }
    }

    const result = await fetchJobAndAuthorizeCompany(id, req.user.uid, res);
    if (!result) return;

    await result.jobRef.update(
      removeUndefined({
        name: name.trim(),
        description: description.trim(),
        majorsAssociated: majorsAssociated.trim(),
        applicationLink: applicationLink?.trim() || null,
        updatedAt: admin.firestore.Timestamp.now(),
      })
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Error updating job:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   DELETE JOB
---------------------------------------------------- */
router.delete("/jobs/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await fetchJobAndAuthorizeCompany(id, req.user.uid, res);
    if (!result) return;

    await result.jobRef.delete();

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting job:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   CREATE / UPDATE APPLICATION FORM ON A JOB
---------------------------------------------------- */
router.put("/jobs/:id/form", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;

    if (!formData || typeof formData !== "object") {
      return res.status(400).json({ success: false, error: "Form data is required" });
    }

    const result = await fetchJobAndAuthorizeCompany(id, req.user.uid, res);
    if (!result) return;

    await result.jobRef.update({ applicationForm: formData });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving application form:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   DELETE APPLICATION FORM FROM A JOB
---------------------------------------------------- */
router.delete("/jobs/:id/form", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await fetchJobAndAuthorizeCompany(id, req.user.uid, res);
    if (!result) return;

    await result.jobRef.update({ applicationForm: admin.firestore.FieldValue.delete() });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting application form:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   GET ALL SUBMISSIONS FOR A COMPANY
---------------------------------------------------- */
router.get("/companies/:companyId/submissions", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    const authResult = await checkCompanyAuthorization(companyId, req.user.uid);
    if (!authResult.authorized) {
      const status = authResult.error === "Invalid company ID" ? 404 : 403;
      const error = status === 404 ? "Company not found" : authResult.error;
      return res.status(status).json({ success: false, error });
    }

    const snapshot = await db
      .collection("jobApplications")
      .where("companyId", "==", companyId)
      .get();

    const submissions = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));

    return res.json({ success: true, submissions });
  } catch (err) {
    console.error("Error fetching submissions:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
