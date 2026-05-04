# Multi-Booth Support — Companies with Multiple Booths per Fair

## Summary

Allow companies to create multiple global booth profiles and enroll multiple booths in a single fair. Currently the system enforces a strict 1:1 relationship between company and booth (globally via `company.boothId`, per-fair via enrollment keyed by `companyId`). This feature removes those constraints.

## Motivation

Companies often recruit for multiple divisions or roles (e.g., "Google - Engineering" and "Google - Marketing"). Forcing them into a single booth limits their presence and makes it harder for students to find the right team. Allowing multiple booths per company per fair gives employers flexibility to represent their different teams.

## Scope

**In scope:**
- Companies can create multiple global booth profiles
- Companies can select multiple booths when enrolling in a fair
- Company dashboard shows a list of booths with a "Create New Booth" button
- All reps in a company can manage all of that company's booths (no per-booth rep assignment)

**Out of scope:**
- Per-booth rep assignment (all reps see all booths)
- Changes to booth ratings, visitor tracking, Q&A sessions (already keyed by individual booth ID)
- Changes to the fair booths display page for students (already renders all fair-scoped booths)
- Limits on how many booths a company can create or enroll

## Data Model Changes

### Company document (`companies/{companyId}`)

Remove the single `boothId` field. No replacement needed — booths are queried from the global `booths` collection by `companyId`.

**Migration:** Existing `boothId` field on company docs can be ignored on read. No destructive migration needed — the field just becomes unused.

### Global booths collection (`booths/{boothId}`)

No schema change. Each booth already has a `companyId` field. Multiple docs with the same `companyId` are now allowed. Each booth should also store a `boothName` field (already accepted by `POST /api/booths` but not prominently used) to distinguish booths within the same company (e.g., "Engineering", "Marketing").

### Enrollment document (`fairs/{fairId}/enrollments/{companyId}`)

Change `boothId: string` to `boothIds: string[]` — an array of fair-scoped booth IDs created during enrollment.

### Fair-scoped booths (`fairs/{fairId}/booths/{boothId}`)

No schema change. Multiple docs per company are now created during enrollment (one per selected global booth).

## Backend Changes

### Modified: `POST /api/booths` (create booth)

Location: `backend/routes/booths.js:18-76`

No change needed to the endpoint itself — it already accepts `companyId` and creates a doc in the global `booths` collection. It does NOT enforce 1:1. The constraint was only in the frontend (`BoothEditor.tsx` linking `company.boothId`).

### New: `GET /api/booths?companyId=X` (list company's global booths)

Location: `backend/routes/booths.js` (new endpoint)

- Auth: required (`verifyFirebaseToken`)
- Authorization: user must be owner, rep, or admin for the company
- Query: `db.collection("booths").where("companyId", "==", companyId)`
- Response: `{ booths: [{ id, companyId, boothName, companyName, industry, ... }] }`
- Used by the enrollment multi-select picker and the company dashboard booth list

### Modified: `POST /api/fairs/:fairId/enroll`

Location: `backend/routes/fairs.js:753-800`

Changes:
- Accept `boothIds: string[]` in the request body (array of global booth IDs to enroll)
- Validate that all `boothIds` belong to the requesting company
- Remove the "already enrolled" check that blocks re-enrollment entirely. Instead, check that none of the selected booths are already enrolled in this fair.
- For each booth ID, call `getCompanyAndBoothSnapshot()` variant that accepts a specific booth ID, then create a fair-scoped booth snapshot
- Store `boothIds: [...]` (array of fair-scoped booth IDs) on the enrollment document instead of single `boothId`
- Return `{ boothIds: [...], fairId }` instead of `{ boothId, fairId }`

### Modified: `getCompanyAndBoothSnapshot(companyId)` helper

Location: `backend/routes/fairs.js:102-153`

Add an optional `boothId` parameter: `getCompanyAndBoothSnapshot(companyId, boothId)`. When provided, fetch that specific booth doc instead of reading `company.boothId`. Fallback behavior (no boothId) stays the same for backward compatibility.

### Modified: `createEnrollmentWithBooth()` helper

Location: `backend/routes/fairs.js:155-183`

Rename to `createEnrollmentWithBooths()`. Accept an array of booth snapshots instead of one. Create all fair-scoped booth docs in the batch and store `boothIds: [...]` on the enrollment doc.

## Frontend Changes

### Company Dashboard — Booth List

Location: `frontend/src/pages/Company.tsx` (BoothManagementCard, lines 309-373)

Replace the current single-booth card with a list of booth cards:
- Fetch booths via `GET /api/booths?companyId=X`
- Show each booth as a card with its `boothName`, industry, and "Edit" button
- Add a "Create New Booth" button that navigates to `BoothEditor` without a booth ID
- Remove reliance on `company.boothId`

### BoothEditor — Support create/edit without `company.boothId`

Location: `frontend/src/pages/BoothEditor.tsx`

Changes:
- Accept a `boothId` URL param for editing an existing booth
- On create: add doc to `booths` collection with `companyId` — do NOT update `company.boothId`
- On edit: update the existing booth doc (no change from current behavior)
- Add a required `boothName` field to the form (currently optional/unused)
- After save, navigate back to company dashboard

### Enrollment Flow — Multi-Select Booths

Location: `frontend/src/pages/FairLanding.tsx` (handleJoinFair, lines 77-106)

Changes:
- Before enrolling, fetch the company's global booths via `GET /api/booths?companyId=X`
- Show a multi-select dialog/checklist where the user picks which booths to bring
- Send `boothIds: [...]` in the enrollment request body
- On success, navigate to the company dashboard (not a single booth editor)
- If company has zero booths, prompt them to create one first

## Error Handling

- `POST /api/fairs/:fairId/enroll` with `boothIds` containing IDs not owned by the company: return 403
- `POST /api/fairs/:fairId/enroll` with `boothIds` where some are already enrolled: return 400 listing which are duplicates
- `POST /api/fairs/:fairId/enroll` with empty `boothIds`: return 400
- `GET /api/booths?companyId=X` without auth or wrong company: return 401/403

## Testing

**Backend:**
- `GET /api/booths?companyId=X` returns all booths for a company, empty array if none
- `GET /api/booths?companyId=X` requires auth and company access
- `POST /api/fairs/:fairId/enroll` with `boothIds: [b1, b2]` creates two fair-scoped booths and stores `boothIds` array on enrollment
- `POST /api/fairs/:fairId/enroll` rejects booth IDs not owned by the company
- `POST /api/fairs/:fairId/enroll` rejects empty `boothIds`
- `POST /api/fairs/:fairId/enroll` rejects if any selected booth is already enrolled in the fair
- `getCompanyAndBoothSnapshot(companyId, boothId)` fetches the specific booth
- `createEnrollmentWithBooths()` creates multiple fair-scoped booths atomically

**Frontend:**
- Company dashboard renders multiple booth cards
- "Create New Booth" navigates to BoothEditor
- BoothEditor creates a booth without setting `company.boothId`
- Enrollment dialog shows booth multi-select
- Enrollment sends `boothIds` array

## Backward Compatibility

- Existing companies with a single `company.boothId` will continue to work. The `GET /api/booths?companyId=X` endpoint queries by `companyId` on the booth docs, not by `company.boothId`.
- Existing enrollment docs with `boothId: string` should be handled gracefully — read code should accept both `boothId` (string) and `boothIds` (array) during the transition. Normalize to array on read.
- The `getCompanyAndBoothSnapshot` helper's no-arg form still falls back to `company.boothId` for backward compat.

## Open Questions

None.
