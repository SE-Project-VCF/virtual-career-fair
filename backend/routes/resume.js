const { Router } = require("express");
const { db } = require("../firebase");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const {
  verifyFirebaseToken,
  resolveApplicantResumePathOrUrl,
  requireCompanyResumeViewAccess,
} = require("../helpers");
const upload = require("../middleware/upload");
const { extractTextFromBuffer, toStructuredResume } = require("../resumeParser");
const {
  parseGeminiJson,
  verifyPatches,
  normalizeRemovalPatch,
  mapPatchParentIds,
  logTailorV2Debug,
} = require("../resumeTailorHelpers");
const PatchValidator = require("../patchValidator");
const PatchApplier = require("../patchApplier");
const patchCache = require("../patchCache");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = Router();

/* ----------------------------------------------------
   UPLOAD RESUME TO FIREBASE STORAGE (via backend)
   Uses Firebase Admin SDK to bypass client-side CORS issues
---------------------------------------------------- */
router.post("/upload-resume", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.uid;
    const file = req.file;

    if (!file) {
      console.log("[UPLOAD RESUME] No file provided");
      return res.status(400).json({ error: "No file provided" });
    }

    if (file.mimetype !== "application/pdf") {
      console.log("[UPLOAD RESUME] Invalid file type:", file.mimetype);
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    if (file.size > 5 * 1024 * 1024) {
      console.log("[UPLOAD RESUME] File too large:", file.size);
      return res.status(400).json({ error: "File size must be under 5MB" });
    }

    // Create storage reference using Admin SDK
    const bucket = admin.storage().bucket();
    const fileName = `${Date.now()}-${file.originalname.replaceAll(/[^\w.\-() ]/g, "_")}`;
    const filePath = `resumes/${userId}/${fileName}`;
    const fileRef = bucket.file(filePath);

    // Upload the file
    console.log("[UPLOAD RESUME] Uploading to Storage:", filePath);
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });
    console.log("[UPLOAD RESUME] ✅ File uploaded to Storage");

    // Automatically parse the resume to extract structure
    console.log("[UPLOAD RESUME] Parsing resume...");
    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(filePath);
      const [buffer] = await file.download();

      // Extract and parse
      const { extractTextFromBuffer, toStructuredResume } = require("../resumeParser");
      const rawText = await extractTextFromBuffer(buffer, fileName);
      const structured = toStructuredResume(rawText);

      // Update Firestore with both raw text and structured data
      await db.collection("users").doc(userId).set(
        {
          resumePath: filePath,
          currentResumePath: filePath,
          resumeFileName: fileName,
          resumeUpdatedAt: admin.firestore.Timestamp.now(),
          // Store BOTH for Gemini and patch application
          resumeRawText: rawText,
          resumeStructured: structured,
        },
        { merge: true }
      );
    } catch (parseErr) {
      console.error("[UPLOAD RESUME] ⚠️ Parse error (continuing anyway):", parseErr.message);
      // Even if parsing fails, we've uploaded the file, so continue
      await db.collection("users").doc(userId).set(
        {
          resumePath: filePath,
          currentResumePath: filePath,
          resumeFileName: fileName,
          resumeUpdatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );
    }

    // Store the file path in response (not a URL)
    // Client will call /api/get-resume-url to get a signed URL when viewing
    console.log("[UPLOAD RESUME] ✅ Upload complete");
    return res.json({
      success: true,
      filePath: `resumes/${userId}/${fileName}`,
      message: "Resume uploaded successfully",
    });
  } catch (err) {
    console.error("[UPLOAD RESUME] ❌ ERROR:", err.message);
    console.error("[UPLOAD RESUME] Stack:", err.stack);
    return res.status(500).json({ error: err.message || "Failed to upload resume" });
  }
});

/* ----------------------------------------------------
   GET RESUME SIGNED URL (for viewing)
   Generates a fresh signed URL valid for 1 hour
---------------------------------------------------- */
router.get("/get-resume-url/:userId", verifyFirebaseToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterId = req.user.uid;

    // Only the user can view their own resume
    if (requesterId !== userId) {
      return res.status(403).json({ error: "Not authorized to view this resume" });
    }

    const bucket = admin.storage().bucket();

    // List files in the user's resume folder to get the most recent one
    const [files] = await bucket.getFiles({ prefix: `resumes/${userId}/` });

    if (files.length === 0) {
      return res.status(404).json({ error: "No resume found" });
    }

    // Get the most recent file (last one in the list is usually the newest)
    const latestFile = files.at(-1);

    // Generate a signed URL valid for 1 hour
    const [signedUrl] = await latestFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return res.json({
      success: true,
      resumeUrl: signedUrl,
    });
  } catch (err) {
    console.error("Get resume URL error:", err);
    return res.status(500).json({ error: err.message || "Failed to get resume URL" });
  }
});

/**
 * GET /api/student/:studentId/resume-url
 * Get signed URL for a student's resume
 * Accessible by: company owners/reps (if student resume is visible) or the student themselves
 */
