require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { db, auth } = require("./firebase");
const admin = require("firebase-admin");

// --------------------------
// STREAM CHAT SERVER CLIENT
// --------------------------
const { StreamChat } = require("stream-chat");

const streamServer = StreamChat.getInstance(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET
);

const app = express();
const PORT = 5000;

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
      } 
      // Allow all Vercel deployment URLs (for flexibility during development/deployment)
      else if (origin.includes(".vercel.app")) {
        callback(null, true);
      } 
      // Allow localhost on any port (for development)
      else if (origin.startsWith("http://localhost:") || origin.startsWith("https://localhost:")) {
        callback(null, true);
      }
      else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

function removeUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
}

/* ----------------------------------------------------
   HELPER: Parse datetime string as UTC and return Firestore Timestamp
   Ensures all dates are stored as UTC in the database
---------------------------------------------------- */
function parseUTCToTimestamp(dateTimeString) {
  if (!dateTimeString) {
    throw new Error("Date string is required");
  }
  
  let date;
  
  // Check if it's already a full ISO string with timezone (ends with Z or has timezone offset)
  if (dateTimeString.includes('Z') || dateTimeString.match(/[+-]\d{2}:\d{2}$/)) {
    // Already has timezone info, parse directly
    date = new Date(dateTimeString);
  } else if (dateTimeString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    // ISO format without timezone - treat as UTC by appending Z
    date = new Date(dateTimeString + 'Z');
  } else if (dateTimeString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
    // datetime-local format (YYYY-MM-DDTHH:mm) - treat as UTC by appending Z
    date = new Date(dateTimeString + 'Z');
  } else {
    // Try parsing as-is (will use local timezone, then we convert)
    date = new Date(dateTimeString);
  }
  
  // Validate the date
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateTimeString}`);
  }
  
  // Firestore Timestamp stores UTC internally, so we use the UTC milliseconds
  // This ensures consistent UTC storage regardless of server timezone
  return admin.firestore.Timestamp.fromMillis(date.getTime());
}

/* ----------------------------------------------------
   STREAM TOKEN ENDPOINT
---------------------------------------------------- */
app.get("/api/stream-token", (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const token = streamServer.createToken(userId);
    return res.json({ token });
  } catch (err) {
    console.error("Stream token error:");
    return res.status(500).json({ error: "Unable to create token" });
  }
});

/* ----------------------------------------------------
   NEW: GET UNREAD COUNT FOR A USER (server-side)
---------------------------------------------------- */
app.get("/api/stream-unread", async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

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

    return res.json({ unread });

  } catch (err) {
    console.error("Unread calc error:");
    return res.status(500).json({ error: "Failed to compute unread" });
  }
});

/* ----------------------------------------------------
   ENSURE SINGLE USER EXISTS IN STREAM
   Called from frontend after login/registration
---------------------------------------------------- */
app.post("/api/sync-stream-user", async (req, res) => {
  try {
    const { uid, email, firstName, lastName } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ error: "Missing uid or email" });
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
app.post("/register-user", async (req, res) => {
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
      inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

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
      console.error("STREAM UPSERT ERROR:");
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
    console.error("Error registering user:");
    res.status(500).send({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   SYNC ALL FIRESTORE USERS TO STREAM
---------------------------------------------------- */
app.post("/api/sync-stream-users", async (req, res) => {
  try {
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
    console.error("Stream user sync failed");
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* ----------------------------------------------------
   ADD JOB
---------------------------------------------------- */
app.post("/add-job", async (req, res) => {
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

    if (!description || !description.trim()) {
      return res
        .status(400)
        .send({ success: false, error: "Job description is required" });
    }

    if (!majorsAssociated || !majorsAssociated.trim()) {
      return res
        .status(400)
        .send({ success: false, error: "Skills are required" });
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
        .status(403)
        .send({ success: false, error: "Invalid company ID" });
    }

    const jobRef = await db.collection("jobs").add(
      removeUndefined({
        companyId,
        name: name.trim(),
        description: description.trim(),
        majorsAssociated: majorsAssociated.trim(),
        applicationLink: applicationLink && applicationLink.trim() ? applicationLink.trim() : undefined,
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

    return res.json({ jobs });
  } catch (err) {
    console.error("Error fetching jobs:", err);
    return res.status(500).json({ error: "Failed to fetch jobs", details: err.message });
  }
});

/* ----------------------------------------------------
   UPDATE JOB
---------------------------------------------------- */
app.put("/api/jobs/:id", async (req, res) => {
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
app.delete("/api/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const jobRef = db.collection("jobs").doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    await jobRef.delete();

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting job:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   ADD BOOTH
---------------------------------------------------- */
app.post("/add-booth", async (req, res) => {
  try {
    const { companyId, boothName, location, description, representatives } =
      req.body;

    if (!companyId || !boothName) {
      return res
        .status(400)
        .send({ success: false, error: "Missing required fields" });
    }

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res
        .status(403)
        .send({ success: false, error: "Invalid company ID" });
    }

    const boothRef = await db.collection("booths").add(
      removeUndefined({
        companyId,
        boothName,
        location,
        description,
        representatives,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, boothId: boothRef.id });
  } catch (err) {
    console.error("Error adding booth:");
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

    // Get current evaluated status
    const currentStatus = await evaluateFairStatus();
    
    // Get manual status
    const statusRef = db.collection("fairSettings").doc("liveStatus");
    const statusDoc = await statusRef.get();

    let newStatus = true;
    if (statusDoc.exists) {
      const currentData = statusDoc.data();
      newStatus = !currentData.isLive;
    }

    // Update manual status (this will be used if schedule is disabled)
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
   HELPER: Verify user is administrator
---------------------------------------------------- */
async function verifyAdmin(userId) {
  if (!userId) {
    return { error: "Missing userId", status: 400 };
  }

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    return { error: "User not found", status: 404 };
  }

  const userData = userDoc.data();
  if (userData.role !== "administrator") {
    return { error: "Only administrators can manage schedules", status: 403 };
  }

  return null;
}

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
      inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    // Check if invite code is already in use by another company
    const companiesSnapshot = await db.collection("companies").get();
    let codeInUse = false;
    companiesSnapshot.forEach((doc) => {
      if (doc.id !== companyId && doc.data().inviteCode === inviteCode) {
        codeInUse = true;
      }
    });

    if (codeInUse) {
      return res.status(400).json({ error: "This invite code is already in use by another company" });
    }

    // Update the invite code
    await db.collection("companies").doc(companyId).update({
      inviteCode: inviteCode,
      inviteCodeUpdatedAt: admin.firestore.Timestamp.now(),
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
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
