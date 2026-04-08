/** localStorage key for Fairy Jobmother welcome teaser dismissed state */
export const JOBMOTHER_TEASER_DISMISSED_KEY = "jobmother-teaser-dismissed"

export function clearJobmotherTeaserDismissed(): void {
  try {
    globalThis.localStorage?.removeItem(JOBMOTHER_TEASER_DISMISSED_KEY)
  } catch {
    /* ignore */
  }
}
