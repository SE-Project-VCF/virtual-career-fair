"use strict";

/**
 * Closed set of intent IDs the LLM may return (no paths — resolver maps to routes).
 * @type {readonly string[]}
 */
const JOBMOTHER_INTENT_IDS = Object.freeze([
  "GO_DASHBOARD",
  "GO_FAIRS",
  "GO_CHAT",
  "GO_PROFILE",
  "GO_FAIRY_PAGE",
  "GO_JOB_INVITATIONS",
  "GO_CALL_INVITATIONS",
  "GO_STUDENT_1X1",
  "GO_TAILORED_RESUMES",
  "GO_BOOTH_HISTORY",
  "GO_COMPANIES",
  "GO_BOOTHS",
  "GO_SHORTLIST",
  "GO_QA_SESSIONS",
  "GO_MY_CALLS",
  "GO_MANAGE_BOOTH",
  "GO_SUBMISSIONS",
  "GO_ADMIN",
  "GO_FAIR_LANDING",
  "GO_FAIR_BOOTHS",
  "CLARIFY",
]);

const INTENT_ID_SET = new Set(JOBMOTHER_INTENT_IDS);

function normalizeRole(role) {
  if (!role || typeof role !== "string") return "";
  const r = role.trim().toLowerCase();
  if (r === "company") return "companyowner";
  return r;
}

/**
 * @param {string} intentId
 * @param {{ role?: string, companyId?: string|null, fairId?: string|null }} ctx
 * @returns {boolean}
 */
function intentAllowedForRole(intentId, ctx) {
  const r = normalizeRole(ctx.role);
  const companyId = ctx.companyId && String(ctx.companyId).trim();
  const fairId = ctx.fairId && String(ctx.fairId).trim();

  switch (intentId) {
    case "GO_DASHBOARD":
    case "GO_FAIRS":
    case "GO_CHAT":
    case "GO_PROFILE":
    case "GO_FAIRY_PAGE":
    case "CLARIFY":
      return true;
    case "GO_JOB_INVITATIONS":
    case "GO_CALL_INVITATIONS":
    case "GO_STUDENT_1X1":
    case "GO_TAILORED_RESUMES":
    case "GO_BOOTH_HISTORY":
      return r === "student";
    case "GO_COMPANIES":
      return r === "companyowner" || r === "administrator";
    case "GO_BOOTHS":
      return ["student", "companyowner", "representative", "administrator"].includes(r);
    case "GO_SHORTLIST":
    case "GO_QA_SESSIONS":
    case "GO_MY_CALLS":
      return r === "companyowner" || r === "representative";
    case "GO_SUBMISSIONS":
      return r === "representative" && Boolean(companyId);
    case "GO_MANAGE_BOOTH":
      if (r === "representative" && companyId) return true;
      if (r === "companyowner") return true;
      return false;
    case "GO_ADMIN":
      return r === "administrator";
    case "GO_FAIR_LANDING":
    case "GO_FAIR_BOOTHS":
      return Boolean(fairId);
    default:
      return false;
  }
}

/**
 * @param {string} intentId
 * @param {{ role?: string, companyId?: string|null, fairId?: string|null }} ctx
 * @returns {{ path: string, label: string }|null}
 */