router.get("/student/:studentId/resume-url", verifyFirebaseToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const requesterId = req.user.uid;

    // Students can always view their own resume
    const isOwnResume = requesterId === studentId;

    if (!isOwnResume) {
      // Check if requester is a company owner/rep and if student has resume visible
      const requesterDoc = await db.collection("users").doc(requesterId).get();
      if (!requesterDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const requesterData = requesterDoc.data();
      const isCompanyUser = requesterData.role === "company" || requesterData.companyId;

      if (!isCompanyUser) {
        return res.status(403).json({ error: "Not authorized to view this resume" });
      }

      // Check if student has made resume visible
      const studentDoc = await db.collection("users").doc(studentId).get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Student not found" });
      }

      const studentData = studentDoc.data();
      if (studentData.resumeVisible === false) {
        return res.status(403).json({ error: "Student has set resume to private" });
      }
    }

    const bucket = admin.storage().bucket();

    // List files in the user's resume folder to get the most recent one
    const [files] = await bucket.getFiles({ prefix: `resumes/${studentId}/` });

    if (files.length === 0) {
      return res.status(404).json({ error: "No resume found" });
    }

    // Get the most recent file (last one in the list is usually the newest)
    const latestFile = files.at(-1);

    // Generate a signed URL valid for 1 hour
    const [signedUrl] = await latestFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return res.json({
      success: true,
      resumeUrl: signedUrl,
    });
  } catch (err) {
    console.error("Get student resume URL error:", err);
    return res.status(500).json({ error: err.message || "Failed to get resume URL" });
  }
});

/* ----------------------------------------------------
   GET APPLICANT RESUME URL (for company reps/owners)
   Generates a signed URL for a student's attached resume
   on a specific job application.
---------------------------------------------------- */
router.get("/applicant-resume-url/:applicationId", verifyFirebaseToken, async (req, res) => {
  try {
    const { applicationId } = req.params;

    const appDoc = await db.collection("jobApplications").doc(applicationId).get();
    if (!appDoc.exists) {
      return res.status(404).json({ error: "Application not found" });
    }

    const appData = appDoc.data();
    const { companyId, studentId } = appData;

    const authError = await requireCompanyResumeViewAccess(companyId, req.user.uid);
    if (authError) {
      return res.status(authError.status).json({ error: authError.error });
    }

    const resolved = await resolveApplicantResumePathOrUrl(appData, studentId);
    if (resolved.type === "url") {
      return res.json({ url: resolved.value });
    }
    if (resolved.type !== "path") {
      return res.status(404).json({ error: "No resume attached to this application" });
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(resolved.value);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: "Resume file not found in storage" });
    }

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return res.json({ url: signedUrl });
  } catch (err) {
    console.error("Error generating applicant resume URL:", err);
    return res.status(500).json({ error: err.message || "Failed to generate resume URL" });
  }
});

/* ----------------------------------------------------
   GET APPLICANT TAILORED RESUME CONTENT (for company reps/owners)
   Returns the text content of a tailored resume attached to an application.
---------------------------------------------------- */
router.get("/applicant-tailored-resume/:applicationId", verifyFirebaseToken, async (req, res) => {
  try {
    const { applicationId } = req.params;

    const appDoc = await db.collection("jobApplications").doc(applicationId).get();
    if (!appDoc.exists) {
      return res.status(404).json({ error: "Application not found" });
    }

    const appData = appDoc.data();
    const { companyId, studentId, attachedTailoredResumeId } = appData;

    if (!attachedTailoredResumeId) {
      return res.status(404).json({ error: "No tailored resume attached to this application" });
    }

    // Verify requester is the company's owner or rep
    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res.status(404).json({ error: "Company not found" });
    }
    const companyData = companyDoc.data();
    const reps = companyData.representativeIDs || [];
    if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
      return res.status(403).json({ error: "Not authorized to view this resume" });
    }

    // Fetch the tailored resume from the student's subcollection
    const tailoredDoc = await db
      .collection("users")
      .doc(studentId)
      .collection("tailoredResumes")
      .doc(attachedTailoredResumeId)
      .get();

    if (!tailoredDoc.exists) {
      return res.status(404).json({ error: "Tailored resume not found" });
    }

    const data = tailoredDoc.data();
    return res.json({
      tailoredText: data.tailoredText ?? null,
      structured: data.structured ?? null,
      jobContext: data.jobContext ?? null,
      method: data.method ?? null,
    });
  } catch (err) {
    console.error("Error fetching applicant tailored resume:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch tailored resume" });
  }
});

