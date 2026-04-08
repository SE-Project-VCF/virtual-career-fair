# Video Chat Feature - Implementation Guide

## Overview

This guide walks you through the video chat implementation for both 1v1 calls and Q&A sessions. All the code is ready to go!

## What's Been Built

### Backend (server.js)
- ✅ Shortlist management endpoints
- ✅ 1v1 call scheduling & management
- ✅ Q&A session creation & management
- ✅ Presentation mode toggle
- ✅ Raise hand functionality

### Frontend Components

**Core Video Components:**
- `VideoRoom.tsx` - Jitsi Meet embeds
- `useJitsiControl.ts` - Jitsi control hooks

**1v1 Call Components:**
- `CallRoom.tsx` - Combined video + chat for 1v1 calls
- `ShortlistManager.tsx` - Add/remove students from shortlist
- `ScheduleCallDialog.tsx` - Schedule 1v1 calls with time slots
- `CallInvitationsList.tsx` - Student-facing invitation list

**Q&A Session Components:**
- `QASessionRoom.tsx` - Video room with presentation controls
- `CreateQASessionDialog.tsx` - Create new Q&A sessions
- `BrowseQASessionsPage.tsx` - Browse and join active sessions

**Utilities:**
- `videoChatApi.ts` - Centralized API call utilities

---

## Setup Steps

### Step 1: Verify Backend Endpoints

The backend endpoints were added to `backend/server.js`. Verify they're there:

```bash
# Search for the "SHORTLIST MANAGEMENT" comment in server.js
# Should see these endpoints:
# - POST /api/shortlist/add
# - GET /api/shortlist/list
# - DELETE /api/shortlist/:studentId
# - POST /api/calls/schedule-1v1
# - GET /api/calls/my-scheduled
# - GET /api/calls/my-invitations
# - PATCH /api/calls/:callId/respond
# - GET /api/calls/:callId/join
# - PATCH /api/calls/:callId/cancel
# - POST /api/sessions/create-qa
# - GET /api/sessions/active/:fairId
# - POST /api/sessions/:sessionId/join
# - PATCH /api/sessions/:sessionId/toggle-mode
# - POST /api/sessions/:sessionId/raise-hand
# - POST /api/sessions/:sessionId/lower-hand
```

### Step 2: Update Firestore Security Rules

Add these rules to your `firestore.rules`:

```firestore
// Employers' shortlist
match /employers/{empId}/candidates/{studentId} {
  allow read, write: if request.auth.uid == empId;
}

// Employers' scheduled calls
match /employers/{empId}/scheduled_calls/{callId} {
  allow read, write: if request.auth.uid == empId;
}

// Students' call invitations
match /students/{studentId}/call_invitations/{inviteId} {
  allow read, write: if request.auth.uid == studentId;
}

// Q&A Sessions (public read during fair, write by employer)
match /video_sessions/{sessionId} {
  allow read: if true; // Students can browse
  allow write: if request.auth.uid == resource.data.employerId;
  allow create: if request.auth.uid != null; // Anyone can create (set owner server-side)
}
```

### Step 3: Firestore Collections Setup

The backend will automatically create these collections when needed, but here's the structure to expect:

```
firestore/
├── employers/
│   └── {empId}/
│       ├── candidates/
│       │   └── {studentId}/
│       │       ├── addedAt: timestamp
│       │       ├── notes: string
│       │       ├── studentName: string
│       │       └── studentEmail: string
│       └── scheduled_calls/
│           └── {callId}/
│               ├── callId: string
│               ├── studentId: string
│               ├── status: "pending" | "accepted" | "declined" | "completed"
│               ├── proposedTimes: array
│               ├── jitsiRoom: string
│               ├── streamChatChannelId: string
│               └── ...
│
├── students/
│   └── {studentId}/
│       └── call_invitations/
│           └── {inviteId}/
│               ├── empId: string
│               ├── callId: string
│               ├── status: "pending" | "accepted" | "declined"
│               ├── proposedTimes: array
│               └── ...
│
└── video_sessions/
    └── {sessionId}/
        ├── fairId: string
        ├── employerId: string
        ├── title: string
        ├── isPresentationMode: boolean
        ├── isLive: boolean
        ├── attendees: map
        ├── raisedHands: array
        ├── jitsiRoom: string
        ├── streamChatChannelId: string
        └── ...
```

