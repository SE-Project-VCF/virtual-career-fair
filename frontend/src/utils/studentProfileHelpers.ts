import { ACCEPTED_INTEREST_TAGS } from "../constants/interestTagOptions"

export const MAX_INTEREST_TAGS = 15

const acceptedInterestSet = new Set(ACCEPTED_INTEREST_TAGS)

/**
 * Normalizes, de-dupes, and caps interest tags from Autocomplete / Firestore.
 */
export function normalizeInterestTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim().toLowerCase().replaceAll(/\s+/g, " ")
    if (!acceptedInterestSet.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= MAX_INTEREST_TAGS) break
  }
  return out
}

/** Safe string for Firestore text fields (avoids [object Object] if value was wrong type). */
export function stringFieldFromFirestore(value: unknown, fallback = ""): string {
  if (value == null) return fallback
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return fallback
}