router.post("/resume/parse", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;

    // 1) Read user doc to get currentResumePath (or resumePath)
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ ok: false, error: "User doc not found" });
    }

    const userData = userSnap.data();
    const resumePath = userData.currentResumePath || userData.resumePath || userData.resumeUrl;
    const fileName = userData.resumeFileName || "resume.pdf";

    if (!resumePath) {
      return res.status(400).json({ ok: false, error: "No resumePath/currentResumePath on user" });
    }

    // 2) Download from Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(resumePath);
    const [buffer] = await file.download();

    // 3) Fingerprint the file (to dedupe caches)
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const resumeId = `resume_${fileHash.slice(0, 12)}`;

    // 4) Extract text + structure
    const rawText = await extractTextFromBuffer(buffer, resumePath || fileName);
    const structured = toStructuredResume(rawText);

    // 5) Save parsed data to main user document (not subcollection for efficiency)
    await userRef.set(
      {
        currentResumeId: resumeId,
        currentResumePath: resumePath,
        resumeFileName: fileName,
        resumeUpdatedAt: new Date().toISOString(),
        // Store BOTH raw text (for Gemini analysis) and structured (for patch application)
        resumeRawText: rawText,
        resumeStructured: structured,
      },
      { merge: true }
    );

    return res.json({
      ok: true, resumeId, fileHash, bulletCounts: {
        experience: structured.experience.reduce((acc, e) => acc + (e.bullets?.length || 0), 0),
        projects: structured.projects.reduce((acc, p) => acc + (p.bullets?.length || 0), 0),
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/resume/tailor", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { boothId, roleTitle, jobDescription } = req.body;

    if (!jobDescription || typeof jobDescription !== "string") {
      return res.status(400).json({ ok: false, error: "jobDescription is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY on backend" });
    }

    // 1) Load user + currentResumeId
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ ok: false, error: "User doc not found" });

    const userData = userSnap.data() || {};

    // 2) Load structured resume from main user document (not subcollection)
    const structured = userData.resumeStructured;
    if (!structured) return res.status(400).json({ ok: false, error: "No parsed resume. Call /api/resume/parse first." });

    // 3) Gemini call (force JSON)
    const modelName = "gemini-2.5-flash"; // ✅ stable modern model
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const systemRules = `
You tailor a student's resume to a job description.
You MUST output ONLY valid JSON. No markdown. No backticks. No commentary.
Do NOT rewrite the entire resume.
Only propose targeted patch operations tied to existing bulletId values.
Do NOT invent new tools, skills, certifications, employers, dates, or metrics.
If you cannot improve a bullet without inventing facts, return fewer patches.
Every patch MUST include evidence strings copied from the ORIGINAL resume text that justify the edit.
`;

    const schema = `
Return JSON with this exact shape:
{
  "patches": [
    {
      "opId": "string",
      "type": "replace_summary" | "replace_bullet" | "insert_bullet",
      "target": {
        "section": "summary" | "experience" | "projects",
        "bulletId"?: "string",
        "parentId"?: "string",
        "afterBulletId"?: "string"
      },
      "beforeText": "string",
      "afterText": "string",
      "reason": "string",
      "evidence": ["string"]
    }
  ],
  "skill_suggestions": [
    { "skill": "string", "presentInResume": true|false, "reason": "string" }
  ]
}
Rules:
- For replace_bullet, target must include bulletId.
- For replace_summary, target.section must be "summary" and bulletId must be omitted.
- For insert_bullet, target must include section ("experience" or "projects"), parentId (expId/projId), and afterBulletId.
- beforeText must exactly match the original bullet/summary text you're editing.
- evidence must be short quotes from the ORIGINAL resume text (not from job description).
`;

    // Keep prompt size reasonable (avoid drift)
    const structuredTrimmed = JSON.stringify(structured).slice(0, 12000);

    const prompt = `
${systemRules}

Job context:
boothId: ${boothId || ""}
roleTitle: ${roleTitle || ""}
jobDescription:
${jobDescription}

Student resume (structured JSON with stable bulletId):
${structuredTrimmed}

${schema}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 4) Parse JSON robustly
    const jsonResult = parseGeminiJson(text);
    if (jsonResult.error) {
      return res.status(500).json({ ok: false, error: jsonResult.error, raw: jsonResult.raw });
    }
    const parsed = jsonResult.parsed;

    // 5) Shape check
    if (!parsed || !Array.isArray(parsed.patches)) {
      return res.status(500).json({ ok: false, error: "Invalid patch response shape", raw: parsed });
    }

    // 6) Verification layer
    const { verifiedPatches, issues } = verifyPatches(structured, parsed);

    return res.json({
      ok: true,
      provider: "gemini",
      model: modelName,
      patches: verifiedPatches,
      skill_suggestions: parsed.skill_suggestions || [],
      verification: { issues },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* ============================================================
   SIMPLE RESUME TAILOR ENDPOINT - Change Review
   Generate resume changes for user approval
============================================================ */
router.post("/resume/tailor/simple", verifyFirebaseToken, async (req, res) => {
  try {
    console.log("[TAILOR SIMPLE START] Received request");
    const uid = req.user.uid;
    const { jobDescription, jobTitle = "Software Engineer" } = req.body;

    console.log("[TAILOR SIMPLE] UID:", uid, "JobTitle:", jobTitle);

    if (!jobDescription || typeof jobDescription !== "string") {
      return res.status(400).json({
        ok: false,
        error: "jobDescription is required"
      });
    }

    // 1) Load user's raw resume text
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const userData = userSnap.data() || {};
    const resumeRawText = userData.resumeRawText;

    if (!resumeRawText) {
      return res.status(400).json({
        ok: false,
        error: "No resume found. Please upload a resume first."
      });
    }

    console.log("[TAILOR SIMPLE] Resume loaded, length:", resumeRawText.length);

    // 2) Generate changes using Gemini
    const { generateResumeChanges } = require("../resumeTailorSimple");
    const changes = await generateResumeChanges(resumeRawText, jobDescription, jobTitle);

    console.log("[TAILOR SIMPLE] Generated", changes.length, "suggested changes");

    // 3) Return changes for user review
    return res.json({
      ok: true,
      originalText: resumeRawText,
      changes: changes,
      jobTitle: jobTitle,
      message: "Review the suggested changes below. Approve or reject each change."
    });
  } catch (e) {
    console.error("[TAILOR SIMPLE] Error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to generate changes" });
  }
});

/* ============================================================
   SAVE SIMPLE TAILORED RESUME - Apply approved changes
   Accept approved changes and save tailored resume
============================================================ */
router.post("/resume/tailored/simple/save", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { invitationId, originalText, approvedChanges, studentNotes = "", jobTitle = "Unknown" } = req.body;

    if (!invitationId) {
      return res.status(400).json({ ok: false, error: "invitationId is required" });
    }

    if (!originalText || typeof originalText !== "string") {
      return res.status(400).json({ ok: false, error: "originalText is required" });
    }

    if (!Array.isArray(approvedChanges)) {
      return res.status(400).json({ ok: false, error: "approvedChanges must be an array" });
    }

    // 1) Apply approved changes to generate tailored resume
    const { applyChanges, reformatResumeWithGemini } = require("../resumeTailorSimple");
    console.log("[TAILOR SIMPLE SAVE] Applying", approvedChanges.length, "approved changes");
    let tailoredText = await applyChanges(originalText, approvedChanges);

    // 1.5) Reformat with Gemini for proper display/storage
    console.log("[TAILOR SIMPLE SAVE] Reformatting resume with Gemini for clean presentation");
    try {
      tailoredText = await reformatResumeWithGemini(tailoredText);
      console.log("[TAILOR SIMPLE SAVE] Resume reformatted successfully");
    } catch (err) {
      console.error("[TAILOR SIMPLE SAVE] Gemini reformat failed, using original tailor:", err.message);
      // Continue with unformatted version if Gemini fails
    }

    // 2) Get invitation details to extract job info
    const invRef = db.collection("jobInvitations").doc(invitationId);
    const invsnap = await invRef.get();
    if (!invsnap.exists) {
      return res.status(400).json({ ok: false, error: "Invitation not found" });
    }

    const invData = invsnap.data();
    const jobId = invData.jobId;
    let jobContext = { jobId, jobTitle: jobTitle };

    // Get job details
    try {
      const jobDoc = await db.collection("jobs").doc(jobId).get();
      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        jobContext = {
          jobId: jobDoc.id,
          jobTitle: jobData.name || jobTitle,
          jobDescription: jobData.description || "",
          requiredSkills: jobData.majorsAssociated || "",
        };
      }
    } catch (err) {
      console.error("Error fetching job:", err);
    }

    // 3) Create tailored resume document
    const tailoredResumeRef = db.collection("users").doc(uid).collection("tailoredResumes").doc();
    const tailoredId = tailoredResumeRef.id;

    await tailoredResumeRef.set({
      // Links
      baseResumeId: uid,
      invitationId: invitationId,

      // Job context
      jobContext: jobContext,

      // Tailored content (as plain text)
      tailoredText: tailoredText,
      method: "change-approval", // Mark this as user-approved changes

      // Change tracking
      approvedChanges: approvedChanges,
      changesCount: approvedChanges.length,

      // Metadata
      studentNotes: studentNotes,
      status: "ready",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
    });

    // 4) Update job invitation with reference
    await invRef.update({
      tailoredResumeId: tailoredId,
      tailoredAt: admin.firestore.Timestamp.now(),
    });

    console.log("[TAILOR SIMPLE SAVE] Saved tailored resume:", tailoredId);

    return res.json({
      ok: true,
      tailoredResumeId: tailoredId,
      message: `Tailored resume saved successfully with ${approvedChanges.length} approved changes!`,
    });
  } catch (e) {
    console.error("[TAILOR SIMPLE SAVE] Error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to save tailored resume" });
  }
});

/* ============================================================
   IMPROVED RESUME TAILOR ENDPOINT WITH PATCH VALIDATION
============================================================ */
router.post("/resume/tailor/v2", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { invitationId, jobId, jobTitle, jobDescription, requiredSkills } = req.body;

    if (!jobDescription || typeof jobDescription !== "string") {
      return res.status(400).json({
        ok: false,
        error: "jobDescription is required"
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing GEMINI_API_KEY on backend"
      });
    }

    // 1) Load user data from main document
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ ok: false, error: "User doc not found" });
    }

    const userData = userSnap.data() || {};

    // 2) Load BOTH raw text (for Gemini analysis) and structured (for patch validation)
    const rawResumeText = userData.resumeRawText;
    const structured = userData.resumeStructured;

    if (!rawResumeText && !structured) {
      return res.status(400).json({
        ok: false,
        error: "No parsed resume. Call /api/resume/parse first."
      });
    }

    // Use raw text if available (better for Gemini analysis), fall back to structured
    const resumeTextForAnalysis = rawResumeText || JSON.stringify(structured);

    // 3) Gemini call with improved prompt
    const modelName = "gemini-2.5-flash";
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.6,
      },
    });

    const systemRules = `You are a Resume Optimizer AI. Your task is to provide comprehensive resume improvements for a specific job application.

IMPORTANT: The resume is provided in RAW TEXT FORMAT (as it appears in the PDF/document). Your tasks are:
1. **AGGRESSIVELY IDENTIFY IRRELEVANT CONTENT** - Remove ALL skills/jobs not matching job description
2. **IMPROVE RELEVANT CONTENT** - Reword bullets, add metrics, emphasize fit
3. **MATCH EXACT TEXT** - Use exact substrings from resume for beforeText

AGGRESSIVE REMOVAL APPROACH - Return MANY removals + some improvements:
✅ SUCCESS = 4-6 removals (irrelevant items) + 1-2 edits/improvements

REMOVAL IS PRIORITY - Scan THOROUGHLY for:
1) ALL Skills not in job description:
   - Office tools: Microsoft Word, Excel, PowerPoint, Outlook
   - Unrelated technical: Non-programming languages, obsolete tech
   - Hobbies/personal: Basketball, Sports, Knitting, Art, Music even if labeled as "skills"
   - Academic methodologies: "Social Studies Education Methods", "Teaching Techniques"
   - Unrelated certifications/courses

