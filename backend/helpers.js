const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { db, auth } = require("./firebase");

function removeUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
}

/**
 * Generate a secure invite code (12 hex chars = 48 bits of entropy).
 * This provides strong protection against brute force attacks.
 */
function generateInviteCode() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}


/**
 * Parse datetime string as UTC and return Firestore Timestamp.
 * Ensures all dates are stored as UTC in the database.
 */
function parseUTCToTimestamp(dateTimeString) {
  if (!dateTimeString) {
    throw new Error("Date string is required");
  }

  let date;

  if (dateTimeString.includes('Z') || dateTimeString.match(/[+-]\d{2}:\d{2}$/)) {
    date = new Date(dateTimeString);
  } else if (dateTimeString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    date = new Date(dateTimeString + 'Z');
  } else if (dateTimeString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
    date = new Date(dateTimeString + 'Z');
  } else {
    date = new Date(dateTimeString);
  }

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid date string: ${dateTimeString}`);
  }

  return admin.firestore.Timestamp.fromMillis(date.getTime());
}

/**
 * Verify user is administrator. Returns error object or null.
 */
async function verifyAdmin(userId) {
  if (!userId) {
    return { error: "Missing userId", status: 400 };
  }

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    return { error: "User not found", status: 404 };
  }

  const userData = userDoc.data();
  if (userData.role !== "administrator") {
    return { error: "Only administrators can manage schedules", status: 403 };
  }

  return null;
}

/**
 * Evaluate live status for a specific fair.
 * Returns { isLive, source, name, description }.
 */
async function evaluateFairStatusForFair(fairId) {
  const fairDoc = await db.collection("fairs").doc(fairId).get();
  if (!fairDoc.exists) {
    throw new Error("Fair not found");
  }

  const data = fairDoc.data();
  const now = admin.firestore.Timestamp.now().toMillis();

  // Manual override wins
  if (data.isLive === true) {
    return {
      isLive: true,
      source: "manual",
      name: data.name || null,
      description: data.description || null,
    };
  }

  // Check scheduled window
  if (data.startTime && data.endTime) {
    const start = data.startTime.toMillis();
    const end = data.endTime.toMillis();
    if (now >= start && now <= end) {
      return {
        isLive: true,
        source: "schedule",
        name: data.name || null,
        description: data.description || null,
      };
    }
  }

  return {
    isLive: false,
    source: "manual",
    name: data.name || null,
    description: data.description || null,
  };
}

/**
 * Validates job location: required remote vs on-site with city/state.
 * @param {object} body Request body with locationIsRemote, locationCity, locationState, location
 * @returns {string|null} Error message or null if valid.
 */
function validateJobLocationFields(body) {
  // Omitting location entirely is allowed (e.g. PUT updates that only change title/link).
  if (body.locationIsRemote === undefined) {
    return null;
  }
  if (typeof body.locationIsRemote !== "boolean") {
    return "Job location must be set to remote or on-site";
  }
  if (body.locationIsRemote === true) {
    return null;
  }
  const city = body.locationCity == null ? "" : String(body.locationCity).trim();
  const state = body.locationState == null ? "" : String(body.locationState).trim();
  if (!city || !state) {
    return "City and state are required for on-site jobs";
  }
  if (city.length > 100 || state.length > 100) {
    return "City and state must be 100 characters or less";
  }
  const locationProvided = body.location !== null && body.location !== undefined;
  if (locationProvided && String(body.location).trim().length > 200) {
    return "Location label must be 200 characters or less";
  }
  return null;
}

/**
 * Validate job input fields. Returns an error string or null if valid.
 */
function validateJobInput(body) {
  const { companyId, name, description, majorsAssociated, applicationLink } = body;
  if (!companyId) return "Company ID is required";
  if (!name?.trim()) return "Job title is required";
  if (name.trim().length > 200) return "Job title must be 200 characters or less";
  if (!description?.trim()) return "Job description is required";
  if (description.trim().length > 5000) return "Job description must be 5000 characters or less";
  if (!majorsAssociated?.trim()) return "Skills are required";
  if (majorsAssociated.trim().length > 500) return "Skills must be 500 characters or less";
  if (applicationLink?.trim()) {
    try {
      new URL(applicationLink.trim());
    } catch (err) {
      console.error("Invalid URL provided:", err.message);
      return "Invalid application URL format";
    }
  }
  if (typeof body.locationIsRemote !== "boolean") {
    return "Job location must be set to remote or on-site";
  }
  return validateJobLocationFields(body);
}

// Helper to check if user is company owner or representative
async function checkCompanyAuthorization(companyId, userId) {
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) {
    return { authorized: false, error: "Invalid company ID" };
  }
  const companyData = companyDoc.data();
  const reps = companyData.representativeIDs || [];
  if (companyData.ownerId !== userId && !reps.includes(userId)) {
    return { authorized: false, error: "Not authorized for this company" };
  }
  return { authorized: true, companyData };
}

// Helper to resolve booth reference - supports both global booths and fair-specific booths
async function resolveBooth(boothId) {
  // First, try to get booth from global booths collection
  const globalBoothRef = db.collection("booths").doc(boothId);
  const globalBoothDoc = await globalBoothRef.get();

  if (globalBoothDoc.exists) {
    return { ref: globalBoothRef, data: globalBoothDoc.data() };
  }

  // If not found globally, search through all fairs for this booth
  const fairsSnapshot = await db.collection("fairs").get();

  for (const fairDoc of fairsSnapshot.docs) {
    const fairBoothRef = db.collection("fairs").doc(fairDoc.id).collection("booths").doc(boothId);
    const fairBoothDoc = await fairBoothRef.get();

    if (fairBoothDoc.exists) {
      return { ref: fairBoothRef, data: fairBoothDoc.data() };
    }
  }

  // Booth not found
  return null;
}

/**
 * Resolves applicant resume path or URL from application data.
 * Returns { type: "url"|"path", value } or { type: null } if not found.
 */
async function resolveApplicantResumePathOrUrl(appData, studentId) {
  const pathOrUrl =
    appData.attachedResumePath ||
    appData.fileUrls?.resume ||
    appData.fileUrls?.attach_resume ||
    appData.fileUrls?.resume_upload;

  if (pathOrUrl && typeof pathOrUrl === "string" && pathOrUrl.startsWith("http")) {
    return { type: "url", value: pathOrUrl };
  }
  if (pathOrUrl && typeof pathOrUrl === "string") {
    return { type: "path", value: pathOrUrl };
  }
  if (!studentId) return { type: null };

  const userDoc = await db.collection("users").doc(studentId).get();
  if (!userDoc.exists) return { type: null };

  const userData = userDoc.data();
  const p = userData.currentResumePath || userData.resumePath || userData.resumeUrl;
  if (p && typeof p === "string" && !p.startsWith("http")) {
    return { type: "path", value: p };
  }
  return { type: null };
}

/**
 * Ensures the user can view company resumes. Returns error response args or null if authorized.
 */
async function requireCompanyResumeViewAccess(companyId, userId) {
  const auth = await checkCompanyAuthorization(companyId, userId);
  if (auth.authorized) return null;
  const status = auth.error === "Invalid company ID" ? 404 : 403;
  const message = status === 404 ? "Company not found" : "Not authorized to view this resume";
  return { status, error: message };
}

/* ----------------------------------------------------
   HELPER: Verify user is representative or company owner
---------------------------------------------------- */
async function verifyRepOrOwner(userId, companyId) {
  if (!userId) {
    return { error: "Missing userId", status: 400 };
  }

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    return { error: "User not found", status: 404 };
  }

  const userData = userDoc.data();

  // Allow administrators, company owners, and representatives
  if (userData.role === "administrator") {
    return null; // Admins can access everything
  }

  if (userData.role !== "representative" && userData.role !== "companyOwner") {
    return { error: "Only representatives and company owners can send invitations", status: 403 };
  }

  // If companyId is provided, verify the user belongs to that company
  if (companyId && userData.companyId !== companyId) {
    return { error: "You can only send invitations for your own company", status: 403 };
  }

  return null;
}

/**
 * Serialize Firestore timestamp fields on a document to millis (or null).
 * @param {object} data - Firestore document data
 * @param {string[]} fields - field names to convert
 * @returns {object} copy with timestamps as millis
 */
function serializeTimestamps(data, fields) {
  const out = { ...data };
  for (const f of fields) {
    out[f] = data[f]?.toMillis?.() ?? null;
  }
  return out;
}

/**
 * Fetch a call_invitations doc, verify it exists, and verify userId matches `roleField`.
 * Returns { invitation, invitationDoc } or sends an error response and returns null.
 */
async function fetchAndAuthorizeCallInvitation(invitationId, userId, roleField, res) {
  const invitationDoc = await db.collection("call_invitations").doc(invitationId).get();
  if (!invitationDoc.exists) {
    res.status(404).json({ error: "Invitation not found" });
    return null;
  }
  const invitation = invitationDoc.data();
  if (invitation[roleField] !== userId) {
    res.status(403).json({ error: `Not authorized to ${roleField === "studentId" ? "respond to" : "manage"} this invitation` });
    return null;
  }
  return { invitation, invitationDoc };
}

/**
 * Accept or decline a call invitation (shared logic for both endpoints).
 */
async function respondToCallInvitation(invitationId, userId, newStatus, res) {
  const result = await fetchAndAuthorizeCallInvitation(invitationId, userId, "studentId", res);
  if (!result) return;

  const { invitation } = result;
  if (invitation.status !== "pending") {
    return res.status(409).json({ error: "Invitation has already been responded to" });
  }

  await db.collection("call_invitations").doc(invitationId).update({
    status: newStatus,
    respondedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return res.json({ success: true, message: `Call invitation ${newStatus}` });
}

/**
 * Fetch related details (student, job, company, sender) for a jobInvitations doc.
 * @param {object} invData - invitation document data
 * @param {object} opts - which details to fetch: { student, job, company, sender }
 * @returns {object} { student?, job?, company?, sender? }
 */
async function fetchRelatedJobInvDetails(invData, opts = {}) {
  const details = {};
  // Initialize requested keys to null so callers get null (not undefined) when docs don't exist
  if (opts.student) details.student = null;
  if (opts.job) details.job = null;
  if (opts.company) details.company = null;
  if (opts.sender) details.sender = null;
  const fetches = [];

  if (opts.student && invData.studentId) {
    fetches.push(
      db.collection("users").doc(invData.studentId).get().then(doc => {
        if (doc.exists) {
          const d = doc.data();
          details.student = {
            id: doc.id,
            firstName: d.firstName || "",
            lastName: d.lastName || "",
            email: d.email || "",
            ...(opts.studentExtra ? { major: d.major || "" } : {}),
          };
        }
      }).catch(err => console.error(`Error fetching student ${invData.studentId}:`, err))
    );
  }

  if (opts.job && invData.jobId) {
    fetches.push(
      db.collection("jobs").doc(invData.jobId).get().then(doc => {
        if (doc.exists) {
          const d = doc.data();
          details.job = opts.jobFull
            ? { id: doc.id, companyId: d.companyId, name: d.name, description: d.description, majorsAssociated: d.majorsAssociated, applicationLink: d.applicationLink || null, applicationForm: d.applicationForm || null }
            : { id: doc.id, name: d.name };
        }
      }).catch(err => console.error(`Error fetching job ${invData.jobId}:`, err))
    );
  }

  if (opts.company && invData.companyId) {
    fetches.push(
      db.collection("companies").doc(invData.companyId).get().then(doc => {
        if (doc.exists) {
          const d = doc.data();
          details.company = { id: doc.id, companyName: d.companyName, boothId: d.boothId || null };
        }
      }).catch(err => console.error(`Error fetching company ${invData.companyId}:`, err))
    );
  }

  if (opts.sender && invData.sentBy) {
    fetches.push(
      db.collection("users").doc(invData.sentBy).get().then(doc => {
        if (doc.exists) {
          const d = doc.data();
          details.sender = { id: doc.id, firstName: d.firstName, lastName: d.lastName, email: d.email };
        }
      }).catch(err => console.error(`Error fetching sender ${invData.sentBy}:`, err))
    );
  }

  await Promise.all(fetches);
  return details;
}

/**
 * Serialize common jobInvitation timestamp fields.
 */
function serializeJobInvTimestamps(invData) {
  return {
    sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
    viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
    clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
  };
}

/**
 * Generate a signed URL for the most recent resume in a user's storage folder.
 * Returns { success, resumeUrl } or throws.
 */
async function getSignedResumeUrl(userId) {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix: `resumes/${userId}/` });

  if (files.length === 0) {
    return null;
  }

  const latestFile = files.at(-1);
  const [signedUrl] = await latestFile.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });

  return signedUrl;
}

/**
 * Fetch a job doc and verify the user is authorized for its company.
 * Returns { jobRef, jobData, companyData } or sends error response and returns null.
 */
async function fetchJobAndAuthorizeCompany(jobId, userId, res) {
  const jobRef = db.collection("jobs").doc(jobId);
  const jobDoc = await jobRef.get();

  if (!jobDoc.exists) {
    res.status(404).json({ success: false, error: "Job not found" });
    return null;
  }

  const jobData = jobDoc.data();
  const authResult = await checkCompanyAuthorization(jobData.companyId, userId);
  if (!authResult.authorized) {
    const status = authResult.error === "Invalid company ID" ? 404 : 403;
    const error = status === 404 ? "Company not found" : authResult.error;
    res.status(status).json({ success: false, error });
    return null;
  }

  return { jobRef, jobData, companyData: authResult.companyData };
}

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = { uid: decodedToken.uid, email: decodedToken.email };
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = {
  removeUndefined,
  generateInviteCode,
  parseUTCToTimestamp,
  verifyAdmin,
  evaluateFairStatusForFair,
  validateJobInput,
  validateJobLocationFields,
  verifyFirebaseToken,
  checkCompanyAuthorization,
  resolveBooth,
  resolveApplicantResumePathOrUrl,
  requireCompanyResumeViewAccess,
  verifyRepOrOwner,
  serializeTimestamps,
  fetchAndAuthorizeCallInvitation,
  respondToCallInvitation,
  fetchRelatedJobInvDetails,
  serializeJobInvTimestamps,
  getSignedResumeUrl,
  fetchJobAndAuthorizeCompany,
};