### Step 4: Create Routes/Pages

Create two new pages to integrate the components. Add them to your routing:

**For Employers - `/dashboard/video-calls`:**

```tsx
import { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import {
  ShortlistManager,
  ScheduleCallDialog,
  CreateQASessionDialog,
} from '@/components/videoChat';
import { schedulCall, createQASession } from '@/utils/videoChatApi';

export function EmployerVideoCallsDashboard() {
  const [tab, setTab] = useState(0);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [qaDialogOpen, setQADialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{
    studentId: string;
    studentName: string;
  } | null>(null);
  const [selectedFair, setSelectedFair] = useState<{ fairId: string; fairName: string } | null>(null);

  const handleScheduleCall = (studentId: string, studentName: string) => {
    setSelectedStudent({ studentId, studentName });
    setScheduleDialogOpen(true);
  };

  const handleCreateQA = () => {
    // TODO: Get current fair context
    setQADialogOpen(true);
  };

  return (
    <Box>
      <Tabs value={tab} onChange={(_, newTab) => setTab(newTab)}>
        <Tab label="My Shortlist" />
        <Tab label="Scheduled Calls" />
        <Tab label="Q&A Sessions" />
      </Tabs>

      {tab === 0 && (
        <ShortlistManager onScheduleCall={handleScheduleCall} />
      )}

      {tab === 1 && (
        <div>TODO: List of scheduled calls</div>
      )}

      {tab === 2 && (
        <div>TODO: List of Q&A sessions</div>
      )}

      <ScheduleCallDialog
        open={scheduleDialogOpen}
        studentId={selectedStudent?.studentId}
        studentName={selectedStudent?.studentName}
        onClose={() => {
          setScheduleDialogOpen(false);
          setSelectedStudent(null);
        }}
        onSchedule={async (data) => {
          await schedulCall(data.studentId, data.proposedTimes, data.notes);
          alert('Call invitation sent!');
        }}
      />

      <CreateQASessionDialog
        open={qaDialogOpen}
        fairId={selectedFair?.fairId}
        fairName={selectedFair?.fairName}
        onClose={() => setQADialogOpen(false)}
        onCreateSession={async (data) => {
          await createQASession(
            data.fairId,
            data.title,
            data.description,
            data.scheduledTime,
            data.maxDuration
          );
          alert('Q&A session created!');
        }}
      />
    </Box>
  );
}
```

**For Students - `/fair/{fairId}/video-calls`:**

