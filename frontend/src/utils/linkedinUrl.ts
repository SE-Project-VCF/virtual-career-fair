/**
 * Normalize and validate LinkedIn profile URLs for storage on user documents.
 * Allows linkedin.com (any subdomain) and lnkd.in short links.
 */
export type LinkedInParseResult =
  | { ok: true; href: string | null }
  | { ok: false; message: string }

export function parseLinkedInProfileUrl(input: string): LinkedInParseResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: true, href: null }

  let urlStr = trimmed
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`

  try {
    const u = new URL(urlStr)
    const host = u.hostname.replace(/^www\./i, "").toLowerCase()
    const isLinkedIn =
      host === "linkedin.com" ||
      host.endsWith(".linkedin.com") ||
      host === "lnkd.in" ||
      host.endsWith(".lnkd.in")
    if (!isLinkedIn) {
      return {
        ok: false,
        message: "Use a linkedin.com or lnkd.in profile URL.",
      }
    }
    u.hash = ""
    return { ok: true, href: u.toString() }
  } catch {
    return { ok: false, message: "Enter a valid URL." }
  }
}