2) ALL Experience not directly relevant:
   - Retail/service jobs (for any engineering role)
   - Unrelated fields (History research for engineering, Education for development)
   - Academic positions (Teaching Assistant for non-teaching roles)
   - Outdated or junior roles (for senior positions)

3) Remove duplicates:
   - "Python" + "Python 3.8" + "Python Programming" → Keep only "Python"
   - Similar technologies with different names

IMPROVEMENT/EDIT EXAMPLES (replace_bullet):
1) Generic → Specific:
   - "Worked on backend" → "Built REST APIs using FastAPI, serving 50K+ users"
   - "Did web development" → "Developed React frontend with 99.9% uptime SLA"

2) Add metrics:
   - "Led team meetings" → "Led 5-person team achieving 40% faster sprint delivery"
   - "Improved system" → "Optimized database queries, reducing load time from 5s to 1.2s"

CONFIDENCE SCALE FOR REMOVALS:
- 0.9-1.0: DEFINITE REMOVE (hobbies, office tools, completely unrelated jobs)
- 0.8-0.89: VERY SAFE (outdated tech, entry-level for senior, unrelated fields)
- 0.6-0.79: SAFE (adjacent but not needed, less relevant experience)

TARGET MINIMUM: At least 5 removals (be aggressive in identifying irrelevant content)

