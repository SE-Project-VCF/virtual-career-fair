export type OfficeLocationLike = {
  label?: string | null
  city?: string | null
  state?: string | null
}

export type CompanyLocationFields = {
  remoteEmployer?: boolean
  officeLocations?: OfficeLocationLike[] | null
}

export type LegacyBoothLocationFields = {
  location?: string | null
  locationIsRemote?: boolean
  locationCity?: string | null
  locationState?: string | null
}

/** Match server merge: company first, then legacy booth fields. */
export function formatCompanyOfficeLocationsForDisplay(
  company: CompanyLocationFields | null | undefined,
  legacyBooth: LegacyBoothLocationFields | null | undefined,
): string {
  if (company?.remoteEmployer === true) return "Remote"
  const rows = Array.isArray(company?.officeLocations) ? company.officeLocations : []
  if (rows.length > 0) {
    return rows
      .map((r) => {
        const label = typeof r?.label === "string" ? r.label.trim() : ""
        if (label) return label
        const cs = [r?.city, r?.state].filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        return cs.join(", ")
      })
      .filter(Boolean)
      .join("; ")
  }
  const b = legacyBooth ?? {}
  if (b.locationIsRemote === true) return "Remote"
  const cs = [b.locationCity, b.locationState].filter((x): x is string => typeof x === "string" && x.trim().length > 0)
  if (cs.length) return cs.join(", ")
  if (typeof b.location === "string" && b.location.trim()) return b.location.trim()
  return ""
}
