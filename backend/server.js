require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { db, auth } = require("./firebase");
const admin = require("firebase-admin");
const { removeUndefined, generateInviteCode, encryptInviteCode, decryptInviteCode, hmacInviteCode, validateJobInput, parseUTCToTimestamp, verifyAdmin, verifyFirebaseToken } = require("./helpers");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Fair routes (multi-fair support)
const fairsRouter = require("./routes/fairs");

// Helper to check if user is company owner or representative
async function checkCompanyAuthorization(companyId, userId) {
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) {
    return { authorized: false, error: "Invalid company ID" };
  }
  const companyData = companyDoc.data();
  const reps = companyData.representativeIDs || [];
  if (companyData.ownerId !== userId && !reps.includes(userId)) {
    return { authorized: false, error: "Not authorized for this company" };
  }
  return { authorized: true, companyData };
}

// --------------------------
// ENVIRONMENT VALIDATION
// --------------------------
const requiredEnvVars = ["STREAM_API_KEY", "STREAM_API_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// --------------------------
// STREAM CHAT SERVER CLIENT
// --------------------------
const { StreamChat } = require("stream-chat");

const streamServer = StreamChat.getInstance(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET
);

const app = express();
app.disable('x-powered-by'); // Disable Express version disclosure
const PORT = process.env.PORT || 5000;

// CORS configuration - allow multiple origins
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "https://virtual-career-fair-git-dev-ninapellis-projects.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean));

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow curl / no-origin
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const crypto = require("node:crypto");
const { extractTextFromBuffer, toStructuredResume } = require("./resumeParser");
const PatchValidator = require("./patchValidator");
const PatchApplier = require("./patchApplier");
const patchCache = require("./patchCache");

// Rate limiting: per-IP. Higher limit when not production (dev or NODE_ENV unset) to avoid 429s from polling and booth/dashboard loads.
if (process.env.NODE_ENV !== "test") {
  const limit = process.env.NODE_ENV === "production" ? 100 : 1000;
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limit,
    standardHeaders: true,
    legacyHeaders: false,
  }));
}

// --------------------------
// MULTER CONFIGURATION FOR FILE UPLOADS
// --------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Only allow PDFs for resume uploads
    if (req.path === "/api/upload-resume" && file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    // Allow images for booth logos
    if (req.path === "/api/upload-booth-logo" && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  }
});

// Test endpoint directly on app
app.post("/test-endpoint", (req, res) => {
  res.json({ success: true, message: "Direct endpoint works!" });
});

// Refresh invite code endpoint
app.post("/api/fairs/:fairId/refresh-invite-code", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { userId } = req.body;
  const adminUid = req.user.uid;

  const adminError = await verifyAdmin(userId || adminUid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });

    const rawCode = generateInviteCode();

    await db.collection("fairs").doc(fairId).update({
      inviteCodeEncrypted: encryptInviteCode(rawCode),
      inviteCodeHmac: hmacInviteCode(rawCode),
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: adminUid,
    });

    return res.json({ inviteCode: rawCode });
  } catch (err) {
    console.error("POST /api/fairs/:fairId/refresh-invite-code error:", err);
    return res.status(500).json({ error: "Failed to refresh invite code" });
  }
});

// Mount fair routes (multi-fair support)
app.use(fairsRouter);


app.get("/api/debug/gemini-models", async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await r.json();

    const models = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name);

    res.json({ ok: true, models });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/debug/storage-bucket", async (req, res) => {
  try {
    const bucket = admin.storage().bucket(); // ✅ define it here (Option A)
    const [files] = await bucket.getFiles({ maxResults: 1 });

    return res.json({
      ok: true,
      bucket: bucket.name,
      sampleFile: files?.[0]?.name || null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* ----------------------------------------------------
   STREAM TOKEN ENDPOINT
---------------------------------------------------- */
app.get("/api/stream-token", verifyFirebaseToken, (req, res) => {
  try {
    const token = streamServer.createToken(req.user.uid);
    return res.json({ success: true, token });
  } catch (err) {
    console.error("Stream token error:", err);
    return res.status(500).json({ error: "Unable to create token" });
  }
});

/* ----------------------------------------------------
   NEW: GET UNREAD COUNT FOR A USER (server-side)
---------------------------------------------------- */
app.get("/api/stream-unread", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    // 1) Get all channels the user is a member of
    const channels = await streamServer.queryChannels(
      {
        type: "messaging",
        members: { $in: [userId] }
      },
      { last_message_at: -1 },
      { state: true }
    );

    let unread = 0;

    // 2) Loop through channels and compute unread manually
    for (const ch of channels) {
      const state = ch.state;

      if (!state) continue;

      const lastRead = state.read[userId]?.last_read;
      const messages = state.messages;

      if (!lastRead || !messages) continue;

      // Count messages after last_read that are NOT sent by the current user
      const unreadInThisChannel = messages.filter(
        m => m.created_at > lastRead && m.user?.id !== userId
      ).length;

      unread += unreadInThisChannel;
    }

    return res.json({ success: true, unread });

  } catch (err) {
    console.error("Unread calc error:", err);
    return res.status(500).json({ error: "Failed to compute unread" });
  }
});

/* ----------------------------------------------------
   UPLOAD RESUME TO FIREBASE STORAGE (via backend)
   Uses Firebase Admin SDK to bypass client-side CORS issues
---------------------------------------------------- */
app.post("/api/upload-resume", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.uid;
    const file = req.file;
    
    console.log("[UPLOAD RESUME] Starting upload for user:", userId);

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
      const { extractTextFromBuffer, toStructuredResume } = require("./resumeParser");
      const rawText = await extractTextFromBuffer(buffer, fileName);
      const structured = toStructuredResume(rawText);
      
      console.log("[UPLOAD RESUME] Parsed resume:", {
        rawTextLength: rawText.length,
        summaryLength: structured.summary?.text?.length || 0,
        skillsCount: structured.skills?.items?.length || 0,
        experienceCount: structured.experience?.length || 0,
      });
      
      // Update Firestore with both raw text and structured data
      console.log("[UPLOAD RESUME] Updating Firestore with parsed data...");
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
    
    console.log("[UPLOAD RESUME] ✅ Firestore updated");
    
    // Verify the data was written
    const verifySnap = await db.collection("users").doc(userId).get();
    const userData = verifySnap.data();
    console.log("[UPLOAD RESUME] Verification - resumePath on user:", userData?.resumePath);
    console.log("[UPLOAD RESUME] Verification - user doc keys:", Object.keys(userData || {}));

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
app.get("/api/get-resume-url/:userId", verifyFirebaseToken, async (req, res) => {
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

/* ----------------------------------------------------
   UPLOAD BOOTH LOGO TO FIREBASE STORAGE (via backend)
   Uses Firebase Admin SDK to bypass client-side CORS issues
---------------------------------------------------- */
app.post("/api/upload-booth-logo", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.uid;
    const { companyId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID required" });
    }

    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "File size must be under 5MB" });
    }

    // Create storage reference using Admin SDK
    const bucket = admin.storage().bucket();
    const fileName = `${Date.now()}-${file.originalname.replaceAll(/[^\w.\-() ]/g, "_")}`;
    const filePath = `boothLogos/${companyId}/${userId}/${fileName}`;
    const fileRef = bucket.file(filePath);

    // Upload the file
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    // Store the file path in response (not a URL)
    // Client will call /api/get-booth-logo-url to get a signed URL when viewing
    return res.json({
      success: true,
      filePath: `boothLogos/${companyId}/${userId}/${fileName}`,
      message: "Logo uploaded successfully",
    });
  } catch (err) {
    console.error("Booth logo upload error:", err);
    return res.status(500).json({ error: err.message || "Failed to upload logo" });
  }
});

/* ----------------------------------------------------
   GET BOOTH LOGO SIGNED URL (for viewing)
   Generates a fresh signed URL valid for 1 hour
   Any authenticated user can view logos
---------------------------------------------------- */
app.get("/api/get-booth-logo-url/:companyId", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    const bucket = admin.storage().bucket();

    // List files in the company's logo folder to get the most recent one
    const [files] = await bucket.getFiles({ prefix: `boothLogos/${companyId}/` });

    if (files.length === 0) {
      return res.status(404).json({ error: "No logo found" });
    }

    // Get the most recent file
    const latestFile = files.at(-1);

    // Generate a signed URL valid for 1 hour
    const [signedUrl] = await latestFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return res.json({
      success: true,
      logoUrl: signedUrl,
    });
  } catch (err) {
    console.error("Get logo URL error:", err);
    return res.status(500).json({ error: err.message || "Failed to get logo URL" });
  }
});

