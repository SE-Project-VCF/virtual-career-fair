const express = require("express");
const router = express.Router();
const cors = require("cors");
const { db } = require("../firebase");
const { verifyFirebaseToken } = require("../helpers");
const { streamServerClient } = require("../streamServerClient");

/* ----------------------------------------------------
   STREAM TOKEN ENDPOINT
---------------------------------------------------- */
router.get("/stream-token", verifyFirebaseToken, (req, res) => {
  try {
    const token = streamServerClient.createToken(req.user.uid);
    return res.json({ success: true, token });
  } catch (err) {
    console.error("Stream token error:", err);
    return res.status(500).json({ error: "Unable to create token" });
  }
});

/* ----------------------------------------------------
   NEW: GET UNREAD COUNT FOR A USER (server-side)
---------------------------------------------------- */
router.get("/stream-unread", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    // 1) Get all channels the user is a member of
    const channels = await streamServerClient.queryChannels(
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
router.options("/sync-stream-user", cors());
router.post("/sync-stream-user", verifyFirebaseToken, async (req, res) => {
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

    await streamServerClient.upsertUser({
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
   SYNC ALL FIRESTORE USERS TO STREAM
---------------------------------------------------- */
router.post("/sync-stream-users", verifyFirebaseToken, async (req, res) => {
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

      await streamServerClient.upsertUser({
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
   ADD USER TO STREAM CHANNEL
---------------------------------------------------- */
router.post("/stream-channel/:channelId/add-member", verifyFirebaseToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.uid;

    if (!channelId) {
      return res.status(400).json({ error: "Channel ID is required" });
    }

    const channel = streamServerClient.channel("messaging", channelId);

    // Add user to channel with required permissions
    await channel.addMembers([userId]);

    console.log("[StreamChat] User added to channel (add-member)");

    return res.json({ success: true, message: "User added to channel" });
  } catch (err) {
    console.error("Error adding user to StreamChat channel:", err);
    return res.status(500).json({ error: "Failed to add user to channel" });
  }
});

/* ----------------------------------------------------
   ENSURE USER IS IN STREAM CHANNEL
---------------------------------------------------- */
router.post("/stream-channel/:channelId/ensure-member", verifyFirebaseToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.uid;
    const { userName = userId } = req.body;

    if (!channelId) {
      return res.status(400).json({ error: "Channel ID is required" });
    }

    // First, upsert user to ensure they exist in Stream
    await streamServerClient.upsertUser({
      id: userId,
      name: userName,
    });

    const channel = streamServerClient.channel("messaging", channelId);

    try {
      // Try to add user to channel
      await channel.addMembers([userId]);
      console.log("[StreamChat] User added to channel (ensure-member)");
    } catch (addErr) {
      // If user is already a member, that's fine - just ignore
      const errorMsg = addErr?.message || "";
      if (!errorMsg.includes("already a member")) {
        throw addErr;
      }
      console.log("[StreamChat] User already a member of channel (ensure-member)");
    }

    return res.json({ success: true, message: "User is member of channel" });
  } catch (err) {
    console.error("Error ensuring user in StreamChat channel:", err);
    return res.status(500).json({ error: "Failed to ensure user in channel" });
  }
});

module.exports = router;
