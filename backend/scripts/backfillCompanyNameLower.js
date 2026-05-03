/**
 * One-time backfill: writes companyNameLower on every company doc that lacks it.
 * Idempotent — safe to re-run. Skips docs that already have a matching value.
 *
 * Usage:
 *   node backend/scripts/backfillCompanyNameLower.js          # dry run
 *   node backend/scripts/backfillCompanyNameLower.js --apply  # write changes
 */
const { db } = require("../firebase");

async function main() {
  const apply = process.argv.includes("--apply");
  const snap = await db.collection("companies").get();
  let toUpdate = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const expected = (data.companyName || "").trim().toLowerCase();
    if (!expected) {
      skipped += 1;
      continue;
    }
    if (data.companyNameLower === expected) {
      skipped += 1;
      continue;
    }
    toUpdate += 1;
    console.log(`[${apply ? "apply" : "dry"}] ${doc.id}: "${data.companyName}" -> "${expected}"`);
    if (apply) {
      await doc.ref.update({ companyNameLower: expected });
    }
  }

  console.log(`Done. ${toUpdate} ${apply ? "updated" : "would update"}, ${skipped} skipped.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