/* ----------------------------------------------------
   ENSURE SINGLE USER EXISTS IN STREAM
   Called from frontend after login/registration
---------------------------------------------------- */
app.options("/api/sync-stream-user", cors());
app.post("/api/sync-stream-user", verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email, firstName, lastName } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ error: "Missing uid or email" });
    }

    // Verify the authenticated user matches the uid being synced
    if (req.user.uid !== uid) {
      return res.status(403).json({ error: "Not authorized to sync this user" });
    }

    const username =
      email?.includes("@")
        ? email.split("@")[0]
        : email || uid;

    await streamServer.upsertUser({
      id: uid,
      name: `${firstName || ""} ${lastName || ""}`.trim() || email,
      email,
      username,
      firstName: firstName || "",
      lastName: lastName || "",
      role: "user",
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Stream single-user sync error:", err);
    return res.status(500).json({ error: "Failed to sync user to Stream" });
  }
});


/* ----------------------------------------------------
   REGISTER USER (Firestore + Stream upsert)
---------------------------------------------------- */
app.post("/api/register-user", async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, companyName } = req.body;

    if (!email || !password || !role) {
      return res
        .status(400)
        .send({ success: false, error: "Missing required fields" });
    }

    // Prevent administrator registration through public endpoint
    if (role === "administrator") {
      return res
        .status(403)
        .send({ success: false, error: "Administrator accounts cannot be created through public registration" });
    }

    // Create Firebase Auth user
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName || ""} ${lastName || ""}`.trim(),
      emailVerified: true,
    });

    let companyId = null;
    let plainInviteCode = null;

    // Company owner setup
    if (role === "companyOwner") {
      plainInviteCode = generateInviteCode();

      const companyRef = db.collection("companies").doc();
      companyId = companyRef.id;

      await companyRef.set(
        removeUndefined({
          companyId,
          companyName,
          ownerId: userRecord.uid,
          inviteCodeEncrypted: encryptInviteCode(plainInviteCode),
          inviteCodeHmac: hmacInviteCode(plainInviteCode),
          createdAt: admin.firestore.Timestamp.now(),
        })
      );
    }

    // Save user in Firestore (invite code is not stored on the user doc)
    const docData = removeUndefined({
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role,
      companyId,
      companyName: role === "companyOwner" ? companyName : undefined,
      emailVerified: true,
      createdAt: admin.firestore.Timestamp.now(),
    });

    await db.collection("users").doc(userRecord.uid).set(docData);

    // ---------------------------
    // STREAM UPSERT USER
    // ---------------------------
    try {
      const username = email.includes("@")
        ? email.split("@")[0]
        : email;

      await streamServer.upsertUser({
        id: userRecord.uid,
        name: `${firstName || ""} ${lastName || ""}`.trim() || email,
        email,
        username,
        firstName: firstName || "",
        lastName: lastName || "",
        role: "user", // Stream requires a valid role
      });

    } catch (error_) {
      console.error("Stream upsert error:", error_);
    }

    res.send({
      success: true,
      user: {
        uid: userRecord.uid,
        email,
        role,
        companyId,
      },
    });
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   SYNC ALL FIRESTORE USERS TO STREAM
---------------------------------------------------- */
app.post("/api/sync-stream-users", verifyFirebaseToken, async (req, res) => {
  try {
    // Verify the user is an administrator
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "administrator") {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }

    console.log("Starting Stream user sync...");
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map((d) => d.data());

    if (!users.length) {
      return res.json({
        success: false,
        message: "No users found in Firestore",
      });
    }

    let count = 0;

    for (const u of users) {
      const username =
        u.email?.includes("@")
          ? u.email.split("@")[0]
          : u.email || "";

      await streamServer.upsertUser({
        id: u.uid,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
        email: u.email,
        username,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        role: "user",
      });

      count++;
    }

    console.log(`Stream user sync complete: ${count} users.`);

    return res.json({
      success: true,
      count,
    });
  } catch (err) {
    console.error("Stream user sync failed:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* ----------------------------------------------------
   HELPER: Validate job input fields
---------------------------------------------------- */
app.post("/api/jobs", verifyFirebaseToken, async (req, res) => {
  try {
    const {
      companyId,
      name,
      description,
      majorsAssociated,
      applicationLink,
    } = req.body;

    // Validate required fields
    const validationError = validateJobInput(req.body);
    if (validationError) {
      return res.status(400).send({ success: false, error: validationError });
    }


    const authResult = await checkCompanyAuthorization(companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403).send({ success: false, error: authResult.error });
    }


    // Sanitize inputs (trim and remove null bytes)
    const sanitizedName = name.trim().replaceAll('\0', '');
    const sanitizedDescription = description.trim().replaceAll('\0', '');
    const sanitizedMajors = majorsAssociated.trim().replaceAll('\0', '');
    const sanitizedAppLink = applicationLink?.trim().replaceAll('\0', '') || undefined;

    const jobRef = await db.collection("jobs").add(
      removeUndefined({
        companyId,
        name: sanitizedName,
        description: sanitizedDescription,
        majorsAssociated: sanitizedMajors,
        applicationLink: sanitizedAppLink,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, jobId: jobRef.id });
  } catch (err) {
    console.error("Error adding job:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   GET JOBS BY COMPANY ID
---------------------------------------------------- */
app.get("/api/jobs", async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    // Query without orderBy to avoid composite index requirement
    // We'll sort in memory instead
    const jobsSnapshot = await db.collection("jobs")
      .where("companyId", "==", companyId)
      .get();

    const jobs = [];
    jobsSnapshot.forEach((doc) => {
      const data = doc.data();
      jobs.push({
        id: doc.id,
        companyId: data.companyId,
        name: data.name,
        description: data.description,
        majorsAssociated: data.majorsAssociated,
        applicationLink: data.applicationLink || null,
        createdAt: data.createdAt ? data.createdAt.toMillis() : null,
        applicationForm: data.applicationForm || null,
      });
    });

    // Sort by createdAt descending in memory
    jobs.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt - a.createdAt;
    });

    return res.json({ success: true, jobs });
  } catch (err) {
    console.error("Error fetching jobs:", err);
    return res.status(500).json({ error: "Failed to fetch jobs", details: err.message });
  }
});

/* ----------------------------------------------------
   UPDATE JOB
---------------------------------------------------- */
app.put("/api/jobs/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, majorsAssociated, applicationLink } = req.body;

    // Validate required fields
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: "Job title is required" });
    }

    if (!description?.trim()) {
      return res.status(400).json({ success: false, error: "Job description is required" });
    }

    if (!majorsAssociated?.trim()) {
      return res.status(400).json({ success: false, error: "Skills are required" });
    }

    // Validate application link format if provided
    if (applicationLink?.trim()) {
      try {
        new URL(applicationLink.trim());
      } catch {
        console.error("Invalid application URL provided");
        return res.status(400).json({ success: false, error: "Invalid application URL format" });
      }
    }

    const jobRef = db.collection("jobs").doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    // Verify the user is authorized for this job's company
    const jobData = jobDoc.data();

    const authResult = await checkCompanyAuthorization(jobData.companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403).json({ success: false, error: authResult.error });
    }

    await jobRef.update(
      removeUndefined({
        name: name.trim(),
        description: description.trim(),
        majorsAssociated: majorsAssociated.trim(),
        applicationLink: applicationLink?.trim() || null,
        updatedAt: admin.firestore.Timestamp.now(),
      })
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Error updating job:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   DELETE JOB
---------------------------------------------------- */
app.delete("/api/jobs/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;

    const jobRef = db.collection("jobs").doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    // Verify the user is authorized for this job's company
    const jobData = jobDoc.data();

    const authResult = await checkCompanyAuthorization(jobData.companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403).json({ success: false, error: authResult.error });
    }

    await jobRef.delete();

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting job:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   CREATE / UPDATE APPLICATION FORM ON A JOB
---------------------------------------------------- */
app.put("/api/jobs/:id/form", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;

    if (!formData || typeof formData !== "object") {
      return res.status(400).json({ success: false, error: "Form data is required" });
    }

    const jobRef = db.collection("jobs").doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyDoc = await db.collection("companies").doc(jobData.companyId).get();
    if (!companyDoc.exists) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const companyData = companyDoc.data();
    const reps = companyData.representativeIDs || [];
    if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: "Not authorized for this company" });
    }

    await jobRef.update({ applicationForm: formData });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving application form:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   DELETE APPLICATION FORM FROM A JOB
---------------------------------------------------- */
app.delete("/api/jobs/:id/form", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;

    const jobRef = db.collection("jobs").doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyDoc = await db.collection("companies").doc(jobData.companyId).get();
    if (!companyDoc.exists) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const companyData = companyDoc.data();
    const reps = companyData.representativeIDs || [];
    if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: "Not authorized for this company" });
    }

    await jobRef.update({ applicationForm: admin.firestore.FieldValue.delete() });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting application form:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   GET ALL SUBMISSIONS FOR A COMPANY
---------------------------------------------------- */
app.get("/api/companies/:companyId/submissions", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    const companyData = companyDoc.data();
    const reps = companyData.representativeIDs || [];
    if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: "Not authorized for this company" });
    }

    const snapshot = await db
      .collection("jobApplications")
      .where("companyId", "==", companyId)
      .get();

    const submissions = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));

    return res.json({ success: true, submissions });
  } catch (err) {
    console.error("Error fetching submissions:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   HELPER: Verify user is representative or company owner
---------------------------------------------------- */
async function verifyRepOrOwner(userId, companyId) {
  if (!userId) {
    return { error: "Missing userId", status: 400 };
  }

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    return { error: "User not found", status: 404 };
  }

  const userData = userDoc.data();

  // Allow administrators, company owners, and representatives
  if (userData.role === "administrator") {
    return null; // Admins can access everything
  }

  if (userData.role !== "representative" && userData.role !== "companyOwner") {
    return { error: "Only representatives and company owners can send invitations", status: 403 };
  }

  // If companyId is provided, verify the user belongs to that company
  if (companyId && userData.companyId !== companyId) {
    return { error: "You can only send invitations for your own company", status: 403 };
  }

  return null;
}

/* ----------------------------------------------------
   SEND JOB INVITATION(S) TO STUDENT(S)
---------------------------------------------------- */
app.post("/api/job-invitations/send", async (req, res) => {
  try {
    const { jobId, studentIds, message, sentVia, userId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required" });
    }

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: "At least one student ID is required" });
    }

    if (!sentVia || sentVia !== "notification") {
      return res.status(400).json({ error: "sentVia must be 'notification' (chat invitations are not supported)" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get the job to verify it exists and get company info
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyId = jobData.companyId;

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // Validate all student IDs exist and are students
    const studentChecks = await Promise.all(
      studentIds.map(async (studentId) => {
        const studentDoc = await db.collection("users").doc(studentId).get();
        if (!studentDoc.exists) {
          return { valid: false, id: studentId, error: "Student not found" };
        }
        const studentData = studentDoc.data();
        if (studentData.role !== "student") {
          return { valid: false, id: studentId, error: "User is not a student" };
        }
        return { valid: true, id: studentId };
      })
    );

    const invalidStudents = studentChecks.filter((check) => !check.valid);
    if (invalidStudents.length > 0) {
      return res.status(400).json({
        error: `Invalid student IDs: ${invalidStudents.map((s) => s.id).join(", ")}`,
      });
    }

    // Create invitation records
    const batch = db.batch();
    const invitationIds = [];

    console.log("Creating job invitation(s)");

    for (const studentId of studentIds) {
      const invitationRef = db.collection("jobInvitations").doc();
      invitationIds.push(invitationRef.id);

      const invitationData = removeUndefined({
        jobId,
        companyId,
        studentId,
        sentBy: userId,
        sentVia,
        status: "sent",
        sentAt: admin.firestore.Timestamp.now(),
        message: message || undefined,
      });

      console.log(`Creating invitation ${invitationRef.id} for student ${studentId}:`, invitationData);

      batch.set(invitationRef, invitationData);
    }

    await batch.commit();
    console.log(`Successfully created ${invitationIds.length} invitation(s)`);

    // Chat invitations are no longer supported - only dashboard notifications are used

    return res.json({
      success: true,
      invitationsSent: studentIds.length,
      invitationIds,
    });
  } catch (err) {
    console.error("Error sending job invitations:", err);
    return res.status(500).json({ error: "Failed to send invitations", details: err.message });
  }
});

/* ----------------------------------------------------
   GET INVITATIONS RECEIVED BY A STUDENT
---------------------------------------------------- */
app.get("/api/job-invitations/received", async (req, res) => {
  try {
    const { userId, status } = req.query;
    console.log("Fetching job invitations for student");

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Verify user exists and is a student
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    if (userData.role !== "student") {
      return res.status(403).json({ error: "Only students can view received invitations" });
    }

    // Build query (without orderBy to avoid needing a composite index)
    let query = db.collection("jobInvitations").where("studentId", "==", userId);

    if (status) {
      query = query.where("status", "==", status);
    }

    const invitationsSnapshot = await query.get();

    // Get job and company details for each invitation
    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();

        // Get job details
        let jobDetails = null;
        try {
          const jobDoc = await db.collection("jobs").doc(invData.jobId).get();
          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            jobDetails = {
              id: jobDoc.id,
              companyId: jobData.companyId,
              name: jobData.name,
              description: jobData.description,
              majorsAssociated: jobData.majorsAssociated,
              applicationLink: jobData.applicationLink || null,
              applicationForm: jobData.applicationForm || null,
            };
          }
        } catch (err) {
          console.error(`Error fetching job ${invData.jobId}:`, err);
        }

        // Get company details
        let companyDetails = null;
        try {
          const companyDoc = await db.collection("companies").doc(invData.companyId).get();
          if (companyDoc.exists) {
            const companyData = companyDoc.data();
            companyDetails = {
              id: companyDoc.id,
              companyName: companyData.companyName,
              boothId: companyData.boothId || null,
            };
          }
        } catch (err) {
          console.error(`Error fetching company ${invData.companyId}:`, err);
        }

        // Get sender details
        let senderDetails = null;
        try {
          const senderDoc = await db.collection("users").doc(invData.sentBy).get();
          if (senderDoc.exists) {
            const senderData = senderDoc.data();
            senderDetails = {
              id: senderDoc.id,
              firstName: senderData.firstName,
              lastName: senderData.lastName,
              email: senderData.email,
            };
          }
        } catch (err) {
          console.error(`Error fetching sender ${invData.sentBy}:`, err);
        }

        return {
          id: doc.id,
          jobId: invData.jobId,
          companyId: invData.companyId,
          studentId: invData.studentId,
          sentBy: invData.sentBy,
          sentVia: invData.sentVia,
          status: invData.status,
          sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
          viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
          clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
          message: invData.message || null,
          job: jobDetails,
          company: companyDetails,
          sender: senderDetails,
        };
      })
    );

    // Sort invitations by sentAt descending (newest first) in memory
    invitations.sort((a, b) => {
      if (!a.sentAt && !b.sentAt) return 0;
      if (!a.sentAt) return 1;
      if (!b.sentAt) return -1;
      return b.sentAt - a.sentAt;
    });

    return res.json({ invitations });
  } catch (err) {
    console.error("Error fetching received invitations:", err);
    return res.status(500).json({ error: "Failed to fetch invitations", details: err.message });
  }
});

/* ----------------------------------------------------
   GET SPECIFIC INVITATION BY ID
---------------------------------------------------- */
/* ----------------------------------------------------
   GET INVITATIONS SENT BY A REPRESENTATIVE
---------------------------------------------------- */
app.get("/api/job-invitations/sent", async (req, res) => {
  try {
    const { userId, companyId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // Build query - filter by sentBy or companyId based on what's provided
    let query;
    if (companyId) {
      query = db.collection("jobInvitations").where("companyId", "==", companyId);
    } else {
      query = db.collection("jobInvitations").where("sentBy", "==", userId);
    }

    const invitationsSnapshot = await query.orderBy("sentAt", "desc").get();

    // Get student, job details for each invitation
    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();

        // Get student details
        let studentDetails = null;
        try {
          const studentDoc = await db.collection("users").doc(invData.studentId).get();
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            studentDetails = {
              id: studentDoc.id,
              firstName: studentData.firstName,
              lastName: studentData.lastName,
              email: studentData.email,
            };
          }
        } catch (err) {
          console.error(`Error fetching student ${invData.studentId}:`, err);
        }

        // Get job details
        let jobDetails = null;
        try {
          const jobDoc = await db.collection("jobs").doc(invData.jobId).get();
          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            jobDetails = {
              id: jobDoc.id,
              name: jobData.name,
            };
          }
        } catch (err) {
          console.error(`Error fetching job ${invData.jobId}:`, err);
        }

        return {
          id: doc.id,
          jobId: invData.jobId,
          companyId: invData.companyId,
          studentId: invData.studentId,
          sentBy: invData.sentBy,
          sentVia: invData.sentVia,
          status: invData.status,
          sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
          viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
          clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
          message: invData.message || null,
          student: studentDetails,
          job: jobDetails,
        };
      })
    );

    return res.json({ invitations });
  } catch (err) {
    console.error("Error fetching sent invitations:", err);
    return res.status(500).json({ error: "Failed to fetch invitations", details: err.message });
  }
});

/* ----------------------------------------------------
   UPDATE JOB INVITATION STATUS
---------------------------------------------------- */
app.patch("/api/job-invitations/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, userId } = req.body;

    if (!status || !["viewed", "clicked"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'viewed' or 'clicked'" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const invitationRef = db.collection("jobInvitations").doc(id);
    const invitationDoc = await invitationRef.get();

    if (!invitationDoc.exists) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const invitationData = invitationDoc.data();

    // Verify the user is the intended recipient
    if (invitationData.studentId !== userId) {
      return res.status(403).json({ error: "You can only update your own invitations" });
    }

    const updateData = {
      status,
    };

    if (status === "viewed" && !invitationData.viewedAt) {
      updateData.viewedAt = admin.firestore.Timestamp.now();
    } else if (status === "clicked") {
      updateData.clickedAt = admin.firestore.Timestamp.now();
      // If not already viewed, mark as viewed too
      if (!invitationData.viewedAt) {
        updateData.viewedAt = admin.firestore.Timestamp.now();
      }
    }

    await invitationRef.update(updateData);

    return res.json({ success: true });
  } catch (err) {
    console.error("Error updating invitation status:", err);
    return res.status(500).json({ error: "Failed to update invitation status", details: err.message });
  }
});

/* ----------------------------------------------------
   GET LIST OF STUDENTS (for invitation UI)
---------------------------------------------------- */
app.get("/api/students", async (req, res) => {
  try {
    const { userId, search, major, boothId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Verify user is representative, company owner, or admin
    const authCheck = await verifyRepOrOwner(userId, null);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    let students = [];

    if (boothId) {
      // Find students who visited this specific booth
      console.log(`Filtering students who visited booth: ${JSON.stringify(boothId)}`);

      // Get all students first
      const allStudentsQuery = db.collection("users").where("role", "==", "student");
      const studentsSnapshot = await allStudentsQuery.get();

      // Check each student to see if they have a boothHistory document for this booth
      const studentPromises = studentsSnapshot.docs.map(async (studentDoc) => {
        const studentData = studentDoc.data();

        // Check if this student has visited the booth
        const boothHistoryDoc = await db.collection("users")
          .doc(studentDoc.id)
          .collection("boothHistory")
          .doc(boothId)
          .get();

        if (boothHistoryDoc.exists) {
          return {
            id: studentDoc.id,
            firstName: studentData.firstName || "",
            lastName: studentData.lastName || "",
            email: studentData.email || "",
            major: studentData.major || "",
          };
        }
        return null;
      });

      students = (await Promise.all(studentPromises)).filter(s => s !== null);
      console.log(`Found ${students.length} students who visited booth`);
    } else {
      // Get all students (existing logic)
      let query = db.collection("users").where("role", "==", "student");
      const studentsSnapshot = await query.get();

      students = studentsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          email: data.email || "",
          major: data.major || "",
        };
      });
    }

    // Apply search filter if provided
    if (search?.trim()) {
      const searchLower = search.toLowerCase().trim();
      students = students.filter((student) => {
        const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
        return (
          fullName.includes(searchLower) ||
          student.email.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply major filter if provided
    if (major?.trim()) {
      const majorLower = major.toLowerCase().trim();
      students = students.filter((student) =>
        student.major.toLowerCase().includes(majorLower)
      );
    }

    console.log(`Returning ${students.length} students`);
    return res.json({ students });
  } catch (err) {
    console.error("Error fetching students:", err);
    return res.status(500).json({ error: "Failed to fetch students", details: err.message });
  }
});

/* ----------------------------------------------------
   GET INVITATION STATS FOR A JOB
---------------------------------------------------- */
app.get("/api/job-invitations/stats/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get the job to verify it exists and get company info
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyId = jobData.companyId;

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // Get all invitations for this job
    const invitationsSnapshot = await db
      .collection("jobInvitations")
      .where("jobId", "==", jobId)
      .get();

    const totalSent = invitationsSnapshot.size;
    let totalViewed = 0;
    let totalClicked = 0;

    invitationsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.viewedAt) totalViewed++;
      if (data.clickedAt) totalClicked++;
    });

    return res.json({
      totalSent,
      totalViewed,
      totalClicked,
      viewRate: totalSent > 0 ? ((totalViewed / totalSent) * 100).toFixed(1) : "0",
      clickRate: totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : "0",
    });
  } catch (err) {
    console.error("Error fetching invitation stats:", err);
    return res.status(500).json({ error: "Failed to fetch stats", details: err.message });
  }
});

/* ----------------------------------------------------
   GET DETAILED INVITATION DATA FOR A JOB
---------------------------------------------------- */
app.get("/api/job-invitations/details/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get the job to verify it exists and get company info
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobData = jobDoc.data();
    const companyId = jobData.companyId;

    // Verify user has permission
    const authCheck = await verifyRepOrOwner(userId, companyId);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // Get all invitations for this job with student details
    const invitationsSnapshot = await db
      .collection("jobInvitations")
      .where("jobId", "==", jobId)
      .get();

    const invitations = await Promise.all(
      invitationsSnapshot.docs.map(async (doc) => {
        const invData = doc.data();

        // Get student details
        let studentDetails = null;
        try {
          const studentDoc = await db.collection("users").doc(invData.studentId).get();
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            studentDetails = {
              id: studentDoc.id,
              firstName: studentData.firstName || "",
              lastName: studentData.lastName || "",
              email: studentData.email || "",
              major: studentData.major || "",
            };
          }
        } catch (err) {
          console.error(`Error fetching student ${invData.studentId}:`, err);
        }

        return {
          id: doc.id,
          studentId: invData.studentId,
          student: studentDetails,
          status: invData.status,
          sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
          viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
          clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
          message: invData.message || null,
        };
      })
    );

    // Sort by sentAt descending (newest first)
    invitations.sort((a, b) => {
      if (!a.sentAt && !b.sentAt) return 0;
      if (!a.sentAt) return 1;
      if (!b.sentAt) return -1;
      return b.sentAt - a.sentAt;
    });

    return res.json({ invitations });
  } catch (err) {
    console.error("Error fetching detailed invitations:", err);
    return res.status(500).json({ error: "Failed to fetch invitation details", details: err.message });
  }
});

/* ----------------------------------------------------
   GET SPECIFIC INVITATION BY ID (Dynamic route - must be last)
---------------------------------------------------- */
app.get("/api/job-invitations/:invitationId", verifyFirebaseToken, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const authUser = req.user;

    if (!invitationId) {
      return res.status(400).json({ error: "Invitation ID is required" });
    }

    // Fetch the invitation
    const invDoc = await db.collection("jobInvitations").doc(invitationId).get();
    if (!invDoc.exists) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const invData = invDoc.data();

    // Verify the user has permission to view this invitation (must be the recipient)
    if (invData.studentId !== authUser.uid) {
      return res.status(403).json({ error: "Not authorized to view this invitation" });
    }

    // Get job details
    let jobDetails = null;
    try {
      const jobDoc = await db.collection("jobs").doc(invData.jobId).get();
      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        jobDetails = {
          id: jobDoc.id,
          name: jobData.name,
          description: jobData.description,
          majorsAssociated: jobData.majorsAssociated,
          applicationLink: jobData.applicationLink || null,
        };
      }
    } catch (err) {
      console.error(`Error fetching job ${invData.jobId}:`, err);
    }

    // Get company details
    let companyDetails = null;
    try {
      const companyDoc = await db.collection("companies").doc(invData.companyId).get();
      if (companyDoc.exists) {
        const companyData = companyDoc.data();
        companyDetails = {
          id: companyDoc.id,
          companyName: companyData.companyName,
          boothId: companyData.boothId || null,
        };
      }
    } catch (err) {
      console.error(`Error fetching company ${invData.companyId}:`, err);
    }

    // Get sender details
    let senderDetails = null;
    try {
      const senderDoc = await db.collection("users").doc(invData.sentBy).get();
      if (senderDoc.exists) {
        const senderData = senderDoc.data();
        senderDetails = {
          id: senderDoc.id,
          firstName: senderData.firstName,
          lastName: senderData.lastName,
          email: senderData.email,
        };
      }
    } catch (err) {
      console.error(`Error fetching sender ${invData.sentBy}:`, err);
    }

    const invitation = {
      id: invDoc.id,
      jobId: invData.jobId,
      companyId: invData.companyId,
      studentId: invData.studentId,
      sentBy: invData.sentBy,
      sentVia: invData.sentVia,
      status: invData.status,
      sentAt: invData.sentAt ? invData.sentAt.toMillis() : null,
      viewedAt: invData.viewedAt ? invData.viewedAt.toMillis() : null,
      clickedAt: invData.clickedAt ? invData.clickedAt.toMillis() : null,
      message: invData.message || null,
      job: jobDetails,
      company: companyDetails,
      sender: senderDetails,
    };

    return res.json({ data: invitation });
  } catch (err) {
    console.error("Error fetching invitation:", err);
    return res.status(500).json({ error: "Failed to fetch invitation", details: err.message });
  }
});

/* ----------------------------------------------------
   ADD BOOTH
---------------------------------------------------- */
app.post("/api/booths", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId, boothName, location, description, representatives } =
      req.body;

    if (!companyId || !boothName) {
      return res
        .status(400)
        .send({ success: false, error: "Missing required fields" });
    }

    // Validate input lengths
    if (boothName && boothName.length > 200) {
      return res
        .status(400)
        .send({ success: false, error: "Booth name must be 200 characters or less" });
    }

    if (location && location.length > 200) {
      return res
        .status(400)
        .send({ success: false, error: "Location must be 200 characters or less" });
    }

    if (description && description.length > 2000) {
      return res
        .status(400)
        .send({ success: false, error: "Description must be 2000 characters or less" });
    }


    const authResult = await checkCompanyAuthorization(companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403).send({ success: false, error: authResult.error });
    }


    // Sanitize text inputs (trim whitespace, remove null bytes)
    const sanitizedBoothName = boothName ? boothName.trim().replaceAll('\0', '') : boothName;
    const sanitizedLocation = location ? location.trim().replaceAll('\0', '') : location;
    const sanitizedDescription = description ? description.trim().replaceAll('\0', '') : description;

    const boothRef = await db.collection("booths").add(
      removeUndefined({
        companyId,
        boothName: sanitizedBoothName,
        location: sanitizedLocation,
        description: sanitizedDescription,
        representatives,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, boothId: boothRef.id });
  } catch (err) {
    console.error("Error adding booth:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

app.post("/api/resume/parse", verifyFirebaseToken, async (req, res) => {
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
    
    // DEBUG: Log what was extracted
    console.log("[PARSE RESUME] Raw text first 500 chars:", rawText.substring(0, 500));
    console.log("[PARSE RESUME] Structured sections found:", {
      summaryLength: structured.summary?.text?.length || 0,
      skillsCount: structured.skills?.items?.length || 0,
      experienceCount: structured.experience?.length || 0,
      projectsCount: structured.projects?.length || 0,
    });

    // 5) Save parsed data to main user document (not subcollection for efficiency)
    await userRef.set(
      {
        currentResumeId: resumeId,
        currentResumePath: resumePath,
        resumePath: resumePath,
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

/* ----------------------------------------------------
   HELPER: Evaluate if fair should be live based on schedules
   Checks all schedules - fair is live if ANY schedule is active
---------------------------------------------------- */
async function evaluateFairStatus() {
  try {
    const now = admin.firestore.Timestamp.now();

    // Check all schedules in the schedules collection
    const schedulesSnapshot = await db.collection("fairSchedules").get();

    // Check if any schedule is currently active
    for (const scheduleDoc of schedulesSnapshot.docs) {
      const scheduleData = scheduleDoc.data();

      if (scheduleData.startTime && scheduleData.endTime) {
        const startTime = scheduleData.startTime;
        const endTime = scheduleData.endTime;

        // Check if current time is within this schedule's range
        if (now.toMillis() >= startTime.toMillis() && now.toMillis() <= endTime.toMillis()) {
          return {
            isLive: true,
            source: "schedule",
            activeScheduleId: scheduleDoc.id,
            activeScheduleName: scheduleData.name || null,
            activeScheduleDescription: scheduleData.description || null
          };
        }
      }
    }

    // No active schedules found, check manual toggle status
    const statusDoc = await db.collection("fairSettings").doc("liveStatus").get();
    if (!statusDoc.exists) {
      return { isLive: false, source: "manual" };
    }

    const data = statusDoc.data();
    return { isLive: data.isLive || false, source: "manual" };
  } catch (err) {
    console.error("Error evaluating fair status:", err);
    // Fallback to manual status on error
    const statusDoc = await db.collection("fairSettings").doc("liveStatus").get();
    if (!statusDoc.exists) {
      return { isLive: false, source: "manual" };
    }
    const data = statusDoc.data();
    return { isLive: data.isLive || false, source: "manual" };
  }
}

/* ----------------------------------------------------
   GET CAREER FAIR LIVE STATUS
---------------------------------------------------- */
app.get("/api/fair-status", async (req, res) => {
  try {
    const status = await evaluateFairStatus();
    return res.json({
      isLive: status.isLive,
      source: status.source,
      scheduleName: status.activeScheduleName || null,
      scheduleDescription: status.activeScheduleDescription || null
    });
  } catch (err) {
    console.error("Error fetching fair status:", err);
    return res.status(500).json({ error: "Failed to fetch fair status" });
  }
});

/* ----------------------------------------------------
   TOGGLE CAREER FAIR LIVE STATUS (Admin only)
   Note: Manual toggle will override schedule temporarily
---------------------------------------------------- */
app.post("/api/toggle-fair-status", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Verify user is administrator
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    if (userData.role !== "administrator") {
      return res.status(403).json({ error: "Only administrators can toggle fair status" });
    }

    // Get current evaluated status (combines schedule + manual)
    const currentStatus = await evaluateFairStatus();

    // Toggle based on the current evaluated status
    const newStatus = !currentStatus.isLive;

    // Update manual status (this overrides any schedule)
    const statusRef = db.collection("fairSettings").doc("liveStatus");
    await statusRef.set({
      isLive: newStatus,
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: userId,
    }, { merge: true });

    // Manual toggle disables all schedules to allow manual override
    // Note: We don't disable schedules here - manual toggle takes precedence
    // Schedules will be re-evaluated when manual toggle is turned off

    return res.json({ success: true, isLive: newStatus });
  } catch (err) {
    console.error("Error toggling fair status:", err);
    return res.status(500).json({ error: "Failed to toggle fair status" });
  }
});

/* ----------------------------------------------------
   GET ALL FAIR SCHEDULES (Admin only)
---------------------------------------------------- */
app.get("/api/fair-schedules", async (req, res) => {
  try {
    const userId = req.query.userId;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    const schedulesSnapshot = await db.collection("fairSchedules")
      .orderBy("startTime", "asc")
      .get();

    const schedules = [];
    schedulesSnapshot.forEach((doc) => {
      const data = doc.data();
      schedules.push({
        id: doc.id,
        name: data.name || null,
        startTime: data.startTime ? data.startTime.toMillis() : null,
        endTime: data.endTime ? data.endTime.toMillis() : null,
        description: data.description || null,
        createdAt: data.createdAt ? data.createdAt.toMillis() : null,
        updatedAt: data.updatedAt ? data.updatedAt.toMillis() : null,
        createdBy: data.createdBy || null,
        updatedBy: data.updatedBy || null,
      });
    });

    return res.json({ schedules });
  } catch (err) {
    console.error("Error fetching fair schedules:", err);
    return res.status(500).json({ error: "Failed to fetch fair schedules" });
  }
});

/* ----------------------------------------------------
   GET PUBLIC FAIR SCHEDULES (All users)
---------------------------------------------------- */
app.get("/api/public/fair-schedules", async (req, res) => {
  try {
    // Get all schedules (no orderBy to avoid composite index requirement)
    const schedulesSnapshot = await db.collection("fairSchedules").get();

    const schedules = [];
    schedulesSnapshot.forEach((doc) => {
      const data = doc.data();
      schedules.push({
        id: doc.id,
        name: data.name || null,
        startTime: data.startTime ? data.startTime.toMillis() : null,
        endTime: data.endTime ? data.endTime.toMillis() : null,
        description: data.description || null,
      });
    });

    // Sort by start time in memory (ascending)
    schedules.sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime - b.startTime;
    });

    return res.json({ schedules });
  } catch (err) {
    console.error("Error fetching public fair schedules:", err);
    return res.status(500).json({ error: "Failed to fetch fair schedules" });
  }
});

/* ----------------------------------------------------
   CREATE FAIR SCHEDULE (Admin only)
---------------------------------------------------- */
app.post("/api/fair-schedules", async (req, res) => {
  try {
    const { userId, name, startTime, endTime, description } = req.body;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: "Start time and end time are required" });
    }

    // Parse dates as UTC to ensure consistent storage
    const start = parseUTCToTimestamp(startTime);
    const end = parseUTCToTimestamp(endTime);
    if (end.toMillis() <= start.toMillis()) {
      return res.status(400).json({ error: "End time must be after start time" });
    }

    // Create schedule document
    const scheduleData = {
      name: name || null,
      description: description || null,
      startTime: start,
      endTime: end,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      createdBy: userId,
      updatedBy: userId,
    };

    const scheduleRef = await db.collection("fairSchedules").add(scheduleData);

    return res.json({
      success: true,
      schedule: {
        id: scheduleRef.id,
        name: scheduleData.name,
        startTime: start.toMillis(),
        endTime: end.toMillis(),
        description: scheduleData.description,
      },
    });
  } catch (err) {
    console.error("Error creating fair schedule:", err);
    return res.status(500).json({ error: "Failed to create fair schedule" });
  }
});

/**
 * Resolves schedule times for updates, using existing values as fallback.
 * Returns { start, end } or null if validation fails.
 */
function resolveScheduleTimes(existingData, startTime, endTime) {
  const start = startTime === undefined
    ? existingData.startTime
    : parseUTCToTimestamp(startTime);
  const end = endTime === undefined
    ? existingData.endTime
    : parseUTCToTimestamp(endTime);

  if (!start || !end) return { error: "Both start time and end time are required" };
  if (end.toMillis() <= start.toMillis()) return { error: "End time must be after start time" };
  return { start, end };
}

/* ----------------------------------------------------
   UPDATE FAIR SCHEDULE (Admin only)
---------------------------------------------------- */
app.put("/api/fair-schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, name, startTime, endTime, description } = req.body;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    const scheduleRef = db.collection("fairSchedules").doc(id);
    const scheduleDoc = await scheduleRef.get();

    if (!scheduleDoc.exists) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const updateData = {
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: userId,
    };

    // Update fields if provided
    if (name !== undefined) updateData.name = name || null;
    if (description !== undefined) updateData.description = description || null;

    if (startTime !== undefined || endTime !== undefined) {
      const timeResult = resolveScheduleTimes(scheduleDoc.data(), startTime, endTime);
      if (timeResult.error) {
        return res.status(400).json({ error: timeResult.error });
      }
      updateData.startTime = timeResult.start;
      updateData.endTime = timeResult.end;
    }

    await scheduleRef.update(updateData);

    const updatedDoc = await scheduleRef.get();
    const updatedData = updatedDoc.data();

    return res.json({
      success: true,
      schedule: {
        id: updatedDoc.id,
        name: updatedData.name || null,
        startTime: updatedData.startTime ? updatedData.startTime.toMillis() : null,
        endTime: updatedData.endTime ? updatedData.endTime.toMillis() : null,
        description: updatedData.description || null,
      },
    });
  } catch (err) {
    console.error("Error updating fair schedule:", err);
    return res.status(500).json({ error: "Failed to update fair schedule" });
  }
});

/* ----------------------------------------------------
   DELETE FAIR SCHEDULE (Admin only)
---------------------------------------------------- */
app.delete("/api/fair-schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId;

    const adminCheck = await verifyAdmin(userId);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    const scheduleRef = db.collection("fairSchedules").doc(id);
    const scheduleDoc = await scheduleRef.get();

    if (!scheduleDoc.exists) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    await scheduleRef.delete();

    return res.json({ success: true, message: "Schedule deleted successfully" });
  } catch (err) {
    console.error("Error deleting fair schedule:", err);
    return res.status(500).json({ error: "Failed to delete fair schedule" });
  }
});

/* ----------------------------------------------------
   UPDATE COMPANY INVITE CODE (Owner only)
---------------------------------------------------- */
app.post("/api/update-invite-code", async (req, res) => {
  try {
    const { companyId, userId, newInviteCode } = req.body;

    if (!companyId || !userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify user is the owner of the company
    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res.status(404).json({ error: "Company not found" });
    }

    const companyData = companyDoc.data();
    if (companyData.ownerId !== userId) {
      return res.status(403).json({ error: "Only the company owner can update the invite code" });
    }

    // Generate new invite code if not provided, or validate provided one
    let inviteCode;
    if (newInviteCode) {
      // Validate custom invite code (alphanumeric, 4-20 characters)
      if (!/^[A-Z0-9]{4,20}$/.test(newInviteCode.toUpperCase())) {
        return res.status(400).json({
          error: "Invite code must be 4-20 characters and contain only letters and numbers"
        });
      }
      inviteCode = newInviteCode.toUpperCase();
    } else {
      // Generate random 8-character code
      inviteCode = generateInviteCode();
    }

    // Duplicate check: compare by HMAC so we never store/compare plaintext
    const newHmac = hmacInviteCode(inviteCode);
    const companiesSnapshot = await db.collection("companies").get();
    const companiesWithCode = companiesSnapshot.docs.filter(
      (doc) => doc.data().inviteCodeHmac === newHmac && doc.id !== companyId
    );

    if (companiesWithCode.length > 0) {
      return res.status(400).json({ error: "This invite code is already in use by another company" });
    }

    // Atomic update — store encrypted blob + HMAC index; no plaintext
    await db.runTransaction(async (transaction) => {
      const companyRef = db.collection("companies").doc(companyId);
      const companySnap = await transaction.get(companyRef);

      if (!companySnap.exists) {
        throw new Error("Company not found");
      }

      transaction.update(companyRef, {
        inviteCodeEncrypted: encryptInviteCode(inviteCode),
        inviteCodeHmac: newHmac,
        inviteCodeUpdatedAt: admin.firestore.Timestamp.now(),
      });
    });

    return res.json({ success: true, inviteCode });
  } catch (err) {
    console.error("Error updating invite code:", err);
    return res.status(500).json({ error: "Failed to update invite code" });
  }
});

/* ----------------------------------------------------
   CREATE COMPANY (Auth required — company owners)
---------------------------------------------------- */
app.post("/api/companies", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyName } = req.body;
    const ownerId = req.user.uid;

    if (!companyName?.trim()) {
      return res.status(400).json({ error: "Company name is required" });
    }

    const userDoc = await db.collection("users").doc(ownerId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().role !== "companyOwner") {
      return res.status(403).json({ error: "Only company owners can create companies" });
    }

    const rawCode = generateInviteCode();
    const companyRef = db.collection("companies").doc();
    const companyId = companyRef.id;

    await companyRef.set(removeUndefined({
      companyId,
      companyName: companyName.trim(),
      ownerId,
      inviteCodeEncrypted: encryptInviteCode(rawCode),
      inviteCodeHmac: hmacInviteCode(rawCode),
      createdAt: admin.firestore.Timestamp.now(),
    }));

    // Update user doc with companyId (no invite code stored on user)
    await db.collection("users").doc(ownerId).update({ companyId, companyName: companyName.trim() });

    return res.status(201).json({ companyId, inviteCode: rawCode });
  } catch (err) {
    console.error("POST /api/companies error:", err);
    return res.status(500).json({ error: "Failed to create company" });
  }
});

/* ----------------------------------------------------
   LINK REPRESENTATIVE TO COMPANY via invite code
---------------------------------------------------- */
app.post("/api/link-company", verifyFirebaseToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user.uid;

    if (!inviteCode?.trim()) {
      return res.status(400).json({ error: "Invite code is required" });
    }

    const codeHmac = hmacInviteCode(inviteCode.trim());
    const companiesSnap = await db.collection("companies").where("inviteCodeHmac", "==", codeHmac).get();
    if (companiesSnap.empty) return res.status(400).json({ error: "Invalid invite code." });

    const companyDoc = companiesSnap.docs[0];
    const companyId = companyDoc.id;
    const { companyName, representativeIDs = [] } = companyDoc.data();

    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().companyId === companyId) {
      return res.status(400).json({ error: "You are already linked to this company." });
    }

    await db.runTransaction(async (transaction) => {
      transaction.update(db.collection("companies").doc(companyId), {
        representativeIDs: [...new Set([...representativeIDs, userId])],
      });
      transaction.update(db.collection("users").doc(userId), { companyId, companyName });
    });

    return res.json({ companyId, companyName });
  } catch (err) {
    console.error("POST /api/link-company error:", err);
    return res.status(500).json({ error: "Failed to link company" });
  }
});

/* ----------------------------------------------------
   GET COMPANY INVITE CODE (owner or admin only)
---------------------------------------------------- */
app.get("/api/companies/:companyId/invite-code", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const requestingUid = req.user.uid;

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) return res.status(404).json({ error: "Company not found" });

    const { ownerId, inviteCodeEncrypted } = companyDoc.data();

    const userDoc = await db.collection("users").doc(requestingUid).get();
    const isAdmin = userDoc.exists && userDoc.data().role === "administrator";
    const isOwner = ownerId === requestingUid;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: "Only the company owner or an admin can view the invite code" });
    }

    if (!inviteCodeEncrypted) {
      return res.status(404).json({ error: "No invite code found. Please generate one." });
    }

    const inviteCode = decryptInviteCode(inviteCodeEncrypted);
    return res.json({ inviteCode });
  } catch (err) {
    console.error("GET /api/companies/:companyId/invite-code error:", err);
    return res.status(500).json({ error: "Failed to retrieve invite code" });
  }
});

/* ----------------------------------------------------
   CREATE ADMIN ACCOUNT (Protected - requires secret key)
---------------------------------------------------- */
app.post("/api/create-admin", async (req, res) => {
  try {
    const { firstName, lastName, email, password, adminSecret } = req.body;

    if (!email || !password || !adminSecret) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify admin secret key
    const expectedSecret = process.env.ADMIN_SECRET_KEY;
    if (!expectedSecret) {
      console.error("ADMIN_SECRET_KEY not set in environment variables");
      return res.status(500).json({ error: "Server configuration error" });
    }

    if (adminSecret !== expectedSecret) {
      return res.status(403).json({ error: "Invalid admin secret key" });
    }

    // Check if user already exists
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      // User exists, check if they're already an admin
      const userDoc = await db.collection("users").doc(userRecord.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.role === "administrator") {
          return res.status(400).json({ error: "User is already an administrator" });
        }
        // Update existing user to admin
        await db.collection("users").doc(userRecord.uid).update({
          role: "administrator",
        });
        return res.json({
          success: true,
          message: "User upgraded to administrator",
          uid: userRecord.uid
        });
      }
    } catch (err) {
      if (err.code !== "auth/user-not-found") {
        throw err;
      }
      // User doesn't exist, create new one
    }

    // Create new Firebase Auth user
    if (!userRecord) {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: `${firstName || ""} ${lastName || ""}`.trim(),
        emailVerified: true, // Auto-verify admin emails
      });
    }

    // Save user in Firestore
    const docData = removeUndefined({
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role: "administrator",
      emailVerified: true,
      createdAt: admin.firestore.Timestamp.now(),
    });

    await db.collection("users").doc(userRecord.uid).set(docData, { merge: true });

    // Upsert to Stream Chat
    try {
      const username = email.includes("@")
        ? email.split("@")[0]
        : email;

      await streamServer.upsertUser({
        id: userRecord.uid,
        name: `${firstName || ""} ${lastName || ""}`.trim() || email,
        email,
        username,
        firstName: firstName || "",
        lastName: lastName || "",
        role: "user",
      });
    } catch (error_) {
      console.error("STREAM UPSERT ERROR:", error_);
    }

    return res.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email,
        role: "administrator",
      },
    });
  } catch (err) {
    console.error("Error creating admin:", err);
    return res.status(500).json({ error: err.message || "Failed to create admin account" });
  }
});

function extractFirstJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeTokens(s) {
  return (s || "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9+.#%/\- ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function containsNewNumbers(beforeText, afterText) {
  const nums = (t) => (t.match(/\b\d+(\.\d+)?%?\b/g) || []);
  const b = new Set(nums(beforeText));
  for (const n of nums(afterText)) {
    if (!b.has(n)) return true;
  }
  return false;
}

const GENERIC_VERBS = new Set(["and", "the", "with", "for", "to", "from", "using", "built", "created", "worked", "led", "used"]);

/**
 * Finds suspicious new tokens in afterText that aren't in the original or allowed skills.
 */
function findSuspiciousTokens(original, afterText, allowedSkills) {
  const origTokens = new Set(normalizeTokens(original));
  const newTokens = normalizeTokens(afterText).filter(t => !origTokens.has(t));
  return newTokens.filter(t =>
    t.length >= 3 && !GENERIC_VERBS.has(t) && !allowedSkills.has(t)
  );
}

/**
 * Parses Gemini JSON response, attempting extraction if direct parse fails.
 * Returns { parsed } on success, or { error, raw } on failure.
 */
function parseGeminiJson(text) {
  try {
    return { parsed: JSON.parse(text) };
  } catch (error_) {
    console.warn("JSON.parse failed, attempting extraction:", error_.message);
    const extracted = extractFirstJsonObject(text);
    if (!extracted) {
      return { error: "Gemini did not return valid JSON", raw: (text || "").slice(0, 1500) };
    }
    try {
      return { parsed: JSON.parse(extracted) };
    } catch (error__) {
      console.warn("Extracted JSON also failed to parse:", error__.message);
      return { error: "Gemini returned malformed JSON", raw: extracted.slice(0, 1500) };
    }
  }
}

/**
 * Build a Map of bulletId -> text from structured experience and projects.
 */
function buildBulletMap(structured) {
  const bulletMap = new Map();
  for (const exp of structured.experience || []) {
    for (const b of exp.bullets || []) bulletMap.set(b.bulletId, b.text);
  }
  for (const proj of structured.projects || []) {
    for (const b of proj.bullets || []) bulletMap.set(b.bulletId, b.text);
  }
  return bulletMap;
}

/**
 * Resolve original text for a patch type. Returns null for unknown types.
 */
function resolveOriginalText(type, summaryText, bulletMap, targetBulletId) {
  if (type === "replace_summary") return summaryText;
  if (type === "replace_bullet") return bulletMap.get(targetBulletId) || "";
  if (type === "insert_bullet") return "";
  return null;
}

function verifyPatches(structured, patchResponse) {
  const issues = [];
  const allowedSkills = new Set((structured?.skills?.items || []).map(s => (s || "").toLowerCase()));
  const bulletMap = buildBulletMap(structured);
  const summaryText = structured?.summary?.text || "";

  const verifiedPatches = [];
  for (const p of patchResponse.patches || []) {
    const type = p.type;
    const afterText = p.afterText || "";

    // Basic shape checks
    if (!p.opId || !type || !p.target || typeof afterText !== "string") {
      issues.push({ opId: p.opId || null, level: "reject", reason: "Malformed patch" });
      continue;
    }

    // Determine beforeText from original
    const original = resolveOriginalText(type, summaryText, bulletMap, p.target.bulletId);
    if (original === null) {
      issues.push({ opId: p.opId, level: "reject", reason: `Unknown patch type: ${type}` });
      continue;
    }

    // Enforce: beforeText must match original for replace ops
    if ((type === "replace_summary" || type === "replace_bullet") && p.beforeText !== original) {
      issues.push({ opId: p.opId, level: "reject", reason: "beforeText does not match original text" });
      continue;
    }

    // Flag suspicious new tokens not in resume skills list
    const suspiciousNew = findSuspiciousTokens(original, afterText, allowedSkills);
    if (suspiciousNew.length > 0) {
      issues.push({
        opId: p.opId,
        level: "flag",
        reason: "Introduces potentially new tools/skills not in resume skills list",
        tokens: suspiciousNew.slice(0, 10),
      });
    }

    verifiedPatches.push(p);
  }

  return { verifiedPatches, issues };
}

app.post("/api/resume/tailor", verifyFirebaseToken, async (req, res) => {
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
- beforeText must exactly match the original bullet/summary text you’re editing.
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
app.post("/api/resume/tailor/simple", verifyFirebaseToken, async (req, res) => {
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
    const { generateResumeChanges } = require("./resumeTailorSimple");
    console.log("[TAILOR SIMPLE] About to call generateResumeChanges");
    const changes = await generateResumeChanges(resumeRawText, jobDescription, jobTitle);
    
    console.log("[TAILOR SIMPLE] Generated", changes.length, "changes");
    if (changes.length > 0) {
      console.log("[TAILOR SIMPLE] First change:", JSON.stringify(changes[0], null, 2));
    }

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
app.post("/api/resume/tailored/simple/save", verifyFirebaseToken, async (req, res) => {
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
    const { applyChanges, reformatResumeWithGemini } = require("./resumeTailorSimple");
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

/**
 * Attempt to extract meaningful text from a patch's reason field.
 * Returns null if no useful text could be extracted.
 */
function extractTextFromReason(reason, patchType) {
  const quotedMatch = reason.match(/"([^"]+)"/);
  if (quotedMatch) return quotedMatch[1];

  const reasonWords = reason.split(/[,:]/)[0].trim();
  const words = reasonWords.split(/\s+/);
  if (words.length === 0) return null;

  if (patchType === "suppress_section") {
    const match = reasonWords.match(/["']?([A-Z][a-z0-9\s&-]{1,50}?)["']?\s+(?:project|job|role|position|experience)/i);
    return match ? match[1] : reasonWords.substring(0, 50);
  }
  return words.slice(0, 3).join(" ");
}

/**
 * Extracts removedText for a removal patch using multiple strategies.
 */
function extractRemovedText(patch) {
  // Strategy 1: Use skillName for skill removals
  if (patch.type === "remove_skill" && patch.target?.skillName) {
    return patch.target.skillName;
  }
  // Strategy 2: Use beforeText for bullet removals
  if (patch.type === "remove_bullet" && patch.beforeText) {
    return patch.beforeText;
  }
  // Strategy 3: Extract from reason field
  if (patch.reason) {
    const fromReason = extractTextFromReason(patch.reason, patch.type);
    if (fromReason) return fromReason;
  }
  return patch.type === "suppress_section" ? "(project/job)" : "(item)";
}

/**
 * Normalize a removal patch by ensuring removedText and removalReason fields exist.
 */
function normalizeRemovalPatch(patch, idx) {
  if (!["remove_skill", "remove_bullet", "suppress_section"].includes(patch.type)) {
    return patch;
  }

  console.log(`[TAILOR] Processing removal patch ${idx}:`, {
    type: patch.type,
    hasRemovedText: !!patch.removedText,
    removedTextValue: patch.removedText,
    skillName: patch.target?.skillName,
    beforeText: patch.beforeText,
    reason: patch.reason
  });

  if (!patch.removedText || patch.removedText === "undefined" || patch.removedText === null) {
    patch.removedText = extractRemovedText(patch);
  }

  if (!patch.removalReason || patch.removalReason === "undefined" || patch.removalReason === null) {
    patch.removalReason = patch.reason || "Not relevant to this position";
  }

  console.log(`[TAILOR] After normalization patch ${idx}:`, {
    removedText: patch.removedText,
    removalReason: patch.removalReason
  });
  return patch;
}

/**
 * Find a matching experience entry by text search.
 */
function findMatchingExperience(entries, removedText, parentId) {
  const searchText = (removedText || parentId).toLowerCase();
  return entries.find(exp => {
    const fullText = `${exp.title || ''} ${exp.company || ''}`.toLowerCase();
    return fullText.includes(searchText) || searchText.includes((exp.title || '').toLowerCase());
  });
}

/**
 * Find a matching project entry by text search.
 */
function findMatchingProject(entries, removedText, parentId) {
  const searchText = (removedText || parentId).toLowerCase();
  return entries.find(proj => (proj.name || '').toLowerCase().includes(searchText));
}

/**
 * Map parentId for a suppress_section patch to the actual expId/projId.
 */
function mapSuppressSectionParentId(patch, structured) {
  const { section, parentId, removedText } = patch.target;

  if (section === "experience") {
    const matchedExp = findMatchingExperience(structured.experience || [], removedText, parentId);
    if (matchedExp) {
      console.log(`[TAILOR] Mapped experience parentId "${parentId}" to expId "${matchedExp.expId}"`);
      patch.target.parentId = matchedExp.expId;
    } else {
      console.log(`[TAILOR] WARNING: Could not map experience parentId "${parentId}". Will try text match in applier.`);
    }
  } else if (section === "projects") {
    const matchedProj = findMatchingProject(structured.projects || [], removedText, parentId);
    if (matchedProj) {
      console.log(`[TAILOR] Mapped project parentId "${parentId}" to projId "${matchedProj.projId}"`);
      patch.target.parentId = matchedProj.projId;
    }
  }
}

/**
 * Map text-based parentIds in patches to actual expIds/projIds from structured resume.
 */
function mapPatchParentIds(patch, structured) {
  if (patch.type === "suppress_section" && patch.target?.parentId) {
    mapSuppressSectionParentId(patch, structured);
  }
  
  // For remove_bullet patches, log text matching info
  if (patch.type === "remove_bullet" && patch.target?.bulletId) {
    const { section, removedText } = patch.target;
    if (section === "education" || section === "leadership_activities") {
      console.log(`[TAILOR] ${section} bullet removal will be matched by text: "${removedText}"`);
    }
  }
  
  return patch;
}

/**
 * Log debug information for the tailor/v2 endpoint.
 * Extracted to reduce cognitive complexity of the main handler.
 */
function logTailorV2Debug(parsed, validation) {
  const patchCount = parsed.patches?.length || 0;
  const validCount = validation.patches?.length || 0;
  console.log(`[TAILOR] Parsed ${patchCount} patches, ${parsed.skill_suggestions?.length || 0} skill suggestions`);
  console.log(`[TAILOR] Validation: ${validCount} valid, ${validation.summary?.errorCount || 0} errors`);

  if (patchCount > 0 && validCount > 0) {
    console.log(`[TAILOR] Validation filtered: sent ${patchCount}, got back ${validCount}, lost ${patchCount - validCount}`);
  }

  console.log("[TAILOR] Validation summary:", JSON.stringify(validation.summary, null, 2));
}

/* ============================================================
   IMPROVED RESUME TAILOR ENDPOINT WITH PATCH VALIDATION
============================================================ */
app.post("/api/resume/tailor/v2", verifyFirebaseToken, async (req, res) => {
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
app.post("/api/resume/tailored/save", verifyFirebaseToken, async (req, res) => {
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
      const { toStructuredResume } = require('./resumeParser.js');
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
app.get("/api/resume/tailored", verifyFirebaseToken, async (req, res) => {
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
app.get("/api/resume/tailored/list", verifyFirebaseToken, async (req, res) => {
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
app.get("/api/resume/tailored/:tailoredResumeId", verifyFirebaseToken, async (req, res) => {
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
app.put("/api/resume/tailored/:tailoredResumeId", verifyFirebaseToken, async (req, res) => {
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
app.delete("/api/resume/tailored/:tailoredResumeId", verifyFirebaseToken, async (req, res) => {
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

/* ============================================================
   PATCH CACHE STATS (DEBUG ENDPOINT)
============================================================ */
app.get("/api/debug/patch-cache", verifyFirebaseToken, async (req, res) => {
  // Only allow admins or in development
  if (process.env.NODE_ENV !== "development") {
    return res.status(403).json({ ok: false, error: "Not allowed in production" });
  }

  const stats = patchCache.getStats();
  res.json({ ok: true, stats });
});


if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
