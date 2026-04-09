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