PATCH TYPES:
1. remove_skill: Delete skill (include removedText + removalReason)
2. remove_bullet: Delete achievement (include removedText + removalReason)
3. suppress_section: Delete entire job/project (include removedText + removalReason)
4. replace_bullet: Improve/reword achievement (include beforeText + afterText)

ALL REMOVAL PATCHES MUST INCLUDE:
- removedText: Exact skill/job name being removed (e.g., "Microsoft Word")
- removalReason: Brief explanation for user (e.g., "Office tool, not relevant to backend engineering")`;

    const schema = `IMPORTANT: ALWAYS return JSON with these exact fields:

For REMOVAL patches (remove_skill, remove_bullet, suppress_section):
- REQUIRED: removedText - The exact name/text being removed (e.g., skill name or job title)
- REQUIRED: removalReason - Brief 1-line reason why it's removed
- reason - Longer explanation
- confidence - 0 to 1 score
- type, target - Patch details

For EDIT patches (replace_bullet):
- REQUIRED: beforeText - Original text from resume
- REQUIRED: afterText - Improved text
- reason - Explanation of improvement
- confidence - 0 to 1 score
- type, target - Patch details

Return JSON with exact shape:
{
  "patches": [
    {
      "opId": "patch_001",
      "type": "remove_skill",
      "target": {
        "section": "skills",
        "skillName": "Microsoft Word"
      },
      "removedText": "Microsoft Word",
      "removalReason": "Office productivity tool, not relevant for backend engineering",
      "reason": "Office productivity tool not relevant to software engineering role",
      "confidence": 0.9,
      "relevanceScore": 0.05,
      "relevanceCategory": "low",
      "relevanceExplanation": "Microsoft Word is a general office tool, not mentioned in job posting. Software engineers use specialized development tools, not word processors.",
      "impactAssessment": {
        "willWeakenApplication": false,
        "alternativeSuggestion": null,
        "warningLevel": "high"
      }
    },
    {
      "opId": "patch_002",
      "type": "remove_skill",
      "target": {
        "section": "skills",
        "skillName": "Basketball"
      },
      "removedText": "Basketball",
      "removalReason": "Personal hobby, not a professional skill",
      "reason": "Personal hobby unrelated to professional skills",
      "confidence": 0.95,
      "relevanceScore": 0.0,
      "relevanceCategory": "low",
      "relevanceExplanation": "Basketball is a personal hobby/sport and does not belong in a professional skills section. Does not relate to any job requirement.",
      "impactAssessment": {
        "willWeakenApplication": false,
        "alternativeSuggestion": null,
        "warningLevel": "high"
      }
    },
    {
      "opId": "patch_003",
      "type": "suppress_section",
      "target": {
        "section": "experience",
        "parentId": "exp_2019_cafe"
      },
      "removedText": "Barista at Coffee Shop, 2019",
      "removalReason": "Entry-level service job, not relevant to senior engineering role",
      "reason": "Entry-level service job irrelevant to senior engineering role",
      "confidence": 0.85,
      "relevanceScore": 0.1,
      "relevanceCategory": "low",
      "relevanceExplanation": "Barista/coffee shop role is entry-level service work. For a Senior Software Engineer position, this entry actually weakens the application by suggesting limited professional history.",
      "impactAssessment": {
        "willWeakenApplication": true,
        "alternativeSuggestion": "If you have more recent engineering experience, definitely remove this to save space.",
        "warningLevel": "high"
      }
    },
    {
      "opId": "patch_004",
      "type": "remove_skill",
      "target": {
        "section": "skills",
        "skillName": "Knitting"
      },
      "removedText": "Knitting",
      "removalReason": "Personal hobby, not relevant to professional software engineering",
      "reason": "Knitting is a personal hobby and should not be included in professional technical skills",
      "confidence": 0.95,
      "relevanceScore": 0.0,
      "relevanceCategory": "low",
      "relevanceExplanation": "Hobbies have no place in a professional skills section for engineering roles.",
      "impactAssessment": {
        "willWeakenApplication": false,
        "alternativeSuggestion": null,
        "warningLevel": "high"
      }
    },
    {
      "opId": "patch_005",
      "type": "remove_skill",
      "target": {
        "section": "skills",
        "skillName": "Excel"
      },
      "removedText": "Excel",
      "removalReason": "Office productivity tool, not a technical skill for software engineering",
      "reason": "Excel is an office tool, not a core technical skill for engineering positions",
      "confidence": 0.85,
      "relevanceScore": 0.05,
      "relevanceCategory": "low",
      "relevanceExplanation": "General office tools should not be listed in technical skills section for engineering roles.",
      "impactAssessment": {
        "willWeakenApplication": false,
        "alternativeSuggestion": null,
        "warningLevel": "high"
      }
    },
    {
      "opId": "patch_006",
      "type": "replace_bullet",
      "target": {
        "section": "experience",
        "bulletId": "bullet_234",
        "parentId": "exp_2022_startup"
      },
      "beforeText": "Worked on web development tasks",
      "afterText": "Developed REST APIs using Python Flask for e-commerce platform serving 10K+ users, implementing authentication and payment integration",
      "reason": "Generic bullet reworded to emphasize relevant technical skills and impact",
      "confidence": 0.88,
      "relevanceScore": 0.85,
      "relevanceCategory": "high",
      "relevanceExplanation": "Backend development with Python is directly relevant to the Job description. The reworded bullet emphasizes specific technologies and measurable impact.",
      "impactAssessment": {
        "willWeakenApplication": false,
        "alternativeSuggestion": null,
        "warningLevel": "high"
      }
    }
  ],
  "skill_suggestions": [
    {
      "skill": "Docker",
      "presentInResume": false,
      "reason": "Docker is listed as required skill in job posting but not in resume. If you have Docker experience, add it.",
      "addIfYouHave": true
    }
  ],
  "summary": {
    "totalPatches": 5,
    "removals": 4,
    "edits": 1,
    "insertions": 0,
    "averageRelevance": 0.35,
    "overallOptimization": "Resume has significant irrelevant content (hobbies, office tools, outdated experience). Aggressively removing these items and emphasizing relevant technical work will dramatically improve your application fit."
  }
}`;


    const resumeTextTrimmed = (resumeTextForAnalysis || "").slice(0, 12000);

    const prompt = `${systemRules}

