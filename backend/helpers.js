const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { db, auth } = require("./firebase");

function removeUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
}

function generateInviteCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
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
 * Validate job input fields. Returns an error string or null if valid.
 */
function validateJobInput({ companyId, name, description, majorsAssociated, applicationLink }) {
  if (!companyId) return "Company ID is required";
  if (!name?.trim()) return "Job title is required";
  if (name.trim().length > 200) return "Job title must be 200 characters or less";
  if (!description?.trim()) return "Job description is required";
  if (description.trim().length > 5000) return "Job description must be 5000 characters or less";
  if (!majorsAssociated?.trim()) return "Skills are required";
  if (majorsAssociated.trim().length > 500) return "Skills must be 500 characters or less";
  if (applicationLink && applicationLink.trim()) {
    try {
      new URL(applicationLink.trim());
    } catch (err) {
      console.error("Invalid URL provided:", err.message);
      return "Invalid application URL format";
    }
  }
  return null;
}

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
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

module.exports = { removeUndefined, generateInviteCode, parseUTCToTimestamp, verifyAdmin, evaluateFairStatusForFair, validateJobInput, verifyFirebaseToken };
