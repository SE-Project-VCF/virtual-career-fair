# Booth-Linked Q&A Sessions Implementation Guide

## Overview
Q&A sessions are now redesigned to be **linked to specific booths within specific fairs** instead of being standalone. This allows employers to schedule sessions for their booth viewers.

## Fixed Issues
✅ **Auth Token Error** - Fixed `user.getIdToken is not a function` by using `authUtils.getIdToken()`
✅ **Frontend Components** - All videoChat components now use correct auth method

## Architecture Changes Needed

### 1. Data Model Updates

**Booth Schema (Firestore)**
Add these fields to booth documents:

```typescript
{
  // ... existing booth fields ...
  
  // Q&A Session linked to this booth
  qaSession?: {
    sessionId: string;
    title: string;
    description?: string;
    scheduledTime: timestamp;  // When session starts
    duration: number;           // Minutes
    isPresentationMode: boolean;
    isLive: boolean;
    participants: string[];     // User IDs
    joinLink?: string;
    createdAt: timestamp;
  }
}
```

### 2. Backend Changes Required

**New/Modified Endpoints:**

```
1. POST /api/booth/:boothId/schedule-qa-session
   - Create or update Q&A session for a booth
   - Only allowed for booth owner/employer
   
2. GET /api/booth/:boothId/qa-session
   - Get Q&A session details for a booth
   - Available to all users
   
3. PATCH /api/booth/:boothId/qa-session/:sessionId/join
   - Student joins the Q&A session
   - Returns Jitsi room info only if within 15 mins of start time
   
4. DELETE /api/booth/:boothId/qa-session
   - Cancel session (employer only)
```

### 3. Frontend UI Changes

#### Booth Editor (BoothEditor.tsx)
Add new section to edit booth:

```
📹 Q&A Session
  [ ] Enable Q&A Session
  Title: [____________]
  Description: [________________]
  Scheduled Date/Time: [____]
  Duration: [__] minutes
  [Save]
```

#### Booth View (BoothView.tsx)
Add session display when viewing a booth:

```
If Q&A session scheduled:
┌─────────────────────────────┐
│ 📹 Scheduled Q&A Session     │
│                              │
│ Title: [Session Name]        │
│ Time: March 30, 3:00 PM      │
│ Duration: 60 minutes         │
│                              │
│ Status: Coming up in 12 mins  │
│ [JOIN NOW] (only if <15 mins) │
└─────────────────────────────┘
```

**Join Button Logic:**
```typescript
const timeUntilSession = scheduledTime - now;
const canJoin = timeUntilSession <= 15 * 60 * 1000; // 15 minutes in ms

<Button 
  onClick={joinSession}
  disabled={!canJoin}
>
  {timeUntilSession > 0 ? 'JOIN' : 'SESSION ENDED'}
</Button>
```

### 4. Database Migrations

Run migration to add `qaSession` field to booth documents:

```javascript
// migrations/add-qa-session-to-booths.js
db.collection('booths').forEach(doc => {
  doc.update({
    qaSession: null  // or existing session data if migrating
  });
});
```

### 5. Updated Directory Structure

```
frontend/src/
├── pages/
│   ├── BoothEditor.tsx (MODIFY - add Q&A session editor)
│   ├── BoothView.tsx (MODIFY - add Q&A session display with join button)
│   ├── QASessionsPage.tsx (DEPRECATED - now a guide page only)
│   └── ShortlistPage.tsx (no change needed)
├── components/
│   └── videoChat/
│       ├── QASessionRoom.tsx (no change needed)
│       ├── CallRoom.tsx (no change needed)
│       └── ... (other components unchanged)
```

### 6. Student Experience Flow

1. **Browse Booths** → See booth information
2. **Check for Q&A Session** → If scheduled, see session card
3. **Within 15 mins of start** → "JOIN NOW" button becomes enabled
4. **Click Join** → Redirected to `QASessionRoom` with Jitsi room
5. **Participate** → Video room + chat room for Q&A

### 7. Employer Experience Flow

1. **Edit Booth** → Scroll to "Q&A Session" section
2. **Enable Session** → Fill in title, description, time, duration
3. **Save** → Session linked to booth
4. **View Booth** → See session appears on your booth view
5. **During Session** → Monitor with `QASessionRoom` component

### 8. Backend Validation

For POST `/api/booth/:boothId/schedule-qa-session`:

```typescript
validations:
- scheduledTime must be in future
- duration must be > 0
- title must not be empty
- Only booth owner/company rep can create
- Only one active session per booth
```

For `POST /api/booth/:boothId/qa-session/:sessionId/join`:

```typescript
validations:
- Check if session exists and is live
- Check if now <= scheduledTime + 15 minutes
- If success: return Jitsi room details
- If timeout: return 403 "Session join window closed"
```

### 9. Testing Checklist

**Backend Tests:**
- [ ] Create session for booth (employer)
- [ ] Fetch session details (any user)
- [ ] Join session within 15 mins (student)
- [ ] Join session after 15 mins (should fail)
- [ ] Join expired session (should fail)
- [ ] Update session (employer only)
- [ ] Delete session (employer only)

**Frontend Tests:**
- [ ] Booth editor shows session form
- [ ] Session saved to Firestore
- [ ] Booth view displays session
- [ ] Join button disabled when > 15 mins away
- [ ] Join button enabled when <= 15 mins away
- [ ] Click join navigates to QASessionRoom
- [ ] Jitsi room loads correctly

### 10. Configuration Notes

**Q&A Session FAQs:**
- Each booth can have ONE active session at a time
- Sessions are booth-specific (different for each company/booth)
- Students see sessions only when viewing that booth
- Employers manage sessions from booth editor
- Sessions persist in Firestore for attendance tracking

---

## Summary

Q&A sessions are now **booth-scoped** to provide better context and structure. Students see sessions as part of the booth experience, employers manage them per booth, and access is time-gated (15-minute window from start time).

The QASessionsPage.tsx now serves as an informational guide directing employers to use booth editors to manage sessions.
