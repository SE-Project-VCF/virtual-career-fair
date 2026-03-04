# Resume Tailoring System - Implementation Guide

## Overview
This is a patch-based resume tailoring system that:
- Uses Gemini AI to suggest small, targeted improvements
- Validates patches with hallucination detection
- Lets students review and accept/reject changes
- Preserves original resume as immutable
- Saves tailored versions with full audit trail

## New Backend Files

### 1. **patchValidator.js**
Enhanced validation with confidence scoring and hallucination detection.

**Key Features:**
- Validates patch structure
- Detects fabricated metrics (numbers, dates, percentages)
- Checks skill alignment with job description
- Detects conflicting patches
- Provides confidence score (0-1) for each patch
- Flags suspicious changes with detailed concerns

**Classes & Methods:**
```javascript
new PatchValidator(originalResume, jobDescription)
  .validatePatches(patches)
  → { valid, patches[], issues[], summary }
```

### 2. **patchApplier.js**
Applies accepted patches to a structured resume.

**Key Features:**
- Applies patches sequentially
- Never mutates original resume (deep copies)
- Generates new bulletIds for inserted bullets
- Tracks applied patches with opId
- Validates beforeText matches exactly

**Classes & Methods:**
```javascript
PatchApplier.applyPatches(originalResume, acceptedPatches)
  → { success, tailoredResume, appliedCount, errors[] }

PatchApplier.summarizePatches(original, tailored, patches)
  → { totalPatches, changes, patchsByType }
```

### 3. **patchCache.js**
In-memory cache for Gemini responses during a tailoring session.

**Key Features:**
- Stores patches for 1 hour (configurable)
- Auto-cleanup of expired entries
- Per-user, per-invitation caching
- Easy to upgrade to Redis/Firestore

**Methods:**
```javascript
patchCache.setCacheEntry(uid, invitationId, patchResponse, jobContext)
patchCache.getCacheEntry(uid, invitationId)
patchCache.clearCacheEntry(uid, invitationId)
patchCache.getStats() // For debugging
```

## New Backend Endpoints

### 1. **POST /api/resume/tailor/v2**
Enhanced version of resume tailor with improved prompt and validation.

**Request:**
```json
{
  "invitationId": "job_inv_123",  // Required for caching
  "jobId": "job_456",
  "jobTitle": "Senior React Developer",
  "jobDescription": "We need a React expert...",
  "requiredSkills": "React, Node.js, PostgreSQL"
}
```

**Response:**
```json
{
  "ok": true,
  "resumeId": "resume_789",
  "invitationId": "job_inv_123",
  "patches": [
    {
      "opId": "patch_1",
      "type": "replace_bullet",
      "target": { "bulletId": "bullet_xyz", "section": "experience" },
      "beforeText": "Built web applications using React",
      "afterText": "Built scalable React web applications with 100K+ daily users",
      "confidence": 0.95,
      "concerns": []
    }
  ],
  "validation": {
    "averageConfidence": 0.87,
    "validPatches": 5,
    "errorCount": 0,
    "warningCount": 1
  },
  "issues": [
    {
      "level": "flag",
      "opId": "patch_2",
      "message": "New terms not found in job description: Kubernetes"
    }
  ],
  "cached": true
}
```

**Caching:**
- Patches are cached for 1 hour
- Cache key: `{uid}:{invitationId}`
- Required for `/api/resume/tailored/save` to work

### 2. **POST /api/resume/tailored/save**
Apply accepted patches and save tailored resume.

**Request:**
```json
{
  "resumeId": "resume_789",
  "invitationId": "job_inv_123",
  "acceptedPatchIds": ["patch_1", "patch_3", "patch_5"],
  "studentNotes": "Focused on highlighting React and scalability features"
}
```

**Response:**
```json
{
  "ok": true,
  "tailoredResumeId": "tailored_1709428800000_a1b2c3d4",
  "message": "Tailored resume created with 3 changes applied",
  "appliedCount": 3,
  "totalPatches": 3
}
```

**What it does:**
1. Loads original resume from cache
2. Retrieves patches from patchCache
3. Filters to only accepted patchIds
4. Applies patches sequentially (with validation)
5. Saves atomic Firestore batch:
   - Creates `users/{uid}/tailoredResumes/{tailoredId}`
   - Updates jobInvitations with `tailoredResumeId`
6. Clears cache entry

**Firestore Document:**
```javascript
users/{uid}/tailoredResumes/{tailoredId}
{
  baseResumeId: "resume_789",
  invitationId: "job_inv_123",
  jobContext: {
    jobId: "job_456",
    jobTitle: "Senior React Developer",
    jobDescription: "...",
    requiredSkills: "..."
  },
  acceptedPatches: [
    { opId: "patch_1", type: "replace_bullet", confidence: 0.95, acceptedAt: timestamp }
  ],
  structured: { /* full tailored resume JSON */ },
  studentNotes: "...",
  status: "ready",
  createdAt: timestamp,
  expiresAt: timestamp (90 days)
}
```

### 3. **GET /api/resume/tailored/:tailoredResumeId**
Retrieve a specific tailored resume.

**Response:**
```json
{
  "ok": true,
  "tailoredResumeId": "tailored_...",
  "data": {
    "baseResumeId": "resume_789",
    "invitationId": "job_inv_123",
    "jobContext": { /* job details */ },
    "structured": { /* full resume JSON */ },
    "studentNotes": "...",
    "status": "ready",
    "createdAt": "2025-03-02T...",
    "appliedPatches": 3
  }
}
```

### 4. **GET /api/resume/tailored**
List all tailored resumes for logged-in user.

