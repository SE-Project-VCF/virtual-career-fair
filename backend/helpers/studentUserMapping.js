"use strict";

function normalizeTagString(t) {
  if (t == null || typeof t === "object") return "";
  return String(t).trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function interestTagsFromUserData(data) {
  const out = [];
  const pushUnique = (arr, v) => {
    const n = normalizeTagString(v);
    if (n && !arr.includes(n)) arr.push(n);
  };

  const addFromArray = (raw) => {
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      if (typeof item === "string") pushUnique(out, item);
      else if (item && typeof item === "object") {
        if (typeof item.name === "string") pushUnique(out, item.name);
        if (typeof item.tag === "string") pushUnique(out, item.tag);
        if (typeof item.label === "string") pushUnique(out, item.label);
      }
    }
  };

  addFromArray(data.interestTags);
  addFromArray(data.interests);

  if (typeof data.interestTags === "string" && data.interestTags.trim()) {
    data.interestTags
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => pushUnique(out, s));
  }

  if (typeof data.interestTag === "string") pushUnique(out, data.interestTag);

  if (typeof data.interests === "string" && data.interests.trim()) {
    data.interests
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => pushUnique(out, s));
  }

  return out;
}

function skillsFromUserData(data) {
  const s = data.skills;
  if (typeof s === "string") return s;
  if (Array.isArray(s)) {
    return s.filter((x) => typeof x === "string").join(", ");
  }
  if (s == null || s === undefined) return "";
  return String(s);
}

function mapStudentRecord(id, data) {
  return {
    id,
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    email: data.email || "",
    major: data.major || "",
    skills: skillsFromUserData(data),
    interestTags: interestTagsFromUserData(data),
  };
}

function studentMatchesInterestQuery(student, interestTrimmed) {
  if (!interestTrimmed) return true;
  const q = interestTrimmed.toLowerCase();
  const tags = student.interestTags || [];
  return tags.some((t) => {
    const tl = t.toLowerCase();
    return tl === q || tl.includes(q) || q.includes(tl);
  });
}

module.exports = {
  normalizeTagString,
  interestTagsFromUserData,
  skillsFromUserData,
  mapStudentRecord,
  studentMatchesInterestQuery,
};
