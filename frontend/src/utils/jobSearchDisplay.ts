import type { LocationSuggestOption } from "../hooks/useGeocodeSuggest"

/** Fields used to render a one-line job location on the job search page. */
export interface JobLocationFields {
  locationIsRemote?: boolean
  locationCity?: string | null
  locationState?: string | null
  location?: string | null
}

/**
 * Builds the `location` query param for job search from a Mapbox-backed suggestion.
 * The API matches case-insensitive substrings on city, state, and stored location label.
 */
export function locationQueryParamFromSuggest(opt: LocationSuggestOption): string {
  const city = opt.city?.trim()
  const st = opt.state?.trim()
  if (city && st) return `${city}, ${st}`
  if (city) return city
  const label = opt.label.trim()
  const first = label.split(",")[0]?.trim()
  return first || label
}

export function formatJobLocation(job: JobLocationFields): string {
  if (job.locationIsRemote === true) return "Remote"
  if (job.locationCity || job.locationState) {
    return job.location || [job.locationCity, job.locationState].filter(Boolean).join(", ")
  }
  if (job.location) return job.location
  return "—"
}
