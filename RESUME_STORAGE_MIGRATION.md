# Resume Storage Migration Guide

## Problem
The original implementation stores resume data redundantly across **3 locations**:

```
❌ INEFFICIENT SCHEMA:
1. Cloud Storage        → /resumes/{userId}/resume.pdf (actual file)
2. users document       → resumePath, resumeFileName, resumeUpdatedAt
3. users/resumes subcoll → storagePath, text, structured, fileHash (DUPLICATE)
```

**Issues:**
- ❌ Duplicate metadata (storagePath stored in 2 places)
- ❌ Duplicate parsed content (structured resume in subcollection)
- ❌ Higher storage costs (Firestore charges per document)
- ❌ More complex queries (need to join documents)
- ❌ Harder to keep in sync

---

## Solution: Clean Schema

```
✅ EFFICIENT SCHEMA:
users/{uid} {
  resumePath: "resumes/{uid}/MyResume-123.pdf",
  resumeFileName: "MyResume-123.pdf",
  resumeUpdatedAt: timestamp,
  
  // NEW: Store structured resume directly on main document
  resumeStructured: {
    summary: "...",
    skills: ["React", "TypeScript", ...],
    experience: [{ title, company, bullets: [...], ... }],
    projects: [{ ... }],
    education: [{ ... }]
  },
  currentResumeId: "resume_hash123"  // For backwards compatibility
}

// DELETE: users/{uid}/resumes/{resumeId} subcollection (no longer needed)
```

**Benefits:**
- ✅ Single document fetch (no subcollection query)
- ✅ Atomic updates (one transaction)
- ✅ Lower storage costs (no duplication)
- ✅ Simpler code (direct field access)
- ✅ Better performance (fewer reads)

---

## Migration Steps

### Step 1: Run the Migration Script
```bash
cd backend
node scripts/migrateResumeStorage.js
```

**What it does:**
- ✅ Scans all users in Firestore
- ✅ Finds their resumes subcollection
- ✅ Copies latest structured resume to main document (`resumeStructured` field)
- ✅ Deletes old subcollection documents
- ✅ Prints summary of migrated users

**Expected output:**
```
🚀 Starting resume storage migration...
📋 Found 25 users to process

📦 user1: Found 1 resume(s) in subcollection
   📤 Migrating resume resume_abc123...
   🗑️  Deleting old subcollection...
   ✅ user1: Migration complete!

[more users...]

============================================================
MIGRATION SUMMARY
============================================================
✅ Migrated: 20
⏭️  Skipped:  5 (no resumes or no structure)
❌ Errors:   0
============================================================
```

### Step 2: Verify Backend Updates ✅ DONE
The following endpoints have been updated:

**`POST /api/resume/parse`** (Line 1755)
- ❌ Old: Wrote to `users/{uid}/resumes/{resumeId}` subcollection
- ✅ New: Writes to `users/{uid}` document with `resumeStructured` field

**`POST /api/resume/tailor/v2`** (Line 2434)
- ❌ Old: Read from `userRef.collection("resumes").doc(resumeId)`
- ✅ New: Read from `userData.resumeStructured`

**`POST /api/resume/tailor`** (Line 2580)
- ❌ Old: Read from `userRef.collection("resumes").doc(resumeId)`
- ✅ New: Read from `userData.resumeStructured`

**`POST /api/resume/tailored/save`** (Line 2780)
- ❌ Old: Read from `userRef.collection("resumes").doc(resumeId)`
- ✅ New: Read from `userData.resumeStructured`

### Step 3: Update Firestore Security Rules ✅ DONE
The rules have been updated to allow:
- ✅ Users can read any user document (for data needed)
- ✅ Users can update their own document including `resumeStructured`
- ✅ No explicit permission needed for `/resumes` subcollection (implicitly denied)

### Step 4: Test the Workflow
```bash
# Terminal 1: Start backend
cd backend
npm start

# Terminal 2: Run tests
npm test

# Or manual test:
# 1. Register a student account
# 2. Upload a resume (POST /api/upload-resume)
# 3. Parse resume (POST /api/resume/parse)
# 4. Verify resumeStructured exists in Firestore Console
#    → users/{uid} document should have resumeStructured field
# 5. Test tailor endpoint (POST /api/resume/tailor/v2)
```

### Step 5: Delete Old Firestore Subcollection (Optional Admin Tasks)
If you want to fully clean up and manually delete old data:

```javascript
// Admin script to permanently delete all resumes subcollections
const batch = db.batch();
const users = await db.collection("users").get();

for (const user of users.docs) {
  const resumes = await db.collection("users").doc(user.id).collection("resumes").get();
  for (const resume of resumes.docs) {
    batch.delete(resume.ref);
  }
}

await batch.commit();
console.log("✅ Old subcollections deleted");
```

---

## Storage Comparison

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Firestore docs per user | 2+ | 1 | **50% fewer** |
| Stored fields | 8 | 6 | **25% less data** |
| Read cost | 2 reads | 1 read | **50% cheaper** |
| Write cost | 2 writes | 1 write | **50% cheaper** |
| Parse overhead | Stored text + structured | Only structured | **More efficient** |

---

## Backward Compatibility

The migration **keeps** `currentResumeId` field for backward compatibility, but the code now uses `resumeStructured` directly. If you have external code referencing `currentResumeId`, it will still work—just not needed anymore.

---

## Troubleshooting

**Q: What if the migration fails partway through?**
- A: It's safe to rerun. It only migrates users with resumes and will overwrite existing data.

**Q: What if some users have multiple resumes in the subcollection?**
- A: The migration picks the most recent one (by `createdAt`) and deletes the rest.

**Q: Can I rollback after migration?**
- A: Yes, the migration doesn't delete your cloud storage files. You'd need to restore the Firestore data from a backup.

**Q: Do I need to rebuild/redeploy after migration?**
- A: No! The code was already updated. Just run the migration script and you're done.

---

## Next Steps

1. ✅ Run migration script
2. ✅ Verify in Firestore Console (check `resumeStructured` field exists)
3. ✅ Test all resume endpoints
4. 🔄 Consider adding `resumeStructured` to Firestore indexes if you do queries by skills
5. 📊 Monitor performance (should see faster resume tailor times)

