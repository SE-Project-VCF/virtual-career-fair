# Resume Optimizer - Phase 1 Implementation Guide

## ✅ Phase 1 Complete: Schema & Prompt Design

### What's Been Created:

#### 1. **patchValidatorV2.js** (NEW)
A comprehensive validation system supporting all new patch types:

**Supported Patch Types:**
- `replace_summary` - Improve professional summary
- `replace_bullet` - Reword achievement
- `insert_bullet` - Add inferrable detail
- `remove_bullet` - Delete low-relevance bullet
- `remove_skill` - Delete irrelevant skill
- `suppress_section` - Hide entire section
- `condense_bullet` - Shorten bullet
- `relabel_experience` - Rename job title
- `reorder_bullet` - Prioritize by relevance

**Key Features:**
- ✅ Relevance scoring (0-1 scale)
- ✅ Hallucination detection for ALL patch types
- ✅ Conflict detection (e.g., remove + edit same content)
- ✅ Orphaning detection (e.g., removing experience referenced elsewhere)
- ✅ Safety validation (prevents removing >40% of content)
- ✅ Impact assessment for removals
- ✅ Evidence tracking from job description

**Validation Methods:**
```javascript
validatePatches(patches)           // Main entry point
validateRemovalPatch(patch)        // Verify removal exists
detectHallucinations(patch)        // Catch fabricated content
detectPatchConflicts(patches)      // Find conflicting patches
validateRemovalSafety(patches)     // Prevent excessive removal
detectOrphanedContent(patches)     // Warn about dependencies
```

#### 2. **Enhanced Gemini Prompt** (server.js)
Updated `/api/resume/tailor/v2` with new system rules and response schema:

**System Rules Changes:**
- ✅ Added removal patch types to generation instructions
- ✅ Defined relevance classification (HIGH/MEDIUM/LOW)
- ✅ Added safety constraints for each patch type
- ✅ Included examples (retail job → engineering, HTML/CSS → React)

**Response Schema Changes:**
- ✅ Added `removedText`, `removalReason`, `suppressionMode`
- ✅ Added `relevanceScore`, `relevanceCategory`, `relevanceExplanation`
- ✅ Added `impactAssessment` with `willWeakenApplication`, `warningLevel`
- ✅ Added `summary` object with aggregate statistics

**Example Gemini Output:**
```json
{
  "patches": [
    {
      "opId": "patch_001",
      "type": "remove_skill",
      "target": {
        "section": "skills",
        "skillName": "Microsoft Office"
      },
      "removedText": "Microsoft Office",
      "removalReason": "Not relevant to software engineering role",
      "suppressionMode": "soft",
      "relevanceScore": 0.1,
      "relevanceCategory": "low",
      "relevanceExplanation": "Retail/office skills have no connection to backend engineering",
      "confidence": 0.92,
      "evidence": ["Job description focuses entirely on coding"],
      "impactAssessment": {
        "willWeakenApplication": false,
        "warningLevel": "low"
      }
    }
  ],
  "summary": {
    "totalPatches": 8,
    "removals": 3,
    "edits": 5,
    "averageRelevance": 0.78
  }
}
```

#### 3. **Updated Frontend Types** (TailorReviewPage.tsx)
Expanded TypeScript `Patch` interface to include:
- All 9 patch types
- Removal fields: `removedText`, `removalReason`, `suppressionMode`
- Relevance fields: `relevanceScore`, `relevanceCategory`, `relevanceExplanation`
- Impact fields: `impactAssessment`

---

## 🚀 Next Steps (Phase 2-4)

### Phase 2: Backend Integration
**File to modify:** `backend/server.js`

1. **Switch to PatchValidatorV2:**
   ```javascript
   // Change line 60 from:
   const PatchValidator = require("./patchValidator");
   // To:
   const PatchValidatorV2 = require("./patchValidatorV2");
   
   // Then in /api/resume/tailor/v2 endpoint (line ~2720):
   // Replace: validator = new PatchValidator(structured, jobDescription);
   // With: validator = new PatchValidatorV2(structured, jobDescription);
   ```

2. **Update /api/resume/tailored/save endpoint** to handle removal patches:
   - Apply edits normally
   - For removals: instead of deleting, store in `suppressedContent` subcollection
   - Maintain audit trail of what was suppressed and when

3. **Add recovery endpoint** (for later):
   - `POST /api/resume/tailored/:tailoredId/restore`
   - Allow student to unsuppress/restore removed content

### Phase 3: Frontend UI Components
**Files to create/modify:**
- `frontend/src/components/RemovalPatchCard.tsx` - Display removal suggestions
- `frontend/src/components/RelevanceScoreDisplay.tsx` - Show 0-1 score with colors
- Update `TailorReviewPage.tsx` to handle removal patch types

