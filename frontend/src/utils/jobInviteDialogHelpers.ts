export interface InviteStudentRow {
  id: string
  firstName: string
  lastName: string
  email: string
  major: string
  skills?: string
  interestTags?: string[]
}

/** Coerce API rows so filters always see string skills and string[] tags. */
export function normalizeStudentFromApi(raw: unknown): InviteStudentRow {
  const s = raw as Record<string, unknown>
  let skills = ""
  if (typeof s.skills === "string") skills = s.skills
  else if (Array.isArray(s.skills)) {
    skills = s.skills.filter((x) => typeof x === "string").join(", ")
  } else if (s.skills != null) skills = String(s.skills)

  let interestTags: string[] = []
  if (Array.isArray(s.interestTags)) {
    interestTags = s.interestTags
      .map((t) => {
        if (typeof t === "string") return t.trim().toLowerCase().replaceAll(/\s+/g, " ")
        if (t && typeof t === "object") {
          const o = t as Record<string, unknown>
          const from = o.name ?? o.tag ?? o.label
          if (typeof from === "string") return from.trim().toLowerCase().replaceAll(/\s+/g, " ")
        }
        return ""
      })
      .filter(Boolean)
  }

  return {
    id: String(s.id ?? ""),
    firstName: String(s.firstName ?? ""),
    lastName: String(s.lastName ?? ""),
    email: String(s.email ?? ""),
    major: String(s.major ?? ""),
    skills,
    interestTags,
  }
}

export function normalizeInterestFilterToken(tag: string): string {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, " ")
}

export function studentSkillsMatchFilter(skills: string | undefined, filterRaw: string): boolean {
  const sk = filterRaw.trim().toLowerCase()
  if (!sk) return true
  const blob = (skills ?? "")
    .toLowerCase()
    .replaceAll(/\s*,\s*/g, " ")
    .replaceAll(/[;\n]+/g, " ")
    .replaceAll(/\s+/g, " ")
  return blob.includes(sk)
}

export function studentHasInterestTag(student: InviteStudentRow, selectedTag: string): boolean {
  const t = normalizeInterestFilterToken(selectedTag)
  if (!t) return true
  return (student.interestTags ?? []).some((tag) => {
    const nt = normalizeInterestFilterToken(String(tag))
    return nt === t || nt.includes(t) || t.includes(nt)
  })
}

export function formatInterestChipLabel(tag: string): string {
  return tag
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ")
}

export function formatTagDisplay(tag: string): string {
  return formatInterestChipLabel(tag)
}

export function getFilteredStudents(students: InviteStudentRow[], searchTerm: string): InviteStudentRow[] {
  const trimmedSearch = searchTerm.trim()
  if (trimmedSearch.length === 0) return students

  const searchLower = trimmedSearch.toLowerCase()
  return students.filter((student) => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase()
    const tagMatch = (student.interestTags ?? []).some((tag) => {
      const tl = tag.toLowerCase()
      return tl.includes(searchLower) || searchLower.includes(tl)
    })
    const skillsLower = (student.skills ?? "").toLowerCase()
    return (
      fullName.includes(searchLower) ||
      student.email.toLowerCase().includes(searchLower) ||
      student.major.toLowerCase().includes(searchLower) ||
      skillsLower.includes(searchLower) ||
      tagMatch
    )
  })
}

export function getStudentCountLabel(count: number): string {
  return count === 1 ? "student" : "students"
}

export function buildInfoMessage(
  poolMode: "booth" | "all",
  boothId: string | undefined,
  loadedCount: number,
  filteredCount: number
): string {
  let poolHint: string
  if (boothId && poolMode === "booth") {
    poolHint = `Loaded ${loadedCount} ${getStudentCountLabel(loadedCount)} who visited your booth.`
  } else {
    poolHint = `Loaded ${loadedCount} ${getStudentCountLabel(loadedCount)} from the full student list.`
  }

  let filterHint: string
  if (filteredCount !== loadedCount) {
    filterHint = ` ${filteredCount} match your filters below.`
  } else {
    filterHint =
      " Use filters or search to narrow the list, then use Select all to invite everyone shown."
  }

  return `${poolHint}${filterHint} Invitations are sent to students' dashboards.`
}

export function buildSendButtonLabel(isLoading: boolean, selectedCount: number): string {
  if (isLoading) return "Sending..."
  if (selectedCount === 0) return "Send"
  return `Send (${selectedCount})`
}

/** Copy for the empty filtered list in the invite dialog (no nested ternary in JSX). */
export function emptyInviteListHint(
  studentsLength: number,
  poolMode: "booth" | "all",
  boothId: string | undefined
): string {
  if (studentsLength > 0) {
    return "No students match your filters and search. Try clearing filters."
  }
  if (poolMode === "booth" && boothId) {
    return "No students have visited this booth yet, or try “All students” above."
  }
  return "No students found."
}
