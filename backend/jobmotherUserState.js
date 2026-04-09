"use strict";

const { db } = require("./firebase");

/**
 * Match jobmotherIntentResolver role normalization.
 * @param {string} [role]
 * @returns {string}
 */
function normalizeRole(role) {
  if (!role || typeof role !== "string") return "";
  const r = role.trim().toLowerCase();
  if (r === "company") return "companyowner";
  return r;
}

/**
 * @param {Record<string, unknown>} u
 * @returns {boolean}
 */
function profileBasicsComplete(u) {
  const fn = typeof u.firstName === "string" ? u.firstName.trim() : "";
  const ln = typeof u.lastName === "string" ? u.lastName.trim() : "";
  const dn = typeof u.displayName === "string" ? u.displayName.trim() : "";
  if (fn && ln) return true;
  if (dn.length > 0) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} u
 * @returns {boolean}
 */
function hasResumeUploaded(u) {
  const p = u.currentResumePath ?? u.resumePath;
  return typeof p === "string" && p.trim().length > 0;
}

/**
 * @param {unknown} parsed
 * @returns {string[]}
 */
function sanitizeJobmotherTips(parsed) {
  const raw = parsed && typeof parsed === "object" && parsed !== null ? parsed.tips : undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((t) => t.slice(0, 240));
}

/**
 * @param {unknown} parsed
 * @returns {boolean}
 */
function parseNeedsClarification(parsed) {
  return Boolean(parsed && typeof parsed === "object" && parsed !== null && parsed.needsClarification === true);
}

/**
 * Firestore: jobInvitations by studentId (filter status in memory to avoid composite index).
 * @param {string} uid
 * @returns {Promise<number>}
 */
async function countUnseenJobInvitations(uid) {
  const snap = await db.collection("jobInvitations").where("studentId", "==", uid).get();
  return snap.docs.filter((d) => {
    const s = d.data().status;
    return s === "sent";
  }).length;
}

/**
 * @param {string} uid
 * @param {"student"|"employer"} asField
 * @returns {Promise<number>}
 */
async function countPendingCallInvitations(uid, asField) {
  const snap = await db.collection("call_invitations").where(asField, "==", uid).get();
  return snap.docs.filter((d) => (d.data().status || "") === "pending").length;
}

/**
 * Read-only user state for the Fairy Jobmother prompt (counts/booleans only).
 *
 * @param {string} uid
 * @param {Record<string, unknown>} userDocData
 * @param {string} [fairId]
 * @returns {Promise<string>}
 */
async function buildJobmotherUserStateBlock(uid, userDocData, fairId) {
  const roleRaw = typeof userDocData.role === "string" ? userDocData.role : "";
  const nr = normalizeRole(roleRaw);

  const lines = [
    "User state (for context only; do not repeat private details):",
    `- profileBasicsComplete: ${profileBasicsComplete(userDocData)}`,
    `- hasResumeUploaded: ${hasResumeUploaded(userDocData)}`,
    fairId ? "- fairContext: inside a fair (fairId is set)" : "- fairContext: not inside a fair URL (no fairId)",
  ];

  if (nr === "administrator") {
    lines.push("- adminRole: true");
  }

  if (nr === "student") {
    try {
      const unseen = await countUnseenJobInvitations(uid);
      lines.push(`- unseenJobInvitationsCount: ${unseen}`);
    } catch (e) {
      console.error("[jobmotherUserState] unseenJobInvitationsCount:", e);
      lines.push("- unseenJobInvitationsCount: unknown");
    }
    try {
      const pendingIn = await countPendingCallInvitations(uid, "studentId");
      lines.push(`- pendingIncomingCallInvitationsCount: ${pendingIn}`);
    } catch (e) {
      console.error("[jobmotherUserState] pendingIncomingCallInvitationsCount:", e);
      lines.push("- pendingIncomingCallInvitationsCount: unknown");
    }
  }

  if (nr === "companyowner" || nr === "representative") {
    try {
      const pendingOut = await countPendingCallInvitations(uid, "employerId");
      lines.push(`- pendingOutgoingCallInvitationsCount: ${pendingOut}`);
    } catch (e) {
      console.error("[jobmotherUserState] pendingOutgoingCallInvitationsCount:", e);
      lines.push("- pendingOutgoingCallInvitationsCount: unknown");
    }
  }

  return lines.join("\n");
}

module.exports = {
  buildJobmotherUserStateBlock,
  sanitizeJobmotherTips,
  parseNeedsClarification,
  profileBasicsComplete,
  hasResumeUploaded,
};
