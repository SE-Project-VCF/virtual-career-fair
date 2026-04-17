import type { NavigateFunction } from "react-router-dom"
import type { ApplicationForm } from "../types/applicationForm"

/** Geocode/autocomplete selection for an on-site job (structurally matches LocationSuggestOption). */
export interface CompanyJobLocationPick {
  city?: string | null
  state?: string | null
}

/** Job posting form slice validated before create/update from the Company page. */
export interface CompanyJobFormForValidation {
  title: string
  description: string
  skills: string
  applicationLink: string
  locationIsRemote: boolean
  locationPick: CompanyJobLocationPick | null
}

export type CompanyJobFormValidationErrors = {
  title?: string
  description?: string
  skills?: string
  applicationLink?: string
  location?: string
}

/** Client-side validation for publish/update job posting (matches Company.tsx rules). */
export function validateCompanyJobForm(jobForm: CompanyJobFormForValidation): CompanyJobFormValidationErrors {
  const errors: CompanyJobFormValidationErrors = {}
  if (!jobForm.title.trim()) errors.title = "Title is required"
  if (!jobForm.description.trim()) errors.description = "Description is required"
  if (!jobForm.skills.trim()) errors.skills = "Skills are required"
  if (jobForm.applicationLink.trim()) {
    try {
      new URL(jobForm.applicationLink.trim())
    } catch {
      errors.applicationLink = "Please enter a valid URL (e.g. https://example.com)"
    }
  }
  if (!jobForm.locationIsRemote) {
    const pick = jobForm.locationPick
    if (!pick?.city?.trim() || !pick?.state?.trim()) {
      errors.location = "Select a location from the suggestions for on-site jobs"
    }
  }
  return errors
}

/** Minimal company fields used for access checks (matches Company page model). */
export interface CompanyAccessTarget {
  ownerId: string
  representativeIDs?: string[]
}

/** API job row shape produced for the company jobs list. */
export interface CompanyJobFromApi {
  id: string
  companyId: string
  name: string
  description: string
  majorsAssociated: string
  applicationLink: string | null
  createdAt: number | null
  locationIsRemote?: boolean
  locationCity?: string | null
  locationState?: string | null
  location?: string | null
  applicationForm?: ApplicationForm
}

export function logClientError(message: string, error: unknown): void {
  const kind = error instanceof Error ? error.name : typeof error
  console.error(message, kind)
}

export function mapApiRecordToJob(j: Record<string, unknown>): CompanyJobFromApi {
  return {
    id: j.id as string,
    companyId: j.companyId as string,
    name: j.name as string,
    description: j.description as string,
    majorsAssociated: j.majorsAssociated as string,
    applicationLink: (j.applicationLink as string | null) ?? null,
    createdAt: (j.createdAt as number | null) ?? null,
    locationIsRemote: j.locationIsRemote === true,
    locationCity: (j.locationCity as string | null) ?? null,
    locationState: (j.locationState as string | null) ?? null,
    location: (j.location as string | null) ?? null,
    applicationForm: j.applicationForm as ApplicationForm | undefined,
  }
}

export function ensureCompanyViewerAccess(
  companyInfo: CompanyAccessTarget,
  userId: string | undefined,
  userRole: string | null | undefined,
  nav: { setError: (msg: string) => void; navigate: NavigateFunction }
): boolean {
  if (userRole === "companyOwner" && companyInfo.ownerId !== userId) {
    nav.setError("You don't have access to this company")
    nav.navigate("/companies")
    return false
  }

  if (userRole === "representative" && !companyInfo.representativeIDs?.includes(userId ?? "")) {
    nav.setError("You don't have access to this company")
    nav.navigate("/dashboard")
    return false
  }

  if (userRole !== "companyOwner" && userRole !== "representative") {
    nav.navigate("/dashboard")
    return false
  }

  return true
}