Job Context:
Title: ${jobTitle || "Unknown"}
Description: ${jobDescription}
Required Skills: ${requiredSkills || "Not specified"}

Student Resume (raw text):
${resumeTextTrimmed}

${schema}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log("[TAILOR] Gemini response length:", text.length);

    // 4) Parse JSON robustly
    const jsonResult = parseGeminiJson(text);
    if (jsonResult.error) {
      return res.status(500).json({ ok: false, error: jsonResult.error, raw: jsonResult.raw });
    }
    let parsed = jsonResult.parsed;

    // 4.5) Clean, normalize, and map patches
    if (Array.isArray(parsed.patches)) {
      parsed.patches = parsed.patches
        .map((patch, idx) => normalizeRemovalPatch(patch, idx))
        .map((patch) => mapPatchParentIds(patch, structured));
    }

    // 5) Enhanced patch validation
    const validator = new PatchValidator(structured, jobDescription);
    const validation = validator.validatePatches(parsed.patches || []);

    logTailorV2Debug(parsed, validation);

    // 6) Cache the patches for later save operation
    if (invitationId) {
      patchCache.setCacheEntry(uid, invitationId, parsed, {
        jobId: jobId || "unknown",
        jobTitle: jobTitle || "Unknown",
        jobDescription,
        requiredSkills
      });
    }

    return res.json({
      ok: true,
      invitationId,
      provider: "gemini",
      model: modelName,
      patches: validation.patches,
      skill_suggestions: parsed.skill_suggestions || [],
      verification: validation.summary,
      issues: validation.issues,
      cached: !!invitationId
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* ============================================================
   SAVE TAILORED RESUME ENDPOINT
============================================================ */
router.post("/resume/tailored/save", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { invitationId, acceptedPatchIds, studentNotes } = req.body;

    if (!invitationId || !Array.isArray(acceptedPatchIds)) {
      return res.status(400).json({
        ok: false,
        error: "invitationId and acceptedPatchIds[] are required"
      });
    }

    // 1) Load original resume from main user document
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const userData = userSnap.data() || {};
    let structured = userData.resumeStructured;
    if (!structured) {
      return res.status(400).json({
        ok: false,
        error: "Resume not parsed. Call /api/resume/parse first."
      });
    }

    // CRITICAL FIX: If resume is missing skills/experience but has raw text, re-parse
    if ((!structured.skills || structured.skills.items.length === 0 ||
         !structured.experience || structured.experience.length === 0) &&
        userData.resumeRawText) {
      console.log(`[Save Endpoint] ⚠️ Resume missing skills/experience, re-parsing from raw text...`);
      const { toStructuredResume } = require('../resumeParser.js');
      structured = toStructuredResume(userData.resumeRawText);
      console.log(`[Save Endpoint] Re-parse result: skills=${structured.skills.items.length}, experience=${structured.experience.length}`);
    }

    // 2) Load cached patches from cache
    const cacheEntry = patchCache.getCacheEntry(uid, invitationId);
    if (!cacheEntry.cached) {
      return res.status(400).json({
        ok: false,
        error: "Patches not found in cache. Re-run /api/resume/tailor/v2 first",
        cacheError: cacheEntry.error
      });
    }

    const { patchResponse, jobContext } = cacheEntry;

    // 3) Filter to accepted patches only
    const allPatches = patchResponse.patches || [];
    const acceptedPatches = allPatches.filter(p => acceptedPatchIds.includes(p.opId));

    if (acceptedPatches.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No valid patches to apply"
      });
    }

    // 4) Verify patch order and no conflicts
    const validator = new PatchValidator(structured, jobContext.jobDescription);
    const conflictCheck = validator.detectPatchConflicts(acceptedPatches);
    if (conflictCheck.length > 0) {
      console.warn("Patch conflicts detected:", conflictCheck);
      // We allow conflicts but warn the user
    }

    // 5) Apply patches sequentially
    console.log(`[Save Endpoint] ===== SAVE PROCESS STARTING =====`);
    console.log(`[Save Endpoint] UID: ${uid}, InvitationId: ${invitationId}`);
    console.log(`[Save Endpoint] Structured resume sections:`, {
      hasSummary: !!structured.summary,
      skillsCount: structured.skills?.items?.length || 0,
      experienceCount: structured.experience?.length || 0,
      projectsCount: structured.projects?.length || 0
    });
    console.log(`[Save Endpoint] Structured experience entries:`,
      (structured.experience || []).map((e, i) => ({ idx: i, expId: e.expId, title: e.title, company: e.company })));
    console.log(`[Save Endpoint] Structured skills:`, (structured.skills?.items || []).slice(0, 15));

    console.log(`[Save Endpoint] Applying ${acceptedPatches.length} patches`);
    acceptedPatches.forEach((p, i) => {
      console.log(`[Save Endpoint] Patch ${i}: type=${p.type}, opId=${p.opId}`, {
        targetSection: p.target?.section,
        targetParentId: p.target?.parentId,
        targetSkillName: p.target?.skillName,
        removedText: (p.removedText || '').substring(0, 40)
      });
    });

    const applyResult = PatchApplier.applyPatches(structured, acceptedPatches);

    console.log(`[Save Endpoint] Apply completed. Success: ${applyResult.success}`);
    if (applyResult.success) {
      console.log(`[Save Endpoint] All ${applyResult.appliedCount} patches applied successfully`);
    } else {
      console.log(`[Save Endpoint] FAILURES - ${applyResult.errors?.length || 0} patches failed:`);
      applyResult.errors?.forEach((err, i) => {
        console.log(`[Save Endpoint]   Error ${i}: opId=${err.opId}, error="${err.error}"`);
      });
      console.log(`[Save Endpoint] Applied count: ${applyResult.appliedCount}/${acceptedPatches.length}`);
    }

    if (!applyResult.success) {
      return res.status(400).json({
        ok: false,
        error: "Failed to apply patches",
        errors: applyResult.errors
      });
    }

    const tailoredResume = applyResult.tailoredResume;

    // 6) Final validation
    const finalValidator = new PatchValidator(tailoredResume);
    const finalValidation = finalValidator.validatePatches([]);
    if (!finalValidation.valid && finalValidation.issues.some(i => i.level === "error")) {
      return res.status(400).json({
        ok: false,
        error: "Final resume validation failed",
        issues: finalValidation.issues.filter(i => i.level === "error")
      });
    }

    // 7) Atomic save to Firestore
    const batch = db.batch();
    const tailoredId = `tailored_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Save tailored resume document
    const tailoredResumeRef = userRef.collection("tailoredResumes").doc(tailoredId);
    batch.set(tailoredResumeRef, {
      // Links
      baseResumeId: uid,
      invitationId,

      // Job context
      jobContext: {
        jobId: jobContext.jobId || "unknown",
        jobTitle: jobContext.jobTitle || "Unknown",
        jobDescription: jobContext.jobDescription,
        requiredSkills: jobContext.requiredSkills || ""
      },

      // Patches applied
      acceptedPatches: acceptedPatches.map(p => ({
        opId: p.opId,
        type: p.type,
        confidence: p.confidence || 0.5
      })),

      // Final resume
      structured: tailoredResume,

      // Metadata
      studentNotes: studentNotes || "",
      status: "ready",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
    });

    // Update job invitation with tailored resume reference
    const invitationRef = db.collection("jobInvitations").doc(invitationId);
    batch.update(invitationRef, {
      tailoredResumeId: tailoredId,
      tailoredAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    // 8) Clear cache after successful save
    patchCache.clearCacheEntry(uid, invitationId);

    res.json({
      ok: true,
      tailoredResumeId: tailoredId,
      message: `Tailored resume created with ${applyResult.appliedCount} changes applied`,
      appliedCount: applyResult.appliedCount,
      totalPatches: acceptedPatches.length
    });
  } catch (err) {
    console.error("Error saving tailored resume:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ============================================================
   LIST TAILORED RESUMES FOR USER (must come before :tailoredResumeId route)
============================================================ */
router.get("/resume/tailored", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;

    const userRef = db.collection("users").doc(uid);
    const snapshot = await userRef.collection("tailoredResumes")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const resumes = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      resumes.push({
        id: doc.id,
        jobContext: data.jobContext,
        structured: data.structured,
        studentNotes: data.studentNotes,
        createdAt: data.createdAt,
        status: data.status,
        expiresAt: data.expiresAt,
        acceptedPatches: data.acceptedPatches || []
      });
    });

    res.json({
      ok: true,
      resumes
    });
  } catch (err) {
    console.error("Error listing tailored resumes:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* Alias for /api/resume/tailored/list (must come before :tailoredResumeId route) */
router.get("/resume/tailored/list", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;

    const userRef = db.collection("users").doc(uid);
    const snapshot = await userRef.collection("tailoredResumes")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const resumes = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      resumes.push({
        id: doc.id,
        jobContext: data.jobContext,
        structured: data.structured,
        studentNotes: data.studentNotes,
        createdAt: data.createdAt,
        status: data.status,
        expiresAt: data.expiresAt,
        acceptedPatches: data.acceptedPatches || []
      });
    });

    res.json({
      ok: true,
      resumes
    });
  } catch (err) {
    console.error("Error listing tailored resumes:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ============================================================
   RETRIEVE TAILORED RESUME
============================================================ */
router.get("/resume/tailored/:tailoredResumeId", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { tailoredResumeId } = req.params;

    if (!tailoredResumeId) {
      return res.status(400).json({ ok: false, error: "tailoredResumeId is required" });
    }

    const userRef = db.collection("users").doc(uid);
    const tailoredSnap = await userRef.collection("tailoredResumes").doc(tailoredResumeId).get();

    if (!tailoredSnap.exists) {
      return res.status(404).json({ ok: false, error: "Tailored resume not found" });
    }

    const data = tailoredSnap.data();

    res.json({
      ok: true,
      tailoredResumeId,
      data: {
        baseResumeId: data.baseResumeId,
        invitationId: data.invitationId,
        jobContext: data.jobContext,
        // Support both old structured format and new plain text format
        structured: data.structured,
        tailoredText: data.tailoredText,
        method: data.method, // "direct-edit", "change-approval", or "patch-based"
        studentNotes: data.studentNotes,
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.(),
        changesCount: data.changesCount || 0,
        appliedPatches: data.acceptedPatches?.length || 0
      }
    });
  } catch (err) {
    console.error("Error retrieving tailored resume:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ============================================================
   UPDATE TAILORED RESUME (for edit/notes)
============================================================ */
router.put("/resume/tailored/:tailoredResumeId", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { tailoredResumeId } = req.params;
    const { structured, tailoredText, studentNotes } = req.body;

    if (!tailoredResumeId) {
      return res.status(400).json({ ok: false, error: "tailoredResumeId is required" });
    }

    const userRef = db.collection("users").doc(uid);
    const resumeRef = userRef.collection("tailoredResumes").doc(tailoredResumeId);
    const resumeSnap = await resumeRef.get();

    if (!resumeSnap.exists) {
      return res.status(404).json({ ok: false, error: "Tailored resume not found" });
    }

    // Update resume with new data
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (structured) {
      updateData.structured = structured;
    }

    if (tailoredText !== undefined) {
      updateData.tailoredText = tailoredText;
    }

    if (studentNotes !== undefined) {
      updateData.studentNotes = studentNotes;
    }

    await resumeRef.update(updateData);

    res.json({
      ok: true,
      message: "Resume updated successfully"
    });
  } catch (err) {
    console.error("Error updating tailored resume:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ============================================================
   DELETE TAILORED RESUME
============================================================ */
router.delete("/resume/tailored/:tailoredResumeId", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { tailoredResumeId } = req.params;

    if (!tailoredResumeId) {
      return res.status(400).json({ ok: false, error: "tailoredResumeId is required" });
    }

    const userRef = db.collection("users").doc(uid);
    const resumeRef = userRef.collection("tailoredResumes").doc(tailoredResumeId);
    const resumeSnap = await resumeRef.get();

    if (!resumeSnap.exists) {
      return res.status(404).json({ ok: false, error: "Tailored resume not found" });
    }

    // Delete the tailored resume
    await resumeRef.delete();

    // Also clear the reference from the job invitation if it exists
    const resumeData = resumeSnap.data();
    if (resumeData.invitationId) {
      try {
        const invRef = db.collection("jobInvitations").doc(resumeData.invitationId);
        await invRef.update({
          tailoredResumeId: admin.firestore.FieldValue.delete(),
          tailoredAt: admin.firestore.FieldValue.delete()
        });
      } catch (invErr) {
        console.warn("Could not update invitation reference:", invErr);
      }
    }

    res.json({
      ok: true,
      message: "Tailored resume deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting tailored resume:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
