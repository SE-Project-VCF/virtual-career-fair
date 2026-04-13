/** Fields used to render a one-line job location on the job search page. */
export interface JobLocationFields {
  locationIsRemote?: boolean
  locationCity?: string | null
  locationState?: string | null
  location?: string | null
}

export function formatJobLocation(job: JobLocationFields): string {
  if (job.locationIsRemote === true) return "Remote"
  if (job.locationCity || job.locationState) {
    return job.location || [job.locationCity, job.locationState].filter(Boolean).join(", ")
  }
  if (job.location) return job.location
  return "—"
}
