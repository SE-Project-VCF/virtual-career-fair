/**
 * Preload all Firestore users into Stream Chat
 * Run using:  node scripts/preloadStreamUsers.mjs
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config();

const admin = require("firebase-admin");
const { StreamChat } = require("stream-chat");

// ---------------------------
// Initialize Firebase Admin
// ---------------------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("../privateKey.json")),
  });
}

const db = admin.firestore();

// ---------------------------
// Initialize Stream Server Client
// ---------------------------
const stream = StreamChat.getInstance(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET
);

async function preloadUsers() {
  console.log("Fetching Firestore users...");

  const snapshot = await db.collection("users").get();
  const users = snapshot.docs.map((doc) => doc.data());

  if (users.length === 0) {
    console.log("No users found in Firestore.");
    return;
  }

  console.log(`Found ${users.length} users. Syncing with Stream...`);

  // Process in small batches to avoid rate limits
  const batchSize = 25;

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    const streamUsers = batch.map((u) => ({
      id: u.uid,
      name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
      email: u.email,
      username: u.email.includes("@") ? u.email.split("@")[0] : u.email,
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      role: "user",
    }));

    console.log(`Syncing batch ${i / batchSize + 1} (${streamUsers.length} users)`);
    await stream.upsertUsers(streamUsers);
  }

  console.log("All users synced to Stream.");
}

try {
  await preloadUsers();
} catch (err) {
  console.error("Error syncing users to Stream:", err);
}
