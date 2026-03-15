# Student Fair Browsing — Remove Invite Code Gate

**Date:** 2026-03-14
**Branch:** austin/boothRating (or new branch as needed)

## Problem

Students are currently required to enter a fair invite code before they can browse booths at a live career fair. This is unnecessary friction — students should be able to freely browse available fairs, pick one that's live, and explore its booths without any access code.

## Decision Summary

- Students browse fairs freely via the EventList, click into a live fair, and see its booths
- New route `/fairs/:fairId/booths` with a dedicated `FairBoothsPage` component
- Remove the student-side invite code gate from `Booths.tsx`
- Company-side invite code flow (`POST /api/fairs/join` for booth registration) is unchanged
- No backend changes required

## Student Flow (New)

1. Student lands on Dashboard
2. EventList shows all scheduled fairs (upcoming + live) with status chips
3. Student clicks a live fair → navigates to `/fairs/:fairId/booths`
4. `FairBoothsPage` loads and displays that fair's registered booths
5. Upcoming fairs are visible but not clickable (shows schedule info only)

## Components & Routing

### New: `FairBoothsPage.tsx`

Located at `frontend/src/pages/FairBoothsPage.tsx`.

Note: There is an existing `FairBoothsPage.tsx` used by admins at `/admin/fairs/:fairId`. The new student-facing page should either:
- Be named differently (e.g., `StudentFairBoothsPage.tsx`) to avoid confusion, OR
- Replace the route path to be distinct (the admin page is at `/admin/fairs/:fairId`, so `/fairs/:fairId/booths` is already distinct)

**Recommended:** Name the new file `StudentFairBoothsPage.tsx` for clarity.

Responsibilities:
- Read `fairId` from URL params via `useParams()`
- Fetch `fairSchedules/:fairId` doc → get `name`, `description`, `startTime`, `endTime`, `registeredBoothIds`
- Validate fair is currently live (`startTime <= now <= endTime`). If not:
  - Upcoming: show "This fair isn't live yet — starts at [time]"
  - Ended: show "This fair has ended"
- Fetch booth docs for each ID in `registeredBoothIds`
- Map company data (boothId → companyId) via companies collection
- Fetch job counts per company
- Render: header with fair name + back nav, stats bar (booth count, job count), booth card grid
- Booth card layout reuses the same design currently in `Booths.tsx` (logo, name, industry, description, location, company size, job count, "Visit Booth" button)

### Routing (`App.tsx`)

Add:
```tsx
<Route path="/fairs/:fairId/booths" element={<StudentFairBoothsPage />} />
```

Keep `/booths` as-is for company users and backward compatibility.

### EventList Changes

- **Students:** Each fair card becomes clickable. Live fairs navigate to `/fairs/:fairId/booths`. Upcoming fairs show status but are not clickable (visual disabled state).
- **Company users:** Behavior unchanged. "Join a Fair" button and non-clickable cards remain.
- Implementation: wrap each card in a clickable container (or add a "Browse Booths" button) conditioned on `!isCompanyUser && status?.type === "active"`. Use `useNavigate()` to go to `/fairs/${schedule.id}/booths`.

### Dashboard Changes

- **Student "Browse Company Booths" card:** Remove the `/booths` link and the `isLive` gating. Either:
  - Remove the card entirely (EventList is now the primary entry point), OR
  - Relabel to "Browse Career Fairs" and scroll/link to the EventList section
- **Recommended:** Remove the card. The EventList already appears on the Dashboard and is the natural entry point.
- Remove the `isLive`-dependent messaging in the student section that references "the career fair" (singular).

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

## Data & Backend

**No backend changes.** All data already exists in Firestore:
- `fairSchedules/:fairId` → `name`, `description`, `startTime`, `endTime`, `registeredBoothIds`, `inviteCode`
- `booths/:boothId` → booth data
- `companies/:companyId` → company data with `boothId` mapping

The `inviteCode` field remains on `fairSchedules` — still used by the company-side `POST /api/fairs/join` endpoint.

The `requiresInviteCode` field in `evaluateFairStatus()` return type becomes unused on the student path. Leave it in place to avoid breaking other references.

## Testing

### New Tests: `StudentFairBoothsPage.test.tsx`
- Renders booths for a live fair (mocks Firestore docs)
- Shows "not live yet" message for upcoming fairs
- Shows "fair has ended" message for past fairs
- Handles missing/invalid `fairId` gracefully
- Displays correct fair name, description, booth count

### Updated Tests: `Booths.test.tsx`
- Remove tests asserting invite code dialog behavior for students

### Updated Tests: `Dashboard.test.tsx`
- Update student section tests to reflect removed "Browse Company Booths" card (or changed behavior)

### Updated Tests: `EventList.test.tsx` (if exists, or add)
- Student clicks live fair card → navigates to `/fairs/:fairId/booths`
- Upcoming fair card is not clickable for students
- Company user cards remain non-clickable (unchanged)

### No Backend Test Changes
- `fairJoin.test.js` and `inviteCode.test.js` stay as-is
