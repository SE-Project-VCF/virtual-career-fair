const crypto = require("crypto");
const admin = require("firebase-admin");
const { db } = require("./firebase");

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

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateTimeString}`);
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

module.exports = { removeUndefined, generateInviteCode, parseUTCToTimestamp, verifyAdmin };
