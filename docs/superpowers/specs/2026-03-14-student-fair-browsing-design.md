# Student Fair Browsing — Remove Invite Code Gate

**Date:** 2026-03-14
**Branch:** austin/boothRating (or new branch as needed)

## Problem

Students are currently required to enter a fair invite code before they can browse booths at a live career fair. This is unnecessary friction — students should be able to freely browse available fairs, pick one that's live, and explore its booths without any access code.

## Decision Summary

- Students browse fairs freely via the EventList, click into a live fair, and see its booths
- New route `/fairs/:fairId/booths` with a dedicated `StudentFairBoothsPage` component
- Remove the student-side invite code gate from `Booths.tsx` and `BoothView.tsx`
- Company-side invite code flow (`POST /api/fairs/join` for booth registration) is unchanged
- No backend changes required

## Student Flow (New)

1. Student lands on Dashboard
2. EventList shows all scheduled fairs (upcoming + live, not ended) with status chips
3. Student clicks a live fair → navigates to `/fairs/:fairId/booths`
4. `StudentFairBoothsPage` loads and displays that fair's registered booths
5. Upcoming fairs are visible but not clickable (shows schedule info only)
6. Ended fairs are filtered out of EventList (existing behavior). If a student navigates to an ended fair via a stale URL, the page shows "This fair has ended."

## Components & Routing

### New: `StudentFairBoothsPage.tsx`

Located at `frontend/src/pages/StudentFairBoothsPage.tsx`.

(The existing `FairBoothsPage.tsx` is admin-only, used at `/admin/fairs/:fairId`. The new file is named distinctly to avoid confusion.)

Responsibilities:
- Read `fairId` from URL params via `useParams()`
- Fetch `fairSchedules/:fairId` doc → get `name`, `description`, `startTime`, `endTime`, `registeredBoothIds`
- Validate fair is currently live (`startTime <= now <= endTime`). If not:
  - Upcoming: show "This fair isn't live yet — starts at [time]"
  - Ended: show "This fair has ended"
- If `registeredBoothIds` is empty for a live fair, show "No companies have registered for this fair yet."
- Fetch booth docs for each ID in `registeredBoothIds`
- Map company data (boothId → companyId) via companies collection
- Fetch job counts per company
- Render: header with fair name + back nav, stats bar (booth count, job count), booth card grid
- Booth card layout reuses the same design currently in `Booths.tsx` (logo, name, industry, description, location, company size, job count, "Visit Booth" button)
- **Authentication:** Not required. The page works for both logged-in and unauthenticated users, same as the current `/booths` page. Firestore security rules already permit public reads on `fairSchedules`, `booths`, and `companies`.

### Routing (`App.tsx`)

Add:
```tsx
import StudentFairBoothsPage from "./pages/StudentFairBoothsPage"
// ...
<Route path="/fairs/:fairId/booths" element={<StudentFairBoothsPage />} />
```

Keep `/booths` as-is for company users. When a student navigates directly to `/booths` (via bookmark or external link), existing behavior is preserved — the page still loads booths for the active live fair (if any) without an invite code gate.

### EventList Changes

- **Students:** Each fair card becomes clickable. Live fairs navigate to `/fairs/:fairId/booths`. Upcoming fairs show status but are not clickable (visual disabled state).
- **Company users:** Behavior unchanged. "Join a Fair" button and non-clickable cards remain.
- **Implementation:** Add `useNavigate` import from `react-router-dom` (not currently imported). Wrap each card in a clickable container (or add a "Browse Booths" button) conditioned on `!isCompanyUser && status?.type === "active"`. Use `navigate(`/fairs/${schedule.id}/booths`)`.

### Dashboard Changes

- **Student "Browse Company Booths" card** (Dashboard.tsx ~lines 748-817): This card currently contains both a "View All Booths" button and a "View Booth History" button, plus `isLive`-dependent description text (lines 768-770). Changes:
  - Remove the "View All Booths" button (line 775-796)
  - Remove the `isLive`-dependent description text ("Explore opportunities..." / "The career fair is not currently live...") — replace with static text like "View your booth visit history"
  - Keep the "View Booth History" button. Relabel the card as "Booth History"
  - Remove `isLive` gating on the booth history button (it's currently disabled when `!isLive`, line 801 — it should always be enabled)

### Booths.tsx Cleanup

Remove:
- `inviteDialogOpen`, `inviteCodeInput`, `inviteCodeError`, `activeScheduleInviteCode` state variables
- `checkAndHandleInviteCode()` function
- `handleJoinFairWithCode()` function
- The invite code `<Dialog>` component
- Related imports (`Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `TextField` if no longer used)

Keep:
- All company user booth fetching logic
- The page continues serving company users viewing their own booth when fair isn't live
- The page still works for direct `/booths` navigation (shows booths if fair is live, or own booth if company user)

### BoothView.tsx Cleanup

Remove the student-side invite code gate:
- Remove `hasInviteCodeAccess()` function (lines ~327-335)
- Remove the call to `hasInviteCodeAccess(status)` in `fetchBooth()` (lines ~354-357) and the error message "This fair requires an invite code..."
- The `evaluateFairStatus()` call and `isLive` check remain (they're used for other access control logic unrelated to invite codes)

**Keep untouched:** The company-side "Join a Career Fair" card (lines ~613-654) stays as-is. It allows company users to register their booth via invite code — this is not part of the student gate removal.

## Data & Backend

**No backend changes.** All data already exists in Firestore:
- `fairSchedules/:fairId` → `name`, `description`, `startTime`, `endTime`, `registeredBoothIds`, `inviteCode`
- `booths/:boothId` → booth data
- `companies/:companyId` → company data with `boothId` mapping

The `inviteCode` field remains on `fairSchedules` — still used by the company-side `POST /api/fairs/join` endpoint.

The `requiresInviteCode` field in `evaluateFairStatus()` return type becomes fully unused on the frontend after both the `Booths.tsx` and `BoothView.tsx` cleanups (those were the only two consumers). Leave it in place to avoid breaking the type contract — it's harmless and the backend/utility may still reference it.

Firestore security rules already permit unauthenticated/student reads on `fairSchedules`, `booths`, and `companies` — no rule changes needed.

## Testing

### New Tests: `StudentFairBoothsPage.test.tsx`
- Renders booths for a live fair (mocks Firestore docs)
- Shows "not live yet" message for upcoming fairs
- Shows "fair has ended" message for past fairs
- Handles missing/invalid `fairId` gracefully
- Shows "no companies registered" when `registeredBoothIds` is empty for a live fair
- Displays correct fair name, description, booth count

### Updated Tests: `Dashboard.test.tsx`
- Update student section tests to reflect removed "View All Booths" button and retained "View Booth History" button

### Updated Tests: `BoothView.test.tsx`
- Remove or update any tests asserting invite code access gate behavior

### New/Updated Tests: `EventList.test.tsx` (if exists, or add)
- Student clicks live fair card → navigates to `/fairs/:fairId/booths`
- Upcoming fair card is not clickable for students
- Company user cards remain non-clickable (unchanged)

### Booths.test.tsx
- No invite code tests currently exist in this file, so no removals needed. Update any tests that reference invite code state if present after cleanup.

### No Backend Test Changes
- `fairJoin.test.js` and `inviteCode.test.js` stay as-is
