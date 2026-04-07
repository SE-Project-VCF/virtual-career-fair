export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