**Response:**
```json
{
  "ok": true,
  "count": 5,
  "tailoredResumes": [
    {
      "tailoredResumeId": "tailored_...",
      "jobTitle": "Senior React Developer",
      "invitationId": "job_inv_123",
      "createdAt": "2025-03-02T...",
      "status": "ready",
      "appliedPatches": 3
    }
  ]
}
```

### 5. **GET /api/debug/patch-cache** (Development Only)
Debug endpoint to inspect patch cache contents.

**Response:**
```json
{
  "ok": true,
  "stats": {
    "entriesCount": 2,
    "memoryEstimate": "~10 KB",
    "cacheKeys": [
      {
        "key": "user123:job_inv_123",
        "createdAt": "2025-03-02T...",
        "expiresAt": "2025-03-02T..."
      }
    ]
  }
}
```

## Testing the Backend

### Run Tests
```bash
cd backend
npm test -- patchValidator.test.js
npm test -- patchApplier.test.js
```

### Test with cURL
```bash
# 1. Generate patches
curl -X POST http://localhost:5000/api/resume/tailor/v2 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "invitationId": "inv_test_123",
    "jobTitle": "React Developer",
    "jobDescription": "We need a React expert with Node.js experience",
    "requiredSkills": "React, Node.js, TypeScript"
  }'

# 2. Save tailored resume
curl -X POST http://localhost:5000/api/resume/tailored/save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeId": "resume_xyz",
    "invitationId": "inv_test_123",
    "acceptedPatchIds": ["patch_1", "patch_2"],
    "studentNotes": "Emphasized React and TypeScript skills"
  }'

# 3. Retrieve tailored resume
curl -X GET http://localhost:5000/api/resume/tailored/tailored_abc123 \
  -H "Authorization: Bearer <TOKEN>"

# 4. List all tailored resumes
curl -X GET http://localhost:5000/api/resume/tailored \
  -H "Authorization: Bearer <TOKEN>"

# 5. Debug cache
curl -X GET http://localhost:5000/api/debug/patch-cache \
  -H "Authorization: Bearer <TOKEN>"
```

## Firestore Schema Updates

Add these security rules to `firestore.rules`:

```javascript
// Tailored resumes collection (subcollection of users)
match /users/{userId}/tailoredResumes/{tailoredId} {
  allow read: if request.auth.uid == userId;
  allow create, update, delete: if request.auth.uid == userId;
}

// Update jobInvitations to allow reading tailoredResumeId
match /jobInvitations/{invitationId} {
  allow read: if request.auth != null;
  allow update: if request.auth != null; // For updating tailoredResumeId
}
```

## Frontend Integration (Next Steps)

The following endpoints will be called from the frontend:

1. **Job Invitation List:**
   - Add "Tailor Resume" button
   - Calls `POST /api/resume/tailor/v2`

2. **Review Page** (`/invitations/:invitationId/tailor`):
   - Display patches with side-by-side diff
   - Accept/reject toggle per patch
   - Calls `POST /api/resume/tailored/save` with accepted patchIds

3. **Application:**
   - Select "original" or "tailored" resume version
   - Attach tailoredResumeId to application document

## Architecture Decisions

### Why Patch-Based?
- ✅ Safety: No full rewrites, only targeted changes
- ✅ Transparency: Students see exactly what changed
- ✅ Control: Easy to accept/reject individual changes
- ✅ Auditability: Full history of which patches were applied

### Why Caching?
- Gemini responses are expensive (~$0.10 per call)
- Students might refresh the page without re-running Gemini
- Cache persists patches while user reviews them
- Easy to upgrade to Redis for production

### Why Confidence Scores?
- High confidence (>0.9) patches can be auto-checked
- Medium (0.7-0.9) require manual review
- Low (<0.7) have warnings
- Helps distinguish safe vs risky changes

### Why Hallucination Detection?
- LLMs fabricate metrics frequently
- System errors if fabricated metrics are applied
- Conservative approach: reject any new numbers
- For insert_bullet: flag as warning, not error

## Production Considerations

1. **Replace In-Memory Cache:**
   ```javascript
   // Use Redis
   const redis = require("redis");
   const client = redis.createClient();
   // Or use Firestore with TTL
   ```

2. **Add Metrics:**
   - Track patch acceptance rates
   - Monitor hallucination detection hits
   - Log rejected patches for analysis

3. **Rate Limiting:**
   - `/api/resume/tailor/v2` calls Gemini (expensive)
   - Limit to 5-10 per user per day

4. **Audit Trail:**
   - Log all patch applications
   - Track which patches were accepted/rejected
   - Store in separate collection

5. **Version History:**
   - Allow students to view previous tailored versions
   - Support "revert to original" for each section

## Next Steps

1. ✅ Backend implementation (done)
2. ⏳ Frontend review UI (TailorReviewPage component)
3. ⏳ Integration with job invitations
4. ⏳ Application form updates
5. ⏳ PDF export of tailored resume
6. ⏳ Admin dashboard for monitoring

## Debugging

**Check if patches are cached:**
```bash
curl -X GET http://localhost:5000/api/debug/patch-cache \
  -H "Authorization: Bearer <TOKEN>"
```

**Common Errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| "Patches not found in cache" | Tailor endpoint not called with invitationId | Re-run `/api/resume/tailor/v2` with invitationId |
| "Patches expired" | Cache older than 1 hour | Generate fresh patches |
| "beforeText does not match" | Resume was edited between tailor and save | Reload resume, re-run tailor |
| "Parent section not found" | parentId doesn't match any exp/project | Check parentId matches actual experience/project id |
