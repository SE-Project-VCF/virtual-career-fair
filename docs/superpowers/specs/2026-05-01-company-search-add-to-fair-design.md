# Company Search When Adding to Fair — Design

## Problem

The fair admin dashboard currently asks an admin to paste a Firestore company ID into a text field to enroll a company in a fair ([FairAdminDashboard.tsx:1006-1012](../../../frontend/src/pages/FairAdminDashboard.tsx#L1006-L1012)). Admins do not know company IDs. They know company names. The current UX forces them out of the app to look an ID up, then copy-paste it back in.

## Goal

Replace the company-ID input with an in-dialog search picker. The admin types the name, sees matching companies with enough context to disambiguate, and selects one. The existing enroll API call is unchanged.

## Non-goals

- Full-text search across company description / hiring fields. Prefix-on-name is enough for this picker.
- Replacing the invite-code enrollment path (admins enrolling on behalf of companies coexists with companies self-enrolling via invite code).
- Reworking the enrollments table or any other dashboard surface.

## Architecture

### Backend — new endpoint

`GET /api/companies/search?q=<prefix>&fairId=<id>&limit=20`

- **Auth:** must be an admin for `fairId`. Reuse the same admin check the existing enroll route uses ([fairs.js:995-1073](../../../backend/routes/fairs.js#L995-L1073)).
- **Validation:** `q` required, trimmed, lowercased server-side; reject if empty after trim. `limit` clamped to `[1, 50]`, default 20.
- **Query:** Firestore prefix on a new lowercased name field. The upper bound uses `\uf8ff` (a high private-use code point that sorts after all standard text), the standard Firestore prefix-range pattern:

  ```js
  db.collection("companies")
    .where("companyNameLower", ">=", q)
    .where("companyNameLower", "<", q + "\uf8ff")
    .orderBy("companyNameLower")
    .limit(limit)
  ```

- **Enrollment join:** for each hit, read `fairs/{fairId}/enrollments/{companyId}` (parallel `Promise.all`) and set `alreadyEnrolled: boolean`.
- **Lazy backfill:** if a hit doc lacks `companyNameLower`, write it back in a fire-and-forget batch (don't block the response).
- **Response:**

  ```json
  {
    "results": [
      {
        "companyId": "...",
        "companyName": "Acme Corp",
        "logoUrl": "https://..." ,
        "industry": "Software",
        "primaryLocation": "Austin, TX",
        "alreadyEnrolled": false
      }
    ]
  }
  ```

  `primaryLocation` is `"Remote"` if `remoteEmployer === true`, else `"<city>, <state>"` from `officeLocations[0]`, else `null`. `logoUrl` and `industry` may be `null`.

### Backend — companyNameLower maintenance

- **On create** ([companies.js:32-38](../../../backend/routes/companies.js#L32-L38)): write `companyNameLower: companyName.trim().toLowerCase()` alongside `companyName`.
- **No company-rename path exists today.** The `companyName` field on the `companies/{id}` doc is set at creation and never updated by current routes — the closest update path ([fairs.js:1283](../../../backend/routes/fairs.js#L1283)) edits the *booth* doc's denormalized `companyName`, not the company doc. So no maintenance hook on rename is needed in this change. If a future rename route is added, that route must also update `companyNameLower`; flagged here so it isn't missed.
- **One-time backfill script:** `backend/scripts/backfillCompanyNameLower.js` — iterates the `companies` collection, writes `companyNameLower` where missing, idempotent. Documented in script header; run once on each environment.

### Frontend — Autocomplete picker

Replace the `TextField` in the "Add Company to Fair" dialog ([FairAdminDashboard.tsx:1006-1012](../../../frontend/src/pages/FairAdminDashboard.tsx#L1006-L1012)) with an MUI `Autocomplete` that mirrors the pattern in [JobSearchPage.tsx](../../../frontend/src/pages/JobSearchPage.tsx).

- **Local state:** `inputValue: string`, `selectedCompany: SearchResult | null`, `options: SearchResult[]`, `loading: boolean`, `searchError: string | null`.
- **Debounce:** 250 ms after the latest keystroke before calling the search endpoint. Cancel/ignore stale responses by comparing the response's query string to the current `inputValue` via a ref.
- **Min query length:** 2. Below that, show helper text "Type at least 2 characters" and skip the request.
- **Render option:**
  - Avatar (logo if `logoUrl`, otherwise an initial-fallback).
  - Primary line: `companyName`.
  - Secondary line: `[industry, primaryLocation].filter(Boolean).join(" • ")`, or `—` if both null.
  - If `alreadyEnrolled`: option is disabled (`getOptionDisabled`), and the secondary line shows `"Already enrolled in this fair"`.
- **Add button:** enabled only when `selectedCompany && !selectedCompany.alreadyEnrolled`. On click, the existing `handleAddCompany` runs, but uses `selectedCompany.companyId` instead of `addCompanyId.trim()`.
- **Dialog close / cancel:** clears `inputValue`, `selectedCompany`, `options`, `searchError` — same lifecycle as today.

## Data flow

1. Admin opens "Add Company to Fair" dialog.
2. Admin types; debounced input fires `GET /api/companies/search?q=<lowercased>&fairId=<id>`.
3. Backend verifies admin, runs prefix query, joins enrollments, returns up to 20 rows.
4. Autocomplete renders rows; already-enrolled rows are disabled.
5. Admin selects a row, clicks "Add Company".
6. Existing `POST /api/fairs/:fairId/enroll` runs with `{ companyId }` — unchanged.
7. On success: dialog closes, enrollments list reloads.

## Error handling

| Case | Behavior |
| --- | --- |
| `q` < 2 chars | Frontend skips request, shows "Type at least 2 characters" |
| No matches | Autocomplete shows "No companies found" |
| Network / 5xx on search | Autocomplete shows "Search failed — try again"; user can keep typing |
| 403 on search | Same as 5xx (shouldn't happen — admins reach this dialog only if authorized) |
| 400 missing `q` | Surfaced as search error; UI prevents this case |
| Race: company enrolled by another admin between search and click | Existing enroll route returns the duplicate error; existing `addError` Alert displays it |
| Company missing `companyNameLower` (pre-backfill) | Won't appear in search until script runs or until any other write touches it |
| Stale debounced response | Compared against current `inputValue` via ref; mismatched responses dropped |

## Testing

### Backend (Jest, mirroring `backend/tests/routes/fairs.test.js`)

- 401 when unauthenticated.
- 403 when authenticated but not admin for that fair.
- 400 when `q` missing or empty after trim.
- Returns matches when `companyNameLower` matches prefix; case-insensitive (input "ACME" → matches "Acme Corp").
- `alreadyEnrolled: true` for companies with a doc at `fairs/{fairId}/enrollments/{companyId}`; `false` otherwise.
- `primaryLocation` resolves correctly for: remote employer, employer with office locations, employer with neither.
- Honors `limit` query param; clamps to 50.
- Lazy backfill: when a matching doc lacks `companyNameLower`, the field is written after the response.

### Backend — create/update tests

- POST `/api/companies` writes both `companyName` and `companyNameLower`.

### Frontend (React Testing Library, mirroring existing dashboard tests)

- Typing "ac" calls the search endpoint with `q=ac`, displays returned options.
- Already-enrolled options are disabled and show the enrolled label.
- Selecting an option then clicking "Add Company" fires `POST /api/fairs/:fairId/enroll` with the option's `companyId`.
- Search error message renders on fetch failure.
- Cancel resets state.

### Manual smoke

- Run backend + frontend dev servers.
- As an admin, open Add Company dialog, search by partial mixed-case name, see expected matches.
- Confirm logo + secondary-line render.
- Enroll a company, confirm it appears in the enrollments table and is disabled in the next search.

## Migration & rollout

1. Land backend changes (write-side first, so newly created/updated companies get `companyNameLower` immediately).
2. Run the backfill script in each environment.
3. Land the search endpoint and frontend Autocomplete together.
4. No feature flag needed — the dialog change is internal to fair admins and the old field is fully replaced.
