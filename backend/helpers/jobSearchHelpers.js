"use strict";

/**
 * Pure filters for GET /jobs/search (extracted for unit tests and Sonar-friendly routes).
 * @param {import("firebase-admin/firestore").DocumentSnapshot} doc
 */
function serializeJobDoc(doc) {
  const data = doc.data();
  return {
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
  };
}

function parseSkillTokens(majorsAssociated) {
  if (!majorsAssociated || typeof majorsAssociated !== "string") return [];
  return majorsAssociated
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function jobMatchesSkill(majorsAssociated, skill) {
  if (!skill || !String(skill).trim()) return true;
  const q = String(skill).trim().toLowerCase();
  const tokens = parseSkillTokens(majorsAssociated);
  return tokens.some((t) => t === q || t.includes(q));
}

function jobMatchesKeyword(name, description, q) {
  if (!q || !String(q).trim()) return true;
  const needle = String(q).trim().toLowerCase();
  const n = (name || "").toLowerCase();
  const d = (description || "").toLowerCase();
  return n.includes(needle) || d.includes(needle);
}

/**
 * @param {object} job Plain job data object
 * @param {string} [locationParam] Filter: "remote" or city/state substring
 */
function jobMatchesLocationFilter(job, locationParam) {
  if (!locationParam || !String(locationParam).trim()) return true;
  const p = String(locationParam).trim().toLowerCase();
  const remoteTerms = /^(remote|work from home|wfh)$/;
  if (remoteTerms.test(p) || p === "remote work") {
    return job.locationIsRemote === true;
  }
  if (job.locationIsRemote === true) return false;
  const hasStructured =
    job.locationIsRemote === false &&
    (job.locationCity != null || job.locationState != null || job.location != null);
  if (!hasStructured) {
    return false;
  }
  const city = (job.locationCity || "").toLowerCase();
  const state = (job.locationState || "").toLowerCase();
  const label = (job.location || "").toLowerCase();
  return (
    city.includes(p) ||
    state.includes(p) ||
    label.includes(p) ||
    `${city} ${state}`.trim().includes(p)
  );
}

module.exports = {
  serializeJobDoc,
  parseSkillTokens,
  jobMatchesSkill,
  jobMatchesKeyword,
  jobMatchesLocationFilter,
};
