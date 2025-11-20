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

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

function removeUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
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

    if (!companyId || !name) {
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

    const jobRef = await db.collection("jobs").add(
      removeUndefined({
        companyId,
        name,
        description,
        majorsAssociated,
        applicationLink,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, jobId: jobRef.id });
  } catch (err) {
    console.error("Error adding job:");
    res.status(500).send({ success: false, error: err.message });
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
   START SERVER
---------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
