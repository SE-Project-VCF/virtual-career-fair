/** Pure helpers for Company job list / job form (unit-tested, no React). */

export interface CompanyJobRow {
  locationIsRemote?: boolean
  locationCity?: string | null
  locationState?: string | null
  location?: string | null
  createdAt?: number | null
}

export function formatJobLocationLine(job: CompanyJobRow): string {
  if (job.locationIsRemote === true) return "Remote"
  if (job.locationCity || job.locationState) {
    return (
      job.location ||
      [job.locationCity, job.locationState].filter(Boolean).join(", ")
    )
  }
  if (job.location) return job.location
  return "Location not set"
}

export function compareJobsByDate(a: CompanyJobRow, b: CompanyJobRow): number {
  if (!a.createdAt && !b.createdAt) return 0
  if (!a.createdAt) return 1
  if (!b.createdAt) return -1
  return b.createdAt - a.createdAt
}

export function getSaveButtonLabel(savingJob: boolean, editingJob: unknown): string {
  if (savingJob) return "Saving..."
  if (editingJob) return "Update Job"
  return "Publish Job"
}
