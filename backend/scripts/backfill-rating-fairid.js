/**
 * Backfill fairId/fairName on booth rating documents that are missing them.
 *
 * Strategy: for each rating without a fairId, find the fair whose active window
 * (startTime..endTime) contains the rating's createdAt timestamp.  If a unique
 * match is found, patch the document.  Ambiguous or unmatched ratings are logged
 * for manual review.
 *
 * Run:  node scripts/backfill-rating-fairid.js
 */

"use strict";

const { db } = require("../firebase");

async function main() {
  // 1. Load all fairs (we need their time ranges and names)
  const fairsSnap = await db.collection("fairs").get();
  const fairs = fairsSnap.docs.map((d) => ({
    id: d.id,
    name: d.data().name || null,
    startTime: d.data().startTime ?? d.data().start ?? null,   // ms or Firestore Timestamp
    endTime: d.data().endTime ?? d.data().end ?? null,
  })).map((f) => ({
    ...f,
    startMs: toMs(f.startTime),
    endMs: toMs(f.endTime),
  }));

  console.log(`Loaded ${fairs.length} fairs.`);

  // 2. Iterate every booth
  const boothsSnap = await db.collection("booths").get();
  let patched = 0;
  let skipped = 0;
  let ambiguous = 0;

  for (const boothDoc of boothsSnap.docs) {
    const boothId = boothDoc.id;
    const ratingsSnap = await db
      .collection("booths")
      .doc(boothId)
      .collection("ratings")
      .get();

    for (const ratingDoc of ratingsSnap.docs) {
      const data = ratingDoc.data();

      // Already has fairId — skip
      if (data.fairId) {
        skipped++;
        continue;
      }

      const createdAtMs = data.createdAt ? toMs(data.createdAt) : null;
      if (!createdAtMs) {
        console.warn(`  [SKIP] booth=${boothId} student=${ratingDoc.id} — no createdAt`);
        skipped++;
        continue;
      }

      // Find fairs whose window contains createdAt
      const matches = fairs.filter(
        (f) => f.startMs && f.endMs && createdAtMs >= f.startMs && createdAtMs <= f.endMs
      );

      if (matches.length === 0) {
        // No fair window matched — try the closest fair by start time as a fallback
        const sorted = fairs
          .filter((f) => f.startMs)
          .sort((a, b) => Math.abs(a.startMs - createdAtMs) - Math.abs(b.startMs - createdAtMs));
        const closest = sorted[0];
        if (closest) {
          console.log(
            `  [CLOSEST] booth=${boothId} student=${ratingDoc.id} ` +
            `createdAt=${new Date(createdAtMs).toISOString()} → fair="${closest.name}" (${closest.id})`
          );
          await ratingDoc.ref.update({ fairId: closest.id, fairName: closest.name });
          patched++;
        } else {
          console.warn(`  [NO MATCH] booth=${boothId} student=${ratingDoc.id} — no fairs exist`);
          skipped++;
        }
        continue;
      }

      if (matches.length > 1) {
        console.warn(
          `  [AMBIGUOUS] booth=${boothId} student=${ratingDoc.id} — matched ${matches.length} fairs: ` +
          matches.map((f) => `"${f.name}" (${f.id})`).join(", ")
        );
        ambiguous++;
        continue;
      }

      const fair = matches[0];
      console.log(
        `  [PATCH] booth=${boothId} student=${ratingDoc.id} → fair="${fair.name}" (${fair.id})`
      );
      await ratingDoc.ref.update({ fairId: fair.id, fairName: fair.name });
      patched++;
    }
  }

  console.log(`\nDone. patched=${patched}  skipped=${skipped}  ambiguous=${ambiguous}`);
}

function toMs(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis(); // Firestore Timestamp
  if (value instanceof Date) return value.getTime();
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