**UI Pattern for Removals:**
```
┌─────────────────────────────────────────────┐
│ ❌ REMOVE SKILL                              │
│                                               │
│ Content:  "Microsoft Office"                │
│                                               │
│ Relevance: [===========    ] 25% (Low)      │
│                                               │
│ Why: "Not relevant to software engineering" │
│ Job focuses on: Python, React, Cloud        │
│                                               │
│ ⚠️ Safe to Remove                            │
│    (Not critical to role)                    │
│                                               │
│ [Checkbox] Accept Removal                   │
└─────────────────────────────────────────────┘
```

### Phase 4: Firestore Schema Updates
**Schema changes needed:**

1. **Add suppressedContent tracking:**
   ```
   users/{uid}/tailoredResumes/{tailoredId}/suppressedContent {
     skills: [{ name, patchId, removedAt }],
     sections: { experience: [...], projects: [...], ... },
     bullets: [{ bulletId, text, patchId, removedAt }]
   }
   ```

2. **Update security rules:**
   ```javascript
   match /users/{userId}/tailoredResumes/{tailoredId} {
     allow read: if request.auth.uid == userId;
     allow create, update, delete: if request.auth.uid == userId;
   }
   ```

---

## 📊 Current Architecture State

### ✅ Complete
- Schema design (types, validation rules)
- Gemini prompt with full instructions
- PatchValidatorV2 system
- TypeScript interfaces
- Safety validation logic (conflict, orphaning, excessive removal)

### ⏳ In Progress
- Backend integration (switching validators)
- Firestore suppression storage

### ❌ Not Started
- Frontend removal UI components
- Recovery/restoration UI
- Admin dashboard for monitoring

---

## 🧪 Testing the Implementation

### Quick Test Flow:
1. Student uploads master resume (with unrelated skills/jobs)
2. Student clicks "Tailor Resume" for tech role
3. Gemini should suggest:
   - ✅ Removing "Retail" section (if present)
   - ✅ Removing "Microsoft Office" skill
   - ✅ Improving "Python" bullets to emphasize Flask/Django
   - ✅ Reordering to put "Backend" experience first
4. Frontend shows relevance scores for each suggestion
5. Student accepts/rejects individual patches
6. Tailored resume created with suppressed content recoverable

### Expected Behavior:
- Removal patches get `relevanceScore: 0.1-0.3` (low relevance)
- Edit patches get `relevanceScore: 0.7-0.95` (high relevance)
- Total confidence ~0.8+ (high confidence suggestions)
- No hallucinated metrics/technologies

---

## 🛡️ Safety Validation Checklist

PatchValidatorV2 enforces:
- ✅ `beforeText` exact match for removals
- ✅ Content exists in original resume
- ✅ No conflicting patches (remove + edit same)
- ✅ No orphaning (removing referenced content)
- ✅ Max 40% removal ratio
- ✅ No suppression of education/summary
- ✅ No hallucinated metrics

---

## 📝 Implementation Notes

### Why PatchValidatorV2 (not replacing V1)?
- V1 still works for existing features
- V2 is more mature but needs full integration testing
- Plan: Migrate gradually, keep both for now

### Relevance Scoring Philosophy
- HIGH (0.8-1.0): Required skill, mentioned in job posting, direct match
- MEDIUM (0.4-0.7): Related skill, demonstrates adjacent ability
- LOW (0.0-0.3): Not in job description, different industry, irrelevant

### Suppression vs Hard Delete
- All removals use `suppressionMode: "soft"` by default
- Soft = hidden but recoverable via admin restoration
- Hard = permanently deleted (rarely used)
- Student can see suppressed items in review UI

### Future Enhancements
1. Reordering patches (prioritize by relevance)
2. Conditional patches (suppress A only if promoting B)
3. A/B testing (show versioning)
4. Analytics (track which patches students accept)
5. Skill gap analysis (identify missing skills from job)

---

## 🔗 Integration Points

**Backend → Frontend:**
- Patches include `relevanceScore` for UI coloring
- Patches include `impactAssessment` for warnings
- Patches include `evidence` for transparency

**Frontend → Backend:**
- TailorReviewPage sends `acceptedPatchIds` to save
- Backend validates and applies only accepted patches
- Suppressed content stored separately for recovery

---

## 📞 Questions to Answer

1. **Should students see soft-deleted content?**
   - Option A: Show in collapsible "Suppressed content" section
   - Option B: Hide completely, only admins can see via analytics
   - Recommendation: Option A for transparency

2. **Should we allow conditional removals?**
   - Example: "Remove retail job IF tech job count > 2"
   - Recommendation: v2+ feature, keep Phase 1 simple

3. **Should we rank patches by relevance automatically?**
   - Currently: Gemini orders by preference
   - Enhancement: AI could suggest application order
   - Recommendation: Phase 3 feature

---

**Status:** Phase 1 complete. Ready for Phase 2 backend integration.
