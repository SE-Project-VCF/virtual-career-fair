function stripTrailingSlashes(s: string): string {
  let i = s.length
  while (i > 0 && s[i - 1] === "/") i--
  return s.slice(0, i)
}

/** Removes a final `/api` path segment (case-insensitive on `api`). */
function stripTrailingApiSegment(s: string): string {
  if (s.length < 4) return s
  if (s[s.length - 4] !== "/") return s
  if (s.slice(-3).toLowerCase() !== "api") return s
  return s.slice(0, -4)
}

const rawApiBase = (import.meta.env.VITE_API_URL || "http://localhost:5001").trim()
/** Origin only: no trailing slash, no trailing `/api` (URLs are built as `${API_URL}/api/...`). */
export const API_URL = stripTrailingApiSegment(stripTrailingSlashes(rawApiBase))

function normalizeMapboxToken(raw: string): string {
  let t = raw.replace(/\r/g, "").replace(/^\uFEFF/, "").trim()
  const firstLine = t.split("\n")[0]?.trim() ?? ""
  t = firstLine
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim()
  }
  return t
}

/**
 * Public Mapbox token (pk.*) for GL JS in the browser only.
 * Secret tokens (sk.*) will return 401 from Mapbox when loading styles/tiles.
 */
export const MAPBOX_ACCESS_TOKEN =
  typeof import.meta.env.VITE_MAPBOX_ACCESS_TOKEN === "string"
    ? normalizeMapboxToken(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN)
    : "";

/** True when a token string is present and looks like a public Mapbox token. */
export const MAPBOX_TOKEN_LOOKS_PUBLIC =
  MAPBOX_ACCESS_TOKEN.startsWith("pk.") && MAPBOX_ACCESS_TOKEN.length > 20;
