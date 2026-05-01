# Booth Rating Visibility for Owners and Reps

**Status:** Draft
**Date:** 2026-05-01
**Branch:** `austin/boothRatingFix`

## Problem

Company owners and representatives cannot see the ratings or reviews students leave on their booths. Two bugs combine to break this:

1. **Backend authorization is broken for multi-booth companies.** `GET /api/booths/:boothId/ratings` ([backend/routes/booths.js:602-643](../../../backend/routes/booths.js#L602-L643)) gates non-admin access by checking `companyDoc.data().boothId !== boothId` — the legacy single-booth field. After PR #59 (`austin/multiBooth`) introduced multi-booth companies, booths reference `companyId` and a company can have many booths. The legacy check rejects every booth that isn't the legacy one.

2. **Frontend only renders the legacy single booth.** [Company.tsx:1916-1919](../../../frontend/src/pages/Company.tsx#L1916-L1919) renders `<BoothReviewsSection boothId={company.boothId} />` only when `company.boothId` is set, and passes a single id. Companies with multi-booth setups see no review section at all.

Reviews also do not record which fair the student left them from, so even when authorization is fixed there is no fair context to display alongside the review.

## Goals

- Owners and representatives of a company can see ratings and reviews for **every** booth their company owns, on the Company page.
- Each review is attributed to the fair the student submitted it from, when known.
- Reviews are grouped by booth, then sub-grouped by fair within each booth.
- Existing reviews (no `fairId`) continue to display, in an "Other" group.

## Non-goals

- Allowing one rating per student *per fair* (still one rating per student per booth — re-rating from a different fair overwrites and changes the fair attribution).
- Backfilling `fairId` onto existing rating documents.
- Notifying owners or reps when new reviews arrive.
- Any change to the admin-side `FairBoothsPage`.
- Any change to the student-facing rating submission UI other than including `fairId` in the request.

## Architecture

```
Student submits rating from FairBoothView
        │
        ▼  POST /api/booths/:boothId/ratings  { rating, comment, fairId }
   booths.js handler validates fairId (must exist), persists to
   booths/{boothId}/ratings/{studentId}: { studentId, rating, comment, createdAt, fairId }

Owner/Rep loads Company page
        │
        ▼  GET /api/booths?companyId=X  → list of booths
        ▼  GET /api/booths/:boothId/ratings (one per booth)
   booths.js handler authorizes via checkCompanyAuthorization(boothData.companyId, userId)
   Backend collects unique non-null fairIds, batch-fetches fair docs, returns reviews
   each annotated with fairId, fairName, fairStartTime
        │
        ▼ BoothReviewsSection groups reviews by fair (sorted by fair.startTime desc;
          "Other" bucket last) and renders one accordion per booth.
```

## Backend changes

### 1. Authorization fix — `GET /api/booths/:boothId/ratings`

In [backend/routes/booths.js:610-621](../../../backend/routes/booths.js#L610-L621), replace the legacy boothId check with `checkCompanyAuthorization` from [backend/helpers.js:172](../../../backend/helpers.js#L172):

```js
const adminErr = await verifyAdmin(userId);
if (adminErr) {
  const boothData = boothDoc.data();
  if (!boothData.companyId) return res.status(403).json({ error: "Unauthorized" });
  const auth = await checkCompanyAuthorization(boothData.companyId, userId);
  if (!auth.authorized) return res.status(403).json({ error: "Unauthorized" });
}
```

The helper grants both owner (`ownerId === userId`) and representative (`representativeIDs.includes(userId)`).

### 2. Capture `fairId` on submit — `POST /api/booths/:boothId/ratings`

In [backend/routes/booths.js:540-569](../../../backend/routes/booths.js#L540-L569):

- Read optional `fairId` from `req.body`.
- Validation:
  - If present, must be a non-empty string.
  - If present, the fair must exist (`fairs/{fairId}.exists`). On invalid id, return `400 { error: "Invalid fairId" }`.
  - If absent, store `fairId: null`.
- Persist alongside existing fields:
  ```js
  await db.collection("booths").doc(boothId).collection("ratings").doc(studentId).set({
    studentId,
    rating,
    comment: comment?.trim() || null,
    createdAt: admin.firestore.Timestamp.now(),
    fairId: fairId || null,
  });
  ```

The single-doc-per-student keying is unchanged — re-submitting from a different fair overwrites and replaces the `fairId`.

### 3. Return fair attribution on read

`GET /api/booths/:boothId/ratings` ([booths.js:602](../../../backend/routes/booths.js#L602)) and `GET /api/booths/:boothId/ratings/me` ([booths.js:575](../../../backend/routes/booths.js#L575)) include `fairId`, `fairName`, and `fairStartTime` (ms epoch, nullable) per review.

Implementation for the list endpoint:

1. Fetch the ratings subcollection.
2. Collect the unique non-null `fairId`s from the docs.
3. Batch-fetch fair docs: `db.getAll(...fairRefs)`. Build a `{ [fairId]: { name, startTime } }` map.
4. Annotate each review with `fairId, fairName, fairStartTime` (null when missing or fair was deleted).

For `/ratings/me`, just resolve the single fair if present.

Reviews missing `fairId` (legacy docs) return `fairId: null, fairName: null, fairStartTime: null`.

### 4. Helper: company authorization

`checkCompanyAuthorization` is reused as-is from [backend/helpers.js:172](../../../backend/helpers.js#L172). No new helper needed.

## Frontend changes

### 1. `submitBoothRating` — pass `fairId`

In [frontend/src/utils/boothConstants.ts:25](../../../frontend/src/utils/boothConstants.ts#L25):

- Add an optional `fairId?: string | null` parameter.
- Include `fairId` in the JSON body when truthy.

### 2. `FairBoothView.tsx` — pass the fair's id

[FairBoothView.tsx](../../../frontend/src/pages/FairBoothView.tsx) already has `fairId` from the URL. Pass it into `submitBoothRating`. The non-fair `BoothView.tsx` does not pass one.

### 3. `Company.tsx` — multi-booth review listing

Replace [Company.tsx:1916-1919](../../../frontend/src/pages/Company.tsx#L1916-L1919) with a `<BoothReviewsSection companyId={company.id} />` that:

1. Fetches the booth list via `GET /api/booths?companyId=${company.id}`.
2. For each booth, fetches `GET /api/booths/${boothId}/ratings` in parallel.
3. Renders one outer `Card` titled "Booth Reviews" with the BarChart icon, containing one `Accordion` per booth.
4. Each booth accordion summary shows: booth name (or location, fall back to id), average rating stars + numeric average, and total review count. If 0 reviews: "No reviews yet."
5. Each booth accordion details body groups reviews by `fairId`:
   - Group order: by `fairStartTime` descending; the "Other" bucket (null fairId) is last.
   - Group header: a small `Typography` divider showing `fairName` (or "Other" when null).
   - Inside each group: review rows ordered by `createdAt` descending. Each row shows stars, comment, formatted date. No "From: {fair}" line per row — the group header carries that info.
6. Loading and error states: top-level spinner while booths are loading; per-booth inline spinner while that booth's ratings are loading; non-fatal error banner per booth on failure.

The single `BoothReviewsSection` component (current implementation at [Company.tsx:750-824](../../../frontend/src/pages/Company.tsx#L750-L824)) is rewritten to take `companyId`. Its sole consumer in this file changes accordingly. The visual style (colors, BarChartIcon, border) is preserved; the layout is restructured.

### 4. Backwards compatibility

- Existing rating documents without `fairId` continue to render under the "Other" group; nothing breaks.
- The legacy `BoothView.tsx` continues to submit ratings without a `fairId` (correctly — there is no fair context).

## Testing

### Backend

In `backend/__tests__/routes/`:

- **Auth — owner**: owner of the company that owns the booth → 200, returns ratings.
- **Auth — rep**: representative of that company → 200.
- **Auth — outsider**: user from a different company → 403.
- **Auth — admin**: existing admin path still returns 200.
- **POST with valid `fairId`**: rating doc has `fairId` set; fair exists → 200.
- **POST with invalid `fairId`**: fair does not exist → 400.
- **POST without `fairId`**: rating doc has `fairId: null` → 200.
- **GET annotates fair**: response includes `fairId`, `fairName`, `fairStartTime` for ratings with a stored fairId; null for ratings without.
- **GET handles deleted fair**: rating with a `fairId` that no longer exists in `fairs/` returns `fairName: null, fairStartTime: null` (does not 500).

### Frontend

Update [Company.test.tsx](../../../frontend/src/pages/__tests__/Company.test.tsx):

- Renders one accordion per booth returned from the booths endpoint.
- Reviews inside an accordion are grouped by fair name; "Other" group appears for null-fair reviews.
- Empty-state per booth: "No reviews yet."
- Group ordering: more-recent fair appears above older fair; "Other" appears last.

Update [FairBoothView.test.tsx](../../../frontend/src/pages/__tests__/FairBoothView.test.tsx):

- `submitBoothRating` is called with the fair id from the URL.

## Rollout

- No data migration required.
- No feature flag required.
- Existing rating endpoints' shapes are additive (new fields); no breaking change for any other consumer.
