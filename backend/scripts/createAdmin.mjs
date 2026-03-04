/**
 * Script to create an administrator account
 *
 * Usage: node scripts/createAdmin.mjs <email> <password> [firstName] [lastName]
 *
 * Requires ADMIN_SECRET_KEY to be set in .env file
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config();

const { db, auth } = require("../firebase");
const admin = require("firebase-admin");
const { StreamChat } = require("stream-chat");

function printUsageAndExit() {
  console.error("Usage: node scripts/createAdmin.mjs <email> <password> [firstName] [lastName]");
  console.error("Example: node scripts/createAdmin.mjs admin@example.com SecurePass123 John Doe");
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2) printUsageAndExit();

  return {
    email: args[0],
    password: args[1],
    firstName: args[2] || "",
    lastName: args[3] || "",
  };
}

function ensureAdminSecret() {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) {
    console.error("ERROR: ADMIN_SECRET_KEY not set in .env file");
    console.error("Please set ADMIN_SECRET_KEY in your .env file");
    console.error("Example: ADMIN_SECRET_KEY=your-secret-key-here");
    process.exit(1);
  }
  return adminSecret;
}

function buildDisplayName(firstName, lastName) {
  return `${firstName || ""} ${lastName || ""}`.trim();
}

async function findUserByEmail(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") return null;
    throw err;
  }
}

async function upgradeExistingUser(userRecord, { firstName, lastName, email }) {
  const userDoc = await db.collection("users").doc(userRecord.uid).get();
  if (userDoc.exists && userDoc.data().role === "administrator") {
    console.log("User is already an administrator");
    console.log(`   Email: ${email}`);
    console.log(`   UID: ${userRecord.uid}`);
    return true;
  }

  const existingData = userDoc.exists ? userDoc.data() : {};
  await db.collection("users").doc(userRecord.uid).set(
    {
      role: "administrator",
      firstName: firstName || existingData.firstName,
      lastName: lastName || existingData.lastName,
    },
    { merge: true }
  );

  console.log("User upgraded to administrator successfully!");
  console.log(`   Email: ${email}`);
  console.log(`   UID: ${userRecord.uid}`);
  return false;
}

async function createNewAdminAuthUser({ email, password, firstName, lastName }) {
  return auth.createUser({
    email,
    password,
    displayName: buildDisplayName(firstName, lastName),
    emailVerified: true,
  });
}

async function saveAdminProfile(userRecord, { email, firstName, lastName }) {
  const docData = {
    uid: userRecord.uid,
    firstName,
    lastName,
    email,
    role: "administrator",
    emailVerified: true,
    createdAt: admin.firestore.Timestamp.now(),
  };

  Object.keys(docData).forEach((key) => {
    if (docData[key] === undefined) delete docData[key];
  });

  await db.collection("users").doc(userRecord.uid).set(docData);
}

async function upsertStreamUser({ userRecord, email, firstName, lastName }) {
  const streamApiKey = process.env.STREAM_API_KEY;
  const streamApiSecret = process.env.STREAM_API_SECRET;
  if (!streamApiKey || !streamApiSecret) return;

  const streamServer = StreamChat.getInstance(streamApiKey, streamApiSecret);
  const username = email.includes("@") ? email.split("@")[0] : email;

  await streamServer.upsertUser({
    id: userRecord.uid,
    name: buildDisplayName(firstName, lastName) || email,
    email,
    username,
    firstName: firstName || "",
    lastName: lastName || "",
    role: "user",
  });
  console.log("   Stream Chat user created");
}

async function run() {
  const { email, password, firstName, lastName } = parseArgs(process.argv);
  ensureAdminSecret();

  console.log("Creating administrator account...");

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    console.log("User already exists, upgrading to administrator...");
    await upgradeExistingUser(existingUser, { firstName, lastName, email });
    return;
  }

  const userRecord = await createNewAdminAuthUser({ email, password, firstName, lastName });
  await saveAdminProfile(userRecord, { email, firstName, lastName });

  try {
    await upsertStreamUser({ userRecord, email, firstName, lastName });
  } catch (error_) {
    console.warn("   Warning: Could not create Stream Chat user:", error_.message);
  }

  console.log("Administrator account created successfully!");
  console.log(`   Email: ${email}`);
  console.log(`   UID: ${userRecord.uid}`);
  console.log("\nIMPORTANT: Save the password you entered securely.");
}

try {
  await run();
} catch (err) {
  console.error("Failed to create admin:", err.message);
  if (err.code === "auth/email-already-exists") {
    console.error("   A user with this email already exists. Use the upgrade functionality.");
  }
  process.exit(1);
}
