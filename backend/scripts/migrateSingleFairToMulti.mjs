/**
 * Migration script: Move the existing single-fair data into the new multi-fair schema.
 *
 * Safe to run on a live system — only writes to the new `fairs/` collection.
 * Idempotent: exits early if fairs/legacy-fair already exists.
 *
 * Usage:
 *   node backend/scripts/migrateSingleFairToMulti.mjs
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config();

const admin = require("firebase-admin");
const { generateInviteCode } = require("../helpers");

// Initialize Firebase Admin (uses GOOGLE_APPLICATION_CREDENTIALS or default app)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const LEGACY_FAIR_ID = "legacy-fair";

async function migrate() {
  console.log("Starting migration to multi-fair schema...\n");

  // 1. Check if migration already ran
  const legacyFairDoc = await db.collection("fairs").doc(LEGACY_FAIR_ID).get();
  if (legacyFairDoc.exists) {
    console.log(`Fair "${LEGACY_FAIR_ID}" already exists — migration already complete.`);
    process.exit(0);
  }

  // 2. Read current global fair settings
  const liveStatusDoc = await db.collection("fairSettings").doc("liveStatus").get();
  const isLive = liveStatusDoc.exists ? (liveStatusDoc.data().isLive || false) : false;

  // 3. Read fairSchedules — use the first upcoming/active one for timing
  const schedulesSnap = await db.collection("fairSchedules").orderBy("startTime", "asc").get();
  const firstSchedule = schedulesSnap.docs[0]?.data() || {};

  // 4. Create fairs/legacy-fair
  const fairData = {
    name: firstSchedule.name || "Spring Career Fair",
    description: firstSchedule.description || null,
    isLive,
    startTime: firstSchedule.startTime || null,
    endTime: firstSchedule.endTime || null,
    inviteCode: generateInviteCode(),
    createdAt: admin.firestore.Timestamp.now(),
    createdBy: "migration-script",
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await db.collection("fairs").doc(LEGACY_FAIR_ID).set(fairData);
  console.log(`Created fair: "${fairData.name}" (id: ${LEGACY_FAIR_ID})`);

  // 5. Process each company
  const companiesSnap = await db.collection("companies").get();
  console.log(`\nMigrating ${companiesSnap.docs.length} companies...\n`);

  let successCount = 0;
  let skipCount = 0;

  for (const companyDoc of companiesSnap.docs) {
    const company = companyDoc.data();
    const companyId = companyDoc.id;

    try {
      // 6. Read the company's global booth (if any)
      let boothSnapshot = {
        companyId,
        companyName: company.companyName || "",
        industry: null,
        companySize: null,
        location: null,
        description: null,
        logoUrl: null,
        website: null,
        careersPage: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        hiringFor: null,
      };

      if (company.boothId) {
        const boothDoc = await db.collection("booths").doc(company.boothId).get();
        if (boothDoc.exists) {
          const bData = boothDoc.data();
          boothSnapshot = {
            companyId,
            companyName: bData.companyName || company.companyName || "",
            industry: bData.industry || null,
            companySize: bData.companySize || null,
            location: bData.location || null,
            description: bData.description || null,
            logoUrl: bData.logoUrl || null,
            website: bData.website || null,
            careersPage: bData.careersPage || null,
            contactName: bData.contactName || null,
            contactEmail: bData.contactEmail || null,
            contactPhone: bData.contactPhone || null,
            hiringFor: bData.hiringFor || null,
          };
        }
      }

      // 7. Create fair-scoped booth with a new auto-generated ID
      const fairBoothRef = db
        .collection("fairs")
        .doc(LEGACY_FAIR_ID)
        .collection("booths")
        .doc();

      const enrollmentBatch = db.batch();

      enrollmentBatch.set(fairBoothRef, {
        ...boothSnapshot,
        enrolledAt: admin.firestore.Timestamp.now(),
        enrolledBy: "migration-script",
      });

      // 8. Create enrollment record
      enrollmentBatch.set(
        db.collection("fairs").doc(LEGACY_FAIR_ID).collection("enrollments").doc(companyId),
        {
          companyId,
          companyName: company.companyName || "",
          enrolledAt: admin.firestore.Timestamp.now(),
          enrolledBy: "migration-script",
          enrollmentMethod: "migration",
          boothId: fairBoothRef.id,
        }
      );

      await enrollmentBatch.commit();

      // 9. Copy company's jobs into the fair
      const jobsSnap = await db
        .collection("jobs")
        .where("companyId", "==", companyId)
        .get();

      if (jobsSnap.empty) {
        console.log(`  OK ${company.companyName} — booth (no jobs)`);
      } else {
        const jobBatch = db.batch();
        jobsSnap.docs.forEach((jobDoc) => {
          const fairJobRef = db
            .collection("fairs")
            .doc(LEGACY_FAIR_ID)
            .collection("jobs")
            .doc();
          jobBatch.set(fairJobRef, {
            ...jobDoc.data(),
            sourceJobId: jobDoc.id,
            companyId,
            createdAt: admin.firestore.Timestamp.now(),
          });
        });
        await jobBatch.commit();
        console.log(`  OK ${company.companyName} — booth + ${jobsSnap.docs.length} job(s)`);
      }

      successCount++;
    } catch (err) {
      console.error(`  ERROR: Failed to migrate company ${companyId} (${company.companyName}):`, err.message);
      skipCount++;
    }
  }

  console.log("\nMigration complete!");
  console.log(`  OK ${successCount} companies migrated`);
  if (skipCount > 0) console.log(`  ERROR ${skipCount} companies skipped (see errors above)`);
  console.log(`\nFair ID: ${LEGACY_FAIR_ID}`);
  console.log(`Invite Code: ${fairData.inviteCode}`);
  console.log("\nThe old fairSettings and fairSchedules collections are untouched.");
}

try {
  await migrate();
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
