# Ghost Mode — Networking Lounge Opt-Out

## Summary

Allow students to hide their profile from the Networking Lounge Attendees list while still participating in the group chat. Persistent per-user setting, toggled from inside the Networking Lounge.

## Motivation

Students who enter a fair are currently listed in the Networking Lounge Attendees tab without any way to opt out. Some students want to browse booths and participate in chat without exposing their profile (name, major, skills, LinkedIn) to every other attendee. Ghost Mode gives them that control.

## Scope

**In scope:**
- A persistent `ghostMode` flag on the user document
- Filtering ghosted users out of the lounge attendees endpoint
- A toggle UI inside the Networking Lounge (top of Attendees tab)

**Out of scope:**
- Hiding ghosted users from the Stream group chat member list or chat messages
- Real-time propagation of ghost state to users already viewing the Attendees tab
- Per-fair ghost settings (Ghost Mode is global per user)
- Hiding ghosted users from recruiters in booths

## Data Model

Add a single field to each user document in Firestore (`users/{uid}`):

```
ghostMode: boolean  // default false
```

No migration is required. Reads treat missing `ghostMode` as `false`.

## Backend

### Modified endpoint: `GET /api/fairs/:fairId/lounge/attendees`

Location: [backend/routes/fairs.js](../../../backend/routes/fairs.js)

After fetching attendee user documents, filter out any where `ghostMode === true`. The requesting user is already self-excluded in current behavior; ghosted users who are themselves viewing the Attendees tab should still see the non-ghosted list (no change needed for self).

### New endpoint: `PATCH /api/users/me/ghost-mode`

- Auth: required (Firebase ID token via existing `verifyAuth` middleware)
- Body: `{ "ghostMode": boolean }`
- Effect: updates `ghostMode` on the authenticated user's Firestore document
- Response: `{ "ghostMode": boolean }` reflecting the new value
- Validation: reject non-boolean values with 400

## Frontend

### Networking Lounge page

Location: [frontend/src/pages/NetworkingLounge.tsx](../../../frontend/src/pages/NetworkingLounge.tsx)

- Add a `MUI Switch` labeled **"Ghost Mode — hide my profile from other attendees"** at the top of the Attendees tab panel (above the grid, below the tab bar)
- Initial value: fetched from the user's profile (`authUtils.getCurrentUser()` already loads the user doc — extend it if `ghostMode` is not yet included, or fetch once on mount)
- On toggle: call `PATCH /api/users/me/ghost-mode` with the new value
- Optimistic update: flip the switch immediately; revert on error
- No re-fetch of the attendees list is necessary — the current session's cached list stays as-is, and subsequent visitors get the filtered result

### Visibility

The toggle only appears on the Attendees tab. Group Chat tab is unchanged.

## Error Handling

- Backend endpoint validation errors return 400 with `{ error: string }`
- Frontend: on PATCH failure, revert the switch and show an MUI `Snackbar` / inline error
- Missing `ghostMode` field on read: treat as `false`

## Testing

**Backend** ([backend/__tests__/lounge.test.js](../../../backend/__tests__/lounge.test.js) + new test for the new endpoint):
- Attendees endpoint excludes users with `ghostMode: true`
- Attendees endpoint includes users with `ghostMode: false` or missing
- `PATCH /api/users/me/ghost-mode` updates the field
- `PATCH /api/users/me/ghost-mode` rejects non-boolean body with 400
- `PATCH /api/users/me/ghost-mode` requires auth

**Frontend** ([frontend/src/pages/__tests__/NetworkingLounge.test.tsx](../../../frontend/src/pages/__tests__/NetworkingLounge.test.tsx)):
- Toggle renders on the Attendees tab with initial value from user profile
- Clicking the toggle calls the PATCH endpoint with the inverted value
- On PATCH failure, the toggle reverts

## Open Questions

None — all decisions captured above.
