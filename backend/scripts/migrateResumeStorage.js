/**
 * Migration: Move resume data from subcollection to main users document
 * 
 * Before: users/{uid}/resumes/{resumeId} { storagePath, text, structured, ... }
 * After:  users/{uid} { resumePath, resumeStructured, currentResumeId }
 * 
 * Usage: node backend/scripts/migrateResumeStorage.js
 */

const admin = require("firebase-admin");
const path = require("node:path");

// Initialize Firebase Admin
const keyPath = path.join(__dirname, "..", "privateKey.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(keyPath)),
  });
}

const db = admin.firestore();

function getLatestResume(resumeDocs) {
  let latestResume = null;
  let latestDoc = null;

  for (const doc of resumeDocs) {
    const resume = doc.data();
    if (!latestResume || new Date(resume.createdAt) > new Date(latestResume.createdAt)) {
      latestResume = resume;
      latestDoc = doc;
    }
  }

  return { latestResume, latestDoc };
}

async function migrateUserResume(userDoc) {
  const userId = userDoc.id;
  const userData = userDoc.data();

  // Check if user has old resumes subcollection
  const resumesSnap = await db
    .collection("users")
    .doc(userId)
    .collection("resumes")
    .get();

  if (resumesSnap.empty) {
    console.log(`⏭️  ${userId}: No resumes subcollection found, skipping`);
    return "skipped";
  }

  console.log(
    `📦 ${userId}: Found ${resumesSnap.docs.length} resume(s) in subcollection`
  );

  const { latestResume, latestDoc } = getLatestResume(resumesSnap.docs);

  if (!latestResume?.structured) {
    console.log(`   ⚠️  Resume has no structured data, skipping`);
    return "skipped";
  }

  // Migrate to main document
  console.log(`   📤 Migrating resume ${latestDoc.id}...`);

  await db
    .collection("users")
    .doc(userId)
    .set(
      {
        // Keep existing fields
        resumePath: latestResume.storagePath || userData.resumePath,
        currentResumePath: latestResume.storagePath || userData.resumePath,
        resumeFileName: latestResume.fileName || userData.resumeFileName,
        resumeUpdatedAt:
          latestResume.updatedAt || userData.resumeUpdatedAt,

        // NEW: Add structured resume
        resumeStructured: latestResume.structured,
        currentResumeId: latestDoc.id,

        // Cleanup old fields if they exist
        currentResumeId_old: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );

  // Delete old subcollection documents
  console.log(`   🗑️  Deleting old subcollection...`);
  const batch = db.batch();
  for (const doc of resumesSnap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  console.log(`   ✅ ${userId}: Migration complete!\n`);
  return "migrated";
}

async function migrateResumes() {
  console.log("🚀 Starting resume storage migration...\n");

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    // Get all users
    const usersSnap = await db.collection("users").get();
    console.log(`📋 Found ${usersSnap.docs.length} users to process\n`);

    for (const userDoc of usersSnap.docs) {
      try {
        const result = await migrateUserResume(userDoc);
        if (result === "migrated") {
          migratedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        const userId = userDoc.id;
        console.error(`   ❌ ${userId}: Error - ${err.message}\n`);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped:  ${skippedCount}`);
    console.log(`❌ Errors:   ${errorCount}`);
    console.log("=".repeat(60));

    if (migratedCount > 0) {
      console.log("\n📝 Next Steps:");
      console.log("1. Update /api/parse-resume endpoint in server.js");
      console.log("2. Update all resume readers to use resumeStructured field");
      console.log("3. Update firestore.rules to allow resumeStructured reads/writes");
      console.log("4. Test the endpoints with new schema");
    }

    process.exit(0);
  } catch (err) {
    console.error("\n❌ FATAL ERROR:", err);
    process.exit(1);
  }
}

module.exports = { migrateResumes };

if (require.main === module) {
  void migrateResumes(); // NOSONAR: CommonJS script entrypoint cannot use top-level await.
}
