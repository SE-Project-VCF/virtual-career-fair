# Job Invitations System - Implementation Summary

## Overview
Representatives and company owners can now send job invitations to students via dashboard notifications or chat messages. Students can view, track, and respond to these invitations.

## Features Implemented

### 1. Notification Bell Component
- Location: `frontend/src/components/NotificationBell.tsx`
- Features:
  - Real-time notification badge showing unread invitation count
  - Dropdown menu showing the 5 most recent invitations
  - Click to navigate to full invitations page
  - Auto-refresh every 15 seconds
  - Only visible to students
  - Added to Dashboard, Booths, and BoothView pages

### 2. Backend API (backend/server.js)
- **POST `/api/job-invitations/send`** - Send invitations to students
- **GET `/api/job-invitations/received`** - Get student's received invitations
- **GET `/api/job-invitations/sent`** - Get representative's sent invitations
- **PATCH `/api/job-invitations/:id/status`** - Update invitation status (viewed/clicked)
- **GET `/api/students`** - Get list of students for invitation UI
- **GET `/api/job-invitations/stats/:jobId`** - Get invitation statistics for a job

### 2. Database Schema
**Collection: `jobInvitations`**
```javascript
{
  id: string,
  jobId: string,
  companyId: string,
  studentId: string,
  sentBy: string,
  sentVia: 'chat' | 'notification',
  status: 'sent' | 'viewed' | 'clicked',
  sentAt: Timestamp,
  viewedAt?: Timestamp,
  clickedAt?: Timestamp,
  message?: string
}
```

### 3. Frontend Components

#### JobInviteDialog Component
- Location: `frontend/src/components/JobInviteDialog.tsx`
- Features:
  - Student search and selection with checkboxes
  - Optional personal message field
  - Choice to send via Chat or Dashboard Notification
  - Shows count of selected students
  - Real-time validation

#### JobInvitations Page
- Location: `frontend/src/pages/JobInvitations.tsx`
- Route: `/dashboard/job-invitations`
- Features:
  - List of all received invitations
  - Filter by status (All, New, Viewed, Applied)
  - Shows company info, job details, and personal messages
  - "View Full Details" and "Apply Now" buttons
  - Automatic status tracking (viewed/clicked)
  - Time-relative display (e.g., "2 hours ago")

### 4. Dashboard Updates
- Location: `frontend/src/pages/Dashboard.tsx`
- Added "Job Invitations" card for students showing:
  - Total invitation count
  - Badge with new invitations count
  - Button to view all invitations
  - Auto-refresh every 30 seconds

### 5. Company Management Updates
- Location: `frontend/src/pages/Company.tsx`
- Added to each job card:
  - "Invite Students" button (send icon)
  - Invitation statistics display:
    - Total invitations sent
    - Number viewed with percentage
    - Number clicked with percentage
  - Auto-refresh stats after sending invitations

## Notification System

When invitations are sent via **Dashboard Notification**:
- A notification bell icon appears in the header for students
- Shows a red badge with the count of new invitations
- Students can click the bell to see a dropdown menu with recent invitations
- Clicking an invitation navigates to the full invitations page
- Auto-refreshes every 15 seconds to check for new invitations

When invitations are sent via **Chat**:
- A direct chat message is sent from the representative to the student
- Message includes job title, company name, and personal message
- Rich attachment shows job details and skills required
- Students receive the message in their chat inbox

## How to Use

### For Representatives/Company Owners:
1. Navigate to your company page (`/company/:id`)
2. Find the job posting you want to promote
3. Click the send icon (✉️) to invite students
4. Search/filter students by name, email, or major
5. Select students using checkboxes
6. Optionally add a personal message
7. Choose to send via "Dashboard Notification" or "Chat Message"
8. Click "Send" to dispatch invitations
9. View invitation statistics below the job card

### For Students:
1. See new invitations badge on Dashboard
2. Click "View Invitations" to see all invitations
3. Filter by status: All, New, Viewed, or Applied
4. Read job details and personal messages from representatives
5. Click "View Full Details" to see complete job posting
6. Click "Apply Now" to visit the application link
7. Status automatically updates as you interact with invitations

## Chat Integration
When sending invitations via chat:
- A direct message is sent from the representative to each student
- Message includes job title, company name, and personal message
- Includes a rich attachment with job details
- Students can click links in the message to view full invitation

## Authorization & Security
- Only representatives and company owners can send invitations
- Representatives can only invite students for their own company's jobs
- Students can only view their own invitations
- All endpoints validate user permissions
- Status updates require ownership verification

## Tracking & Analytics
Representatives can track for each job:
- **Total Sent**: Number of invitations sent
- **Total Viewed**: Number of students who viewed the invitation
- **Total Clicked**: Number of students who clicked "Apply Now"
- **View Rate**: Percentage of students who viewed
- **Click Rate**: Percentage of students who clicked to apply

## Status Flow
1. **sent** - Invitation created, student hasn't seen it yet
2. **viewed** - Student opened and viewed the invitation details
3. **clicked** - Student clicked "Apply Now" to go to application link

## Routes Added
- `/dashboard/job-invitations` - Student job invitations page

## API Endpoints Summary
All endpoints require authentication and validate user permissions.

### Send Invitations
```
POST /api/job-invitations/send
Body: { jobId, studentIds[], message?, sentVia, userId }
```

### Get Received Invitations
```
GET /api/job-invitations/received?userId=<studentId>&status=<optional>
```

### Get Sent Invitations
```
GET /api/job-invitations/sent?userId=<repId>&companyId=<companyId>
```

### Update Status
```
PATCH /api/job-invitations/:id/status
Body: { status: 'viewed' | 'clicked', userId }
```

### Get Students List
```
GET /api/students?userId=<repId>&search=<optional>&major=<optional>
```

### Get Job Stats
```
GET /api/job-invitations/stats/:jobId?userId=<repId>
```

## Future Enhancements
- Email notifications for new invitations
- Bulk actions (mark all as read, archive, etc.)
- Advanced filtering (by company, date range, etc.)
- Invitation templates for common messages
- Scheduled invitations
- Invitation history and audit log

## Testing Recommendations
1. Test sending invitations as both representative and company owner
2. Verify students receive invitations in dashboard
3. Test chat message delivery
4. Verify status tracking (sent → viewed → clicked)
5. Test permission checks (students shouldn't send, reps only for their company)
6. Test edge cases (deleted jobs, deleted users)
7. Verify statistics accuracy
