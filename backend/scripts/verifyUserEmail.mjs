/**
 * Script to verify a user's email
 *
 * Usage: node scripts/verifyUserEmail.mjs <email>
 *
 * Example: node scripts/verifyUserEmail.mjs student@test.com
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config();

const { db, auth } = require("../firebase");

function printUsageAndExit() {
  console.error("Usage: node scripts/verifyUserEmail.mjs <email>");
  console.error("Example: node scripts/verifyUserEmail.mjs student@test.com");
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 1) printUsageAndExit();

  return {
    email: args[0],
  };
}

async function findUserByEmail(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") return null;
    throw err;
  }
}

async function verifyUserEmail(email) {
  try {
    // Find user in Firebase Auth
    const userRecord = await findUserByEmail(email);
    if (!userRecord) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    // Update Firebase Auth to mark email as verified
    await auth.updateUser(userRecord.uid, {
      emailVerified: true,
    });

    // Update Firestore to mark email as verified
    await db.collection("users").doc(userRecord.uid).update({
      emailVerified: true,
    });

    console.log("✅ Email verified successfully!");
    console.log(`   Email: ${email}`);
    console.log(`   UID: ${userRecord.uid}`);
  } catch (err) {
    console.error("❌ Failed to verify email:", err.message);
    process.exit(1);
  }
}

try {
  const { email } = parseArgs(process.argv);
  await verifyUserEmail(email);
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
