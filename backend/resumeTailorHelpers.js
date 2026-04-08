"use strict";

function extractFirstJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeTokens(s) {
  return (s || "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9+.#%/\- ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function containsNewNumbers(beforeText, afterText) {
  const nums = (t) => (t.match(/\b\d+(\.\d+)?%?\b/g) || []);
  const b = new Set(nums(beforeText));
  for (const n of nums(afterText)) {
    if (!b.has(n)) return true;
  }
  return false;
}

const GENERIC_VERBS = new Set(["and", "the", "with", "for", "to", "from", "using", "built", "created", "worked", "led", "used"]);

/**
 * Finds suspicious new tokens in afterText that aren't in the original or allowed skills.
 */
function findSuspiciousTokens(original, afterText, allowedSkills) {
  const origTokens = new Set(normalizeTokens(original));
  const newTokens = normalizeTokens(afterText).filter(t => !origTokens.has(t));
  return newTokens.filter(t =>
    t.length >= 3 && !GENERIC_VERBS.has(t) && !allowedSkills.has(t)
  );
}

/**
 * Parses Gemini JSON response, attempting extraction if direct parse fails.
 * Returns { parsed } on success, or { error, raw } on failure.
 */
function parseGeminiJson(text) {
  try {
    return { parsed: JSON.parse(text) };
  } catch (error_) {
    console.warn("JSON.parse failed, attempting extraction:", error_.message);
    const extracted = extractFirstJsonObject(text);
    if (!extracted) {
      return { error: "Gemini did not return valid JSON", raw: (text || "").slice(0, 1500) };
    }
    try {
      return { parsed: JSON.parse(extracted) };
    } catch (error__) {
      console.warn("Extracted JSON also failed to parse:", error__.message);
      return { error: "Gemini returned malformed JSON", raw: extracted.slice(0, 1500) };
    }
  }
}

/**
 * Build a Map of bulletId -> text from structured experience and projects.
 */
function buildBulletMap(structured) {
  const bulletMap = new Map();
  for (const exp of structured.experience || []) {
    for (const b of exp.bullets || []) bulletMap.set(b.bulletId, b.text);
  }
  for (const proj of structured.projects || []) {
    for (const b of proj.bullets || []) bulletMap.set(b.bulletId, b.text);
  }
  return bulletMap;
}

/**
 * Resolve original text for a patch type. Returns null for unknown types.
 */
function resolveOriginalText(type, summaryText, bulletMap, targetBulletId) {
  if (type === "replace_summary") return summaryText;
  if (type === "replace_bullet") return bulletMap.get(targetBulletId) || "";
  if (type === "insert_bullet") return "";
  return null;
}

function verifyPatches(structured, patchResponse) {
  const issues = [];
  const allowedSkills = new Set((structured?.skills?.items || []).map(s => (s || "").toLowerCase()));
  const bulletMap = buildBulletMap(structured);
  const summaryText = structured?.summary?.text || "";

  const verifiedPatches = [];
  for (const p of patchResponse.patches || []) {
    const type = p.type;
    const afterText = p.afterText || "";

    // Basic shape checks
    if (!p.opId || !type || !p.target || typeof afterText !== "string") {
      issues.push({ opId: p.opId || null, level: "reject", reason: "Malformed patch" });
      continue;
    }

    // Determine beforeText from original
    const original = resolveOriginalText(type, summaryText, bulletMap, p.target.bulletId);
    if (original === null) {
      issues.push({ opId: p.opId, level: "reject", reason: `Unknown patch type: ${type}` });
      continue;
    }

    // Enforce: beforeText must match original for replace ops
    if ((type === "replace_summary" || type === "replace_bullet") && p.beforeText !== original) {
      issues.push({ opId: p.opId, level: "reject", reason: "beforeText does not match original text" });
      continue;
    }

    // Flag suspicious new tokens not in resume skills list
    const suspiciousNew = findSuspiciousTokens(original, afterText, allowedSkills);
    if (suspiciousNew.length > 0) {
      issues.push({
        opId: p.opId,
        level: "flag",
        reason: "Introduces potentially new tools/skills not in resume skills list",
        tokens: suspiciousNew.slice(0, 10),
      });
    }

    verifiedPatches.push(p);
  }

  return { verifiedPatches, issues };
}

/**
 * Attempt to extract meaningful text from a patch's reason field.
 * Returns null if no useful text could be extracted.
 */
function extractTextFromReason(reason, patchType) {
  const quotedMatch = reason.match(/"([^"]+)"/);
  if (quotedMatch) return quotedMatch[1];

  const reasonWords = reason.split(/[,:]/)[0].trim();
  const words = reasonWords.split(/\s+/);
  if (words.length === 0) return null;

  if (patchType === "suppress_section") {
    const match = reasonWords.match(/["']?([A-Z][a-z0-9\s&-]{1,50}?)["']?\s+(?:project|job|role|position|experience)/i);
    return match ? match[1] : reasonWords.substring(0, 50);
  }
  return words.slice(0, 3).join(" ");
}

/**
 * Extracts removedText for a removal patch using multiple strategies.
 */
function extractRemovedText(patch) {
  // Strategy 1: Use skillName for skill removals
  if (patch.type === "remove_skill" && patch.target?.skillName) {
    return patch.target.skillName;
  }
  // Strategy 2: Use beforeText for bullet removals
  if (patch.type === "remove_bullet" && patch.beforeText) {
    return patch.beforeText;
  }
  // Strategy 3: Extract from reason field
  if (patch.reason) {
    const fromReason = extractTextFromReason(patch.reason, patch.type);
    if (fromReason) return fromReason;
  }
  return patch.type === "suppress_section" ? "(project/job)" : "(item)";
}

/**
 * Normalize a removal patch by ensuring removedText and removalReason fields exist.
 */
function normalizeRemovalPatch(patch, idx) {
  if (!["remove_skill", "remove_bullet", "suppress_section"].includes(patch.type)) {
    return patch;
  }

  console.log(`[TAILOR] Processing removal patch ${idx}:`, {
    type: patch.type,
    hasRemovedText: !!patch.removedText,
    removedTextValue: patch.removedText,
    skillName: patch.target?.skillName,
    beforeText: patch.beforeText,
    reason: patch.reason
  });

  if (!patch.removedText || patch.removedText === "undefined" || patch.removedText === null) {
    patch.removedText = extractRemovedText(patch);
  }

  if (!patch.removalReason || patch.removalReason === "undefined" || patch.removalReason === null) {
    patch.removalReason = patch.reason || "Not relevant to this position";
  }

  console.log(`[TAILOR] After normalization patch ${idx}:`, {
    removedText: patch.removedText,
    removalReason: patch.removalReason
  });
  return patch;
}

/**
 * Find a matching experience entry by text search.
 */
function findMatchingExperience(entries, removedText, parentId) {
  const searchText = (removedText || parentId).toLowerCase();
  return entries.find(exp => {
    const fullText = `${exp.title || ''} ${exp.company || ''}`.toLowerCase();
    return fullText.includes(searchText) || searchText.includes((exp.title || '').toLowerCase());
  });
}

/**
 * Find a matching project entry by text search.
 */
function findMatchingProject(entries, removedText, parentId) {
  const searchText = (removedText || parentId).toLowerCase();
  return entries.find(proj => (proj.name || '').toLowerCase().includes(searchText));
}

/**
 * Map parentId for a suppress_section patch to the actual expId/projId.
 */
function mapSuppressSectionParentId(patch, structured) {
  const { section, parentId, removedText } = patch.target;

  if (section === "experience") {
    const matchedExp = findMatchingExperience(structured.experience || [], removedText, parentId);
    if (matchedExp) {
      console.log(`[TAILOR] Mapped experience parentId "${parentId}" to expId "${matchedExp.expId}"`);
      patch.target.parentId = matchedExp.expId;
    } else {
      console.log(`[TAILOR] WARNING: Could not map experience parentId "${parentId}". Will try text match in applier.`);
    }
  } else if (section === "projects") {
    const matchedProj = findMatchingProject(structured.projects || [], removedText, parentId);
    if (matchedProj) {
      console.log(`[TAILOR] Mapped project parentId "${parentId}" to projId "${matchedProj.projId}"`);
      patch.target.parentId = matchedProj.projId;
    }
  }
}

/**
 * Map text-based parentIds in patches to actual expIds/projIds from structured resume.
 */
function mapPatchParentIds(patch, structured) {
  if (patch.type === "suppress_section" && patch.target?.parentId) {
    mapSuppressSectionParentId(patch, structured);
  }

  // For remove_bullet patches, log text matching info
  if (patch.type === "remove_bullet" && patch.target?.bulletId) {
    const { section, removedText } = patch.target;
    if (section === "education" || section === "leadership_activities") {
      console.log(`[TAILOR] ${section} bullet removal will be matched by text: "${removedText}"`);
    }
  }

  return patch;
}

/**
 * Log debug information for the tailor/v2 endpoint.
 * Extracted to reduce cognitive complexity of the main handler.
 */
function logTailorV2Debug(parsed, validation) {
  const patchCount = parsed.patches?.length || 0;
  const validCount = validation.patches?.length || 0;
  console.log(`[TAILOR] Parsed ${patchCount} patches, ${parsed.skill_suggestions?.length || 0} skill suggestions`);
  console.log(`[TAILOR] Validation: ${validCount} valid, ${validation.summary?.errorCount || 0} errors`);

  if (patchCount > 0 && validCount > 0) {
    console.log(`[TAILOR] Validation filtered: sent ${patchCount}, got back ${validCount}, lost ${patchCount - validCount}`);
  }

  console.log("[TAILOR] Validation summary:", JSON.stringify(validation.summary, null, 2));
}

module.exports = {
  extractFirstJsonObject,
  normalizeTokens,
  containsNewNumbers,
  GENERIC_VERBS,
  findSuspiciousTokens,
  parseGeminiJson,
  buildBulletMap,
  resolveOriginalText,
  verifyPatches,
  extractTextFromReason,
  extractRemovedText,
  normalizeRemovalPatch,
  findMatchingExperience,
  findMatchingProject,
  mapSuppressSectionParentId,
  mapPatchParentIds,
  logTailorV2Debug,
};
