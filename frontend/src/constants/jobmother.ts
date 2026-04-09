/** localStorage: user dismissed the welcome speech bubble (launcher stays full-body). */
export const JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY = "jobmother-welcome-bubble-dismissed"

/** Prior key; still read for migration from older builds. */
const JOBMOTHER_WELCOME_BUBBLE_DISMISSED_LEGACY_KEY = "jobmother-teaser-dismissed"

export function readWelcomeBubbleDismissed(): boolean {
  try {
    const ls = globalThis.localStorage
    if (!ls) return false
    if (ls.getItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY) === "true") return true
    return ls.getItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_LEGACY_KEY) === "true"
  } catch {
    return false
  }
}

/** Clears welcome-bubble state so the speech bubble can show again after sign-in. */
export function clearJobmotherWelcomeBubbleDismissed(): void {
  try {
    const ls = globalThis.localStorage
    ls?.removeItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY)
    ls?.removeItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_LEGACY_KEY)
  } catch {
    /* ignore */
  }
}

/** @deprecated Use clearJobmotherWelcomeBubbleDismissed */
export const clearJobmotherTeaserDismissed = clearJobmotherWelcomeBubbleDismissed

/** Quick replies when the assistant sets needsClarification (task-focused; matches example prompts). */
const CLARIFY_EVERYONE = [
  "Take me to my dashboard",
  "Show me career fairs",
  "Open chat",
] as const

const CLARIFY_STUDENT = [
  "Where are my job invitations?",
  "Show my call invitations",
  "Tailored resumes",
] as const

const CLARIFY_COMPANY = [
  "Candidate shortlist",
  "Q&A sessions",
  "My 1x1 calls as an employer",
  "Manage my company booth",
] as const

const CLARIFY_REP_EXTRA = ["View submissions for my booth"] as const

const CLARIFY_ADMIN = ["Open the admin panel", "Company management"] as const

const MAX_CLARIFY_CHIPS = 8

/**
 * Role-filtered clarify chips for Fairy Jobmother (everyone + role-specific, capped).
 */
export function getJobmotherClarifyChips(role: string | undefined): string[] {
  const base = [...CLARIFY_EVERYONE]
  if (!role || typeof role !== "string") {
    return base.slice(0, MAX_CLARIFY_CHIPS)
  }
  const r = role.trim().toLowerCase()
  if (r === "student") {
    return [...base, ...CLARIFY_STUDENT].slice(0, MAX_CLARIFY_CHIPS)
  }
  if (r === "companyowner" || r === "representative" || r === "company") {
    const extra: string[] = [...CLARIFY_COMPANY]
    if (r === "representative") {
      extra.push(...CLARIFY_REP_EXTRA)
    }
    return [...base, ...extra].slice(0, MAX_CLARIFY_CHIPS)
  }
  if (r === "administrator") {
    return [...base, ...CLARIFY_ADMIN].slice(0, MAX_CLARIFY_CHIPS)
  }
  return base.slice(0, MAX_CLARIFY_CHIPS)
}
