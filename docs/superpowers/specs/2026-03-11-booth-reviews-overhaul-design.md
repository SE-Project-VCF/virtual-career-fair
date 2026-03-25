# Booth Reviews Overhaul — Design Spec
**Date:** 2026-03-11

## Context

The booth ratings feature was added but has several gaps: ratings are stored in a top-level `boothRatings` collection (not co-located with booths), students cannot resubmit/update their review, admins have no way to browse reviews per fair, and reps/owners have no visibility into their booth's reviews. This overhaul restructures the data model and adds organized review views for each role.

---

## 1. Database Restructure

### boothRatings → subcollection
**Old:** `boothRatings/{ratingId}` (top-level, fields: boothId, studentId, rating, comment, companyName, createdAt)

**New:** `booths/{boothId}/ratings/{studentId}` (subcollection, studentId as doc ID)

- Using `studentId` as doc ID enforces one-per-student at the document level and makes upsert trivial
- Drop `boothId` field (redundant as parent path)
- All other fields unchanged

### boothVisitors — dual-write
When a student views a booth, write to both:
- `users/{uid}/boothHistory/{boothId}` — existing, powers student history page (unchanged)
- `booths/{boothId}/visitors/{uid}` — new, enables booth-level visitor analytics

---

## 2. Backend Changes

**Files:** `backend/server.js`

### Updated: `POST /api/booths/:boothId/ratings`
- Write to `booths/{boothId}/ratings/{studentId}` via `set()` (upsert)
- Remove 409 conflict check — overwrite is the intended behavior
- Handles both create and resubmit in one code path

### Updated: `GET /api/booths/:boothId/ratings`
- Read from `booths/{boothId}/ratings` subcollection
- Expand access: admin OR rep/owner of that booth's company (currently admin-only)
- When requester is rep/owner: omit `studentId` from each rating in the response (anonymous)
- When requester is admin: include `studentId` as normal

### New: `GET /api/booths/:boothId/ratings/me`
- Returns the authenticated student's own rating doc for this booth
- Returns `{ rating: null }` if not yet rated
- Auth: student only

### New: `GET /api/fairs/:fairId/booths`
- Fetches fair's `startTime`/`endTime` from `fairSchedules/{fairId}`
- Returns all booths + their ratings created within that time window
- Response: `{ fairName, startTime, endTime, booths: [{ boothId, companyName, averageRating, totalRatings, ratings: [{ studentId, rating, comment, createdAt }] }] }`

### Updated: `GET /api/booth-ratings/analytics`
- Switch to Firestore collection group query on subcollection name `ratings`

### Updated: `frontend/src/utils/boothHistory.ts` — `trackBoothView()`
- Add write to `booths/{boothId}/visitors/{uid}` alongside existing `users/{uid}/boothHistory/{boothId}`

---

## 3. Frontend Changes

### `AdminDashboard.tsx`
- Add "Career Fairs" section listing all `fairSchedules` as clickable rows
- Each row shows fair name + date range
- Clicking navigates to `/admin/fairs/:fairId`

### New: `frontend/src/pages/FairBoothsPage.tsx`
- Route: `/admin/fairs/:fairId` (add to `App.tsx`)
- Fetches `GET /api/fairs/:fairId/booths`
- Header: fair name + date range + back button
- Lists booths as Material-UI `Accordion` (collapsed by default)
- Expanding a booth: average rating (stars), total count, then individual reviews (stars + comment + date)

### `Company.tsx`
- Add "Booth Reviews" section (visible to companyOwner and representative)
- Only renders if company has a linked booth
- Fetches `GET /api/booths/:boothId/ratings`
- Shows: average rating + total count, then list of reviews (stars, comment, date)
- Students are shown as anonymous — no names or IDs displayed

### `BoothView.tsx`
- On load: fetch `GET /api/booths/:boothId/ratings/me` to check for an existing review
- **If student has an existing review**: display it read-only (stars + comment + date), then a "Resubmit Review" button below
- Clicking "Resubmit Review" opens a blank dialog form
- Student submits new review from dialog → upserts (overrides old), dialog closes, displayed review updates to the new one
- **If student has no existing review**: show the blank submit form directly (existing flow)
- After first submission: show the new review read-only with a "Resubmit Review" button (same state as above)

---

## 4. Routing

Add to `App.tsx`:
- `/admin/fairs/:fairId` → `FairBoothsPage` (admin only)

---

## 5. Verification

1. **DB restructure**: Submit a rating via BoothView, confirm it lands in `booths/{boothId}/ratings/{studentId}` in Firestore console
2. **Resubmit**: Submit a second rating for the same booth, confirm it overwrites (not duplicates)
3. **Admin fair view**: Navigate to `/admin`, click a fair, confirm correct booths appear with reviews filtered to that fair's time window
4. **Rep/owner reviews**: Log in as rep/owner, go to `/company/:id`, confirm "Booth Reviews" section shows ratings
5. **Student pre-populate**: After rating a booth, reload the page, confirm form is pre-populated with prior rating
6. **boothVisitors dual-write**: Visit a booth as student, confirm write appears in both `users/{uid}/boothHistory` and `booths/{boothId}/visitors`
7. **Analytics endpoint**: Confirm `GET /api/booth-ratings/analytics` still returns correct aggregates after collection group query change
8. Run existing backend tests: `cd backend && npm test`