function intentToLink(intentId, ctx) {
  const r = normalizeRole(ctx.role);
  const companyId = ctx.companyId && String(ctx.companyId).trim();
  const fairId = ctx.fairId && String(ctx.fairId).trim();

  switch (intentId) {
    case "CLARIFY":
      return null;
    case "GO_DASHBOARD":
      return { path: "/dashboard", label: "Dashboard" };
    case "GO_FAIRS":
      return { path: "/fairs", label: "Browse Fairs" };
    case "GO_CHAT":
      return { path: "/dashboard/chat", label: "Chat" };
    case "GO_PROFILE":
      return { path: "/profile", label: "Profile" };
    case "GO_FAIRY_PAGE":
      return { path: "/dashboard/fairy-jobmother", label: "Fairy Jobmother" };
    case "GO_JOB_INVITATIONS":
      return { path: "/dashboard/job-invitations", label: "Job Invitations" };
    case "GO_CALL_INVITATIONS":
      return { path: "/dashboard/call-invitations", label: "Call Invitations" };
    case "GO_STUDENT_1X1":
      return { path: "/dashboard/1x1-calls", label: "My 1x1 Calls" };
    case "GO_TAILORED_RESUMES":
      return { path: "/dashboard/tailored-resumes", label: "Tailored Resumes" };
    case "GO_BOOTH_HISTORY":
      return { path: "/dashboard/booth-history", label: "Booth History" };
    case "GO_COMPANIES":
      return { path: "/companies", label: "Company Management" };
    case "GO_BOOTHS":
      return { path: "/booths", label: "Browse Booths" };
    case "GO_SHORTLIST":
      return { path: "/dashboard/shortlist", label: "Candidate Shortlist" };
    case "GO_QA_SESSIONS":
      return { path: "/dashboard/qa-sessions", label: "Q&A Sessions" };
    case "GO_MY_CALLS":
      return { path: "/dashboard/my-calls", label: "My 1x1 Calls" };
    case "GO_SUBMISSIONS":
      if (!companyId) return null;
      return { path: `/company/${companyId}/submissions`, label: "Submissions" };
    case "GO_MANAGE_BOOTH":
      if (r === "representative" && companyId) {
        return { path: `/company/${companyId}/booth`, label: "Manage Booth" };
      }
      if (r === "companyowner") {
        return { path: "/companies", label: "Manage Companies" };
      }
      return null;
    case "GO_ADMIN":
      return { path: "/admin", label: "Admin Panel" };
    case "GO_FAIR_LANDING":
      if (!fairId) return null;
      return { path: `/fair/${fairId}`, label: "Fair home" };
    case "GO_FAIR_BOOTHS":
      if (!fairId) return null;
      return { path: `/fair/${fairId}/booths`, label: "Fair booths" };
    default:
      return null;
  }
}

const MAX_LINKS = 3;

/**
 * @param {Array<{ id?: string }>} intents
 * @param {{ role?: string, companyId?: string|null, fairId?: string|null }} userContext
 * @returns {{ links: Array<{ path: string, label: string }>, droppedIntents: string[] }}
 */
function resolveJobmotherIntents(intents, userContext) {
  const links = [];
  const droppedIntents = [];
  const seenPaths = new Set();

  if (!Array.isArray(intents)) {
    return { links: [], droppedIntents: [] };
  }

  for (const raw of intents) {
    const id = raw && typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || !INTENT_ID_SET.has(id)) {
      if (id) droppedIntents.push(id);
      continue;
    }
    if (!intentAllowedForRole(id, userContext)) {
      droppedIntents.push(id);
      continue;
    }
    const link = intentToLink(id, userContext);
    if (!link || !link.path) {
      droppedIntents.push(id);
      continue;
    }
    if (seenPaths.has(link.path)) continue;
    seenPaths.add(link.path);
    links.push(link);
    if (links.length >= MAX_LINKS) break;
  }

  return { links, droppedIntents };
}

/**
 * Human-readable catalog for the LLM prompt (intents only, not paths).
 * @returns {string}
 */
function buildIntentCatalogForPrompt() {
  const lines = [
    "You must only use these intent ids in the intents array:",
    "",
    "- GO_DASHBOARD — main dashboard",
    "- GO_FAIRS — list/browse career fairs",
    "- GO_CHAT — messages with other users (Stream chat)",
    "- GO_PROFILE — user profile",
    "- GO_FAIRY_PAGE — Fairy Jobmother info page",
    "- GO_JOB_INVITATIONS — job invitations (students)",
    "- GO_CALL_INVITATIONS — call invitations (students)",
    "- GO_STUDENT_1X1 — student 1x1 call invitations list",
    "- GO_TAILORED_RESUMES — tailored resumes (students)",
    "- GO_BOOTH_HISTORY — booth visit history (students)",
    "- GO_COMPANIES — manage companies (company owners, admins)",
    "- GO_BOOTHS — browse employer booths",
    "- GO_SHORTLIST — candidate shortlist (employers)",
    "- GO_QA_SESSIONS — Q&A sessions (employers)",
    "- GO_MY_CALLS — employer 1x1 calls",
    "- GO_MANAGE_BOOTH — edit company booth (rep with company, or company owner → companies)",
    "- GO_SUBMISSIONS — application submissions for a company booth (representatives)",
    "- GO_ADMIN — administrator panel",
    "- GO_FAIR_LANDING — current fair overview (only when user is in a fair context)",
    "- GO_FAIR_BOOTHS — booths inside current fair (only when fair context is provided)",
    "- CLARIFY — user needs to rephrase; no navigation",
    "",
    "Do not output URLs or paths. Only intent ids from the list above.",
  ];
  return lines.join("\n");
}

module.exports = {
  JOBMOTHER_INTENT_IDS,
  resolveJobmotherIntents,
  buildIntentCatalogForPrompt,
  intentAllowedForRole,
  intentToLink,
};
