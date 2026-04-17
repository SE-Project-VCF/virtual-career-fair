export interface InviteStudentRow {
  id: string
  firstName: string
  lastName: string
  email: string
  major: string
  skills?: string
  interestTags?: string[]
}

/** Safe string for student fields from untyped API / Firestore (avoids `[object Object]`). */
function coerceApiPrimitiveString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

/** Collapses runs of ASCII whitespace to single spaces — O(n), no backtracking. */
function collapseAsciiWhitespace(s: string): string {
  const parts: string[] = []
  let cur = ""
  let i = 0
  while (i < s.length) {
    const cp = s.codePointAt(i)
    if (cp === undefined) break
    const chSize = cp > 0xffff ? 2 : 1
    const isWs = cp === 32 || cp === 9 || cp === 10 || cp === 13
    if (isWs) {
      if (cur.length > 0) {
        parts.push(cur)
        cur = ""
      }
    } else {
      cur += String.fromCodePoint(cp)
    }
    i += chSize
  }
  if (cur.length > 0) parts.push(cur)
  return parts.join(" ")
}

/**
 * Normalizes skills text for substring search: same intent as the old regex chain
 * (commas, semicolons, newlines as delimiters; collapse whitespace) without regex.
 */
function normalizeSkillsBlobForFilter(raw: string): string {
  let s = raw.toLowerCase()
  s = s.split("\r\n").join("\n")
  s = s.split("\r").join("\n")
  s = s.split("\n").join(",")
  s = s.split(";").join(",")
  const segments = s
    .split(",")
    .map((p) => collapseAsciiWhitespace(p.trim()))
    .filter((p) => p.length > 0)
  return collapseAsciiWhitespace(segments.join(" "))
}

/** Coerce API rows so filters always see string skills and string[] tags. */
export function normalizeStudentFromApi(raw: unknown): InviteStudentRow {
  const s = raw as Record<string, unknown>
  let skills = ""
  if (typeof s.skills === "string") skills = s.skills
  else if (Array.isArray(s.skills)) {
    skills = s.skills.filter((x) => typeof x === "string").join(", ")
  } else {
    skills = coerceApiPrimitiveString(s.skills)
  }

  let interestTags: string[] = []
  if (Array.isArray(s.interestTags)) {
    interestTags = s.interestTags
      .map((t) => {
        if (typeof t === "string") return collapseAsciiWhitespace(t.trim().toLowerCase())
        if (t && typeof t === "object") {
          const o = t as Record<string, unknown>
          const from = o.name ?? o.tag ?? o.label
          if (typeof from === "string") return collapseAsciiWhitespace(from.trim().toLowerCase())
        }
        return ""
      })
      .filter(Boolean)
  }

  return {
    id: coerceApiPrimitiveString(s.id),
    firstName: coerceApiPrimitiveString(s.firstName),
    lastName: coerceApiPrimitiveString(s.lastName),
    email: coerceApiPrimitiveString(s.email),
    major: coerceApiPrimitiveString(s.major),
    skills,
    interestTags,
  }
}

export function normalizeInterestFilterToken(tag: string): string {
  return collapseAsciiWhitespace(tag.trim().toLowerCase())
}

export function studentSkillsMatchFilter(skills: string | undefined, filterRaw: string): boolean {
  const sk = filterRaw.trim().toLowerCase()
  if (!sk) return true
  const blob = normalizeSkillsBlobForFilter(skills ?? "")
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
  if (trimmedSearch.length > 0) {
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
  return students
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
  if (filteredCount === loadedCount) {
    filterHint =
      " Use filters or search to narrow the list, then use Select all to invite everyone shown."
  } else {
    filterHint = ` ${filteredCount} match your filters below.`
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
