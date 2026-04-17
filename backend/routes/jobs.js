const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const admin = require("firebase-admin");
const {
  verifyFirebaseToken,
  validateJobInput,
  validateJobLocationFields,
  checkCompanyAuthorization,
  removeUndefined,
  fetchJobAndAuthorizeCompany,
} = require("../helpers");
const {
  serializeJobDoc,
  jobMatchesSkill,
  jobMatchesKeyword,
  jobMatchesLocationFilter,
} = require("../helpers/jobSearchHelpers");

/* ----------------------------------------------------
   SEARCH JOBS (global collection, authenticated)
---------------------------------------------------- */
router.get("/jobs/search", verifyFirebaseToken, async (req, res) => {
  try {
    const q = req.query.q;
    const skill = req.query.skill;
    const location = req.query.location;

    const pageRaw = Number.parseInt(String(req.query.page ?? "1"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    let pageSize = Number.parseInt(String(req.query.limit ?? "20"), 10);
    if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
    pageSize = Math.min(50, pageSize);

    const snap = await db.collection("jobs").get();
    let rows = snap.docs.map((doc) => serializeJobDoc(doc));

    rows = rows.filter((job) => {
      if (!jobMatchesKeyword(job.name, job.description, q)) return false;
      if (!jobMatchesSkill(job.majorsAssociated, skill)) return false;
      if (!jobMatchesLocationFilter(job, location)) return false;
      return true;
    });

    rows.sort((a, b) => {
      const ta = a.createdAt ?? 0;
      const tb = b.createdAt ?? 0;
      return tb - ta;
    });

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    const companyIds = [...new Set(pageRows.map((j) => j.companyId).filter(Boolean))];
    const companyNames = {};
    await Promise.all(
      companyIds.map(async (cid) => {
        const cdoc = await db.collection("companies").doc(cid).get();
        if (cdoc.exists) {
          const d = cdoc.data();
          companyNames[cid] = d.companyName || "";
        } else {
          companyNames[cid] = "";
        }
      })
    );

    const jobs = pageRows.map((j) => ({
      ...j,
      companyName: companyNames[j.companyId] || "",
    }));

    return res.json({ success: true, jobs, total, page, pageSize });
  } catch (err) {
    console.error("GET /jobs/search error:", err);
    return res.status(500).json({ success: false, error: "Failed to search jobs" });
  }
});

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
      locationIsRemote,
      locationCity,
      locationState,
      location,
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
    const sanitizedAppLink = applicationLink?.trim().replaceAll("\0", "") || undefined;

    const payload = {
      companyId,
      name: sanitizedName,
      description: sanitizedDescription,
      majorsAssociated: sanitizedMajors,
      applicationLink: sanitizedAppLink,
      createdAt: admin.firestore.Timestamp.now(),
    };

    if (locationIsRemote === true) {
      payload.locationIsRemote = true;
    } else {
      payload.locationIsRemote = false;
      const cityRaw = locationCity == null ? "" : String(locationCity);
      const stateRaw = locationState == null ? "" : String(locationState);
      payload.locationCity = cityRaw.trim().replaceAll("\0", "");
      payload.locationState = stateRaw.trim().replaceAll("\0", "");
      const label = location?.trim().replaceAll("\0", "");
      if (label) payload.location = label;
    }

    const jobRef = await db.collection("jobs").add(removeUndefined(payload));

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
        locationIsRemote: data.locationIsRemote === true,
        locationCity: data.locationCity ?? null,
        locationState: data.locationState ?? null,
        location: data.location ?? null,
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

/**
 * @returns {null | { status: number, json: object, logInvalidAppUrl?: boolean }}
 */
function getPutJobValidationResponse(body) {
  const { name, description, majorsAssociated, applicationLink } = body;
  if (!name?.trim()) {
    return { status: 400, json: { success: false, error: "Job title is required" } };
  }
  if (!description?.trim()) {
    return { status: 400, json: { success: false, error: "Job description is required" } };
  }
  if (!majorsAssociated?.trim()) {
    return { status: 400, json: { success: false, error: "Skills are required" } };
  }
  const locErr = validateJobLocationFields(body);
  if (locErr) {
    return { status: 400, json: { success: false, error: locErr } };
  }
  if (applicationLink?.trim()) {
    try {
      new URL(applicationLink.trim());
    } catch {
      return {
        status: 400,
        json: { success: false, error: "Invalid application URL format" },
        logInvalidAppUrl: true,
      };
    }
  }
  return null;
}

/**
 * Persists core job fields plus optional location (remote clears location fields).
 */
async function updateJobWithLocationFields(
  jobRef,
  locationIsRemote,
  location,
  locationCity,
  locationState,
  baseUpdate
) {
  if (locationIsRemote === undefined) {
    await jobRef.update(baseUpdate);
    return;
  }
  if (locationIsRemote === true) {
    await jobRef.update({
      ...baseUpdate,
      locationIsRemote: true,
      locationCity: admin.firestore.FieldValue.delete(),
      locationState: admin.firestore.FieldValue.delete(),
      location: admin.firestore.FieldValue.delete(),
    });
    return;
  }
  const labelTrim = location == null ? "" : String(location).trim();
  const cityTrim = locationCity == null ? "" : String(locationCity).trim();
  const stateTrim = locationState == null ? "" : String(locationState).trim();
  const onSiteUpdate = {
    ...baseUpdate,
    locationIsRemote: false,
    locationCity: cityTrim,
    locationState: stateTrim,
  };
  if (labelTrim) {
    onSiteUpdate.location = labelTrim;
  } else {
    onSiteUpdate.location = admin.firestore.FieldValue.delete();
  }
  await jobRef.update(onSiteUpdate);
}

/* ----------------------------------------------------
   UPDATE JOB
---------------------------------------------------- */
router.put("/jobs/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      majorsAssociated,
      applicationLink,
      locationIsRemote,
      locationCity,
      locationState,
      location,
    } = req.body;

    const validation = getPutJobValidationResponse(req.body);
    if (validation) {
      if (validation.logInvalidAppUrl) {
        console.error("Invalid application URL provided");
      }
      return res.status(validation.status).json(validation.json);
    }

    const result = await fetchJobAndAuthorizeCompany(id, req.user.uid, res);
    if (!result) return;

    const baseUpdate = {
      name: name.trim(),
      description: description.trim(),
      majorsAssociated: majorsAssociated.trim(),
      applicationLink: applicationLink?.trim() || null,
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await updateJobWithLocationFields(
      result.jobRef,
      locationIsRemote,
      location,
      locationCity,
      locationState,
      baseUpdate
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
