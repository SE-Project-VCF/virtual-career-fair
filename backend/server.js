require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { db, auth } = require("./firebase");
const admin = require("firebase-admin");
const { removeUndefined, generateInviteCode, parseUTCToTimestamp, verifyAdmin } = require("./helpers");

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
const PORT = process.env.PORT || 5000;

// CORS configuration - allow multiple origins
const allowedOrigins = [
  "http://localhost:5173",
  "https://virtual-career-fair-git-dev-ninapellis-projects.vercel.app",
  process.env.FRONTEND_URL, // Allow custom frontend URL from env
].filter(Boolean); // Remove any undefined values

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// Rate limiting - 100 requests per 15 minutes per IP
if (process.env.NODE_ENV !== "test") {
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }));
}

/* ----------------------------------------------------
   FIREBASE AUTH MIDDLEWARE
   Verifies Firebase ID token from Authorization header
---------------------------------------------------- */
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = { uid: decodedToken.uid, email: decodedToken.email };
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}


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
   ENSURE SINGLE USER EXISTS IN STREAM
   Called from frontend after login/registration
---------------------------------------------------- */
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
      email && email.includes("@")
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
    });

    let companyId = null;
    let inviteCode = null;

    // Company owner setup
    if (role === "companyOwner") {
      inviteCode = generateInviteCode();

      const companyRef = db.collection("companies").doc();
      companyId = companyRef.id;

      await companyRef.set(
        removeUndefined({
          companyId,
          companyName,
          ownerId: userRecord.uid,
          inviteCode,
          createdAt: admin.firestore.Timestamp.now(),
        })
      );
    }

    // Save user in Firestore
    const docData = removeUndefined({
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role,
      companyId,
      inviteCode,
      emailVerified: false,
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

    } catch (streamErr) {
      console.error("Stream upsert error:", streamErr);
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
        u.email && u.email.includes("@")
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
   ADD JOB
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
    if (!companyId) {
      return res
        .status(400)
        .send({ success: false, error: "Company ID is required" });
    }

    if (!name || !name.trim()) {
      return res
        .status(400)
        .send({ success: false, error: "Job title is required" });
    }

    if (name.trim().length > 200) {
      return res
        .status(400)
        .send({ success: false, error: "Job title must be 200 characters or less" });
    }

    if (!description || !description.trim()) {
      return res
        .status(400)
        .send({ success: false, error: "Job description is required" });
    }

    if (description.trim().length > 5000) {
      return res
        .status(400)
        .send({ success: false, error: "Job description must be 5000 characters or less" });
    }

    if (!majorsAssociated || !majorsAssociated.trim()) {
      return res
        .status(400)
        .send({ success: false, error: "Skills are required" });
    }

    if (majorsAssociated.trim().length > 500) {
      return res
        .status(400)
        .send({ success: false, error: "Skills must be 500 characters or less" });
    }

    // Validate application link format if provided
    if (applicationLink && applicationLink.trim()) {
      try {
        new URL(applicationLink.trim());
      } catch (e) {
        return res
          .status(400)
          .send({ success: false, error: "Invalid application URL format" });
      }
    }

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res
        .status(404)
        .send({ success: false, error: "Invalid company ID" });
    }

    // Verify the user is the company owner or a representative
    const companyData = companyDoc.data();
    const reps = companyData.representativeIDs || [];
    if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
      return res.status(403).send({ success: false, error: "Not authorized for this company" });
    }

    // Sanitize inputs (trim and remove null bytes)
    const sanitizedName = name.trim().replace(/\0/g, '');
    const sanitizedDescription = description.trim().replace(/\0/g, '');
    const sanitizedMajors = majorsAssociated.trim().replace(/\0/g, '');
    const sanitizedAppLink = applicationLink && applicationLink.trim() ? applicationLink.trim().replace(/\0/g, '') : undefined;

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
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Job title is required" });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, error: "Job description is required" });
    }

    if (!majorsAssociated || !majorsAssociated.trim()) {
      return res.status(400).json({ success: false, error: "Skills are required" });
    }

    // Validate application link format if provided
    if (applicationLink && applicationLink.trim()) {
      try {
        new URL(applicationLink.trim());
      } catch (e) {
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
    const companyDoc = await db.collection("companies").doc(jobData.companyId).get();
    if (companyDoc.exists) {
      const companyData = companyDoc.data();
      const reps = companyData.representativeIDs || [];
      if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
        return res.status(403).json({ success: false, error: "Not authorized for this company" });
      }
    }

    await jobRef.update(
      removeUndefined({
        name: name.trim(),
        description: description.trim(),
        majorsAssociated: majorsAssociated.trim(),
        applicationLink: applicationLink && applicationLink.trim() ? applicationLink.trim() : null,
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
    const companyDoc = await db.collection("companies").doc(jobData.companyId).get();
    if (companyDoc.exists) {
      const companyData = companyDoc.data();
      const reps = companyData.representativeIDs || [];
      if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
        return res.status(403).json({ success: false, error: "Not authorized for this company" });
      }
    }

    await jobRef.delete();

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting job:", err);
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

    console.log(`Creating ${studentIds.length} job invitation(s) for job ${jobId}`);
    console.log(`Sent by user ${userId} from company ${companyId}`);

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

    // Chat invitations are no longer supported - invitations are only sent via dashboard notifications
    // The code below is kept for reference but will not be executed
    if (sentVia === "chat") {
      try {
        // Get sender details
        const senderDoc = await db.collection("users").doc(userId).get();
        const senderData = senderDoc.data();
        const senderName = `${senderData.firstName || ""} ${senderData.lastName || ""}`.trim() || "Representative";

        // Get company details
        const companyDoc = await db.collection("companies").doc(companyId).get();
        const companyName = companyDoc.exists ? companyDoc.data().companyName : "Our Company";

        // Send a chat message to each student
        for (const studentId of studentIds) {
          try {
            // Create or get 1-on-1 channel between sender and student
            const channelId = [userId, studentId].sort().join("-");
            const channel = streamServer.channel("messaging", channelId, {
              members: [userId, studentId],
              created_by_id: userId,
            });

            await channel.create();

            // Send the job invitation message
            const messageText = message 
              ? `🎯 **Job Opportunity: ${jobData.name}**\n\n${companyName} has invited you to apply for this position!\n\n"${message}"\n\n👉 View details and apply: [Click here to view invitation]`
              : `🎯 **Job Opportunity: ${jobData.name}**\n\n${companyName} has invited you to apply for this position!\n\n👉 View details and apply: [Click here to view invitation]`;

            await channel.sendMessage({
              text: messageText,
              user_id: userId,
              attachments: [{
                type: "job_invitation",
                title: jobData.name,
                title_link: `/dashboard/job-invitations`,
                text: jobData.description.substring(0, 200) + (jobData.description.length > 200 ? "..." : ""),
                fields: [
                  {
                    title: "Company",
                    value: companyName,
                    short: true,
                  },
                  {
                    title: "Skills Required",
                    value: jobData.majorsAssociated,
                    short: true,
                  }
                ],
              }],
            });
          } catch (chatErr) {
            console.error(`Failed to send chat message to student ${studentId}:`, chatErr);
            // Continue with other students even if one fails
          }
        }
      } catch (chatErr) {
        console.error("Error sending chat messages:", chatErr);
        // Don't fail the entire request if chat fails, invitations are still created
      }
    }

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

    console.log(`Fetching job invitations for student ${userId}`);

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
    console.log(`Found ${invitationsSnapshot.size} invitation(s) for student ${userId}`);

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

    console.log(`Returning ${invitations.length} invitation(s) with full details`);
    return res.json({ invitations });
  } catch (err) {
    console.error("Error fetching received invitations:", err);
    return res.status(500).json({ error: "Failed to fetch invitations", details: err.message });
  }
});

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
      console.log(`Filtering students who visited booth: ${boothId}`);
      
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
      console.log(`Found ${students.length} students who visited booth ${boothId}`);
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
    if (search && search.trim()) {
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
    if (major && major.trim()) {
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

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res
        .status(404)
        .send({ success: false, error: "Invalid company ID" });
    }

    // Verify the user is the company owner or a representative
    const companyData = companyDoc.data();
    const reps = companyData.representativeIDs || [];
    if (companyData.ownerId !== req.user.uid && !reps.includes(req.user.uid)) {
      return res.status(403).send({ success: false, error: "Not authorized for this company" });
    }

    // Sanitize text inputs (trim whitespace, remove null bytes)
    const sanitizedBoothName = boothName ? boothName.trim().replace(/\0/g, '') : boothName;
    const sanitizedLocation = location ? location.trim().replace(/\0/g, '') : location;
    const sanitizedDescription = description ? description.trim().replace(/\0/g, '') : description;

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
    const { userId, name, startTime, endTime, description, enabled } = req.body;

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
    const now = admin.firestore.Timestamp.now();

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
      // Get existing times if not provided
      const existingData = scheduleDoc.data();
      const start = startTime !== undefined 
        ? parseUTCToTimestamp(startTime)
        : existingData.startTime;
      const end = endTime !== undefined 
        ? parseUTCToTimestamp(endTime)
        : existingData.endTime;

      if (!start || !end) {
        return res.status(400).json({ error: "Both start time and end time are required" });
      }

      if (end.toMillis() <= start.toMillis()) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      updateData.startTime = start;
      updateData.endTime = end;
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

    // Update the invite code using a transaction to prevent race conditions
    // We cannot use queries inside transactions, so we fetch the company doc first
    // and use optimistic locking by reading all companies outside the transaction
    // then doing a final atomic check inside
    const companiesSnapshot = await db.collection("companies").get();
    const companiesWithCode = companiesSnapshot.docs.filter(
      (doc) => doc.data().inviteCode === inviteCode && doc.id !== companyId
    );

    if (companiesWithCode.length > 0) {
      return res.status(400).json({ error: "This invite code is already in use by another company" });
    }

    // Use transaction for atomic update with version checking
    await db.runTransaction(async (transaction) => {
      // Read the company doc to ensure it exists and get current state
      const companyRef = db.collection("companies").doc(companyId);
      const companyDoc = await transaction.get(companyRef);

      if (!companyDoc.exists) {
        throw new Error("Company not found");
      }

      // Perform atomic update
      transaction.update(companyRef, {
        inviteCode: inviteCode,
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
    } catch (streamErr) {
      console.error("STREAM UPSERT ERROR:", streamErr);
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

/* ----------------------------------------------------
   START SERVER
---------------------------------------------------- */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