```tsx
import { useParams } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import {
  CallInvitationsList,
  BrowseQASessionsPage,
  CallRoom,
  QASessionRoom,
} from '@/components/videoChat';
import { useState } from 'react';

export function StudentVideoCallsPage() {
  const { fairId } = useParams<{ fairId: string }>();
  const [tab, setTab] = useState(0);
  const [activeCall, setActiveCall] = useState<{
    type: '1v1' | 'qa';
    callId: string;
    jitsiRoom: string;
    channelId: string;
  } | null>(null);

  if (activeCall) {
    if (activeCall.type === '1v1') {
      return (
        <CallRoom
          callId={activeCall.callId}
          jitsiRoom={activeCall.jitsiRoom}
          streamChannelId={activeCall.channelId}
          userName="Student Name" // TODO: Get from auth
          onError={(err) => console.error(err)}
        />
      );
    } else {
      return (
        <QASessionRoom
          sessionId={activeCall.callId}
          jitsiRoom={activeCall.jitsiRoom}
          streamChannelId={activeCall.channelId}
          userName="Student Name" // TODO: Get from auth
          isEmployer={false}
          onError={(err) => console.error(err)}
        />
      );
    }
  }

  return (
    <Box>
      <Tabs value={tab} onChange={(_, newTab) => setTab(newTab)}>
        <Tab label="My Invitations" />
        <Tab label="Browse Sessions" />
      </Tabs>

      {tab === 0 && (
        <CallInvitationsList
          onJoinCall={(callId, jitsiRoom, channelId) => {
            setActiveCall({
              type: '1v1',
              callId,
              jitsiRoom,
              channelId,
            });
          }}
        />
      )}

      {tab === 1 && fairId && (
        <BrowseQASessionsPage
          fairId={fairId}
          onJoinSession={(sessionId, jitsiRoom, channelId) => {
            setActiveCall({
              type: 'qa',
              callId: sessionId,
              jitsiRoom,
              channelId,
            });
          }}
        />
      )}
    </Box>
  );
}
```

### Step 5: Test Everything

**Manual Testing Checklist:**

- [ ] Backend server starts without errors
- [ ] Employer can add students to shortlist
- [ ] Employer can schedule 1v1 call with multiple time slots
- [ ] Student receives invitation
- [ ] Student can accept/decline invitation
- [ ] Video room loads (Jitsi)
- [ ] Chat works (StreamChat)
- [ ] Employer can create Q&A session
- [ ] Q&A session shows up in browse list
- [ ] Students can join Q&A
- [ ] Presentation mode toggle works
- [ ] Students can raise/lower hand
- [ ] Chat persists after calls end

### Step 6: Fix Any Issues

Common issues:

**"STREAM_API_KEY not defined"**
- Make sure you have `STREAM_API_KEY` and `STREAM_API_SECRET` in your `.env`

**Jitsi not loading**
- Check browser console for CORS errors
- Verify `https://meet.jit.si/external_api.js` loads

**Chat not working**
- Verify Stream Chat token endpoint works
- Check StreamChat channel creation in endpoints

**Firestore permissions denied**
- Update firestore.rules as shown in Step 2
- Redeploy rules: `firebase deploy --only firestore:rules`

---

## Architecture Summary

```
USER FLOW:

Employer:
1. Add student to shortlist
2. Schedule 1v1 call with time slots
3. Student gets invitation, accepts, and joins
4. Video room loads with Jitsi + StreamChat
5. Chat persists after call

OR:

Employer:
1. Create Q&A session for fair
2. Session goes live
3. Students browse and join
4. Initially in presentation mode (all muted)
5. Employer toggles to Q&A mode
6. Students can raise hand to speak
7. Chat available throughout
```

---

## Next Steps

1. **Create the dashboard pages** as shown in Step 4
2. **Add navigation links** to the video call features
3. **Implement look-up endpoint** to find students by email (for adding to shortlist)
4. **Add notifications** when invitations arrive (FCM)
5. **Add call history** tracking
6. **Add recording** option for Q&A sessions
7. **Analytics** - track who attended what

---

## File Locations

All new files are in:
```
frontend/src/components/videoChat/
├── VideoRoom.tsx
├── useJitsiControl.ts
├── CallRoom.tsx
├── QASessionRoom.tsx
├── ShortlistManager.tsx
├── ScheduleCallDialog.tsx
├── CallInvitationsList.tsx
├── CreateQASessionDialog.tsx
├── BrowseQASessionsPage.tsx
└── index.ts

frontend/src/utils/
└── videoChatApi.ts
```

Backend: `backend/server.js` (endpoints added at end of file)

---

## Support

If you encounter any issues:
1. Check browser console for errors
2. Check backend server logs
3. Verify Firestore rules are applied
4. Make sure environment variables are set
5. Test API endpoints with curl/Postman
