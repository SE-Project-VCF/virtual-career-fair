const express = require("express");
const router = express.Router();
const { db, auth } = require("../firebase");
const admin = require("firebase-admin");
const { verifyFirebaseToken } = require("../helpers");
const patchCache = require("../patchCache");

router.get("/debug/gemini-models", async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await r.json();

    const models = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name);

    res.json({ ok: true, models });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/debug/storage-bucket", async (req, res) => {
  try {
    const bucket = admin.storage().bucket(); // ✅ define it here (Option A)
    const [files] = await bucket.getFiles({ maxResults: 1 });

    return res.json({
      ok: true,
      bucket: bucket.name,
      sampleFile: files?.[0]?.name || null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* ============================================================
   PATCH CACHE STATS (DEBUG ENDPOINT)
============================================================ */
router.get("/debug/patch-cache", verifyFirebaseToken, async (req, res) => {
  // Only allow admins or in development
  if (process.env.NODE_ENV !== "development") {
    return res.status(403).json({ ok: false, error: "Not allowed in production" });
  }

  const stats = patchCache.getStats();
  res.json({ ok: true, stats });
});

module.exports = router;
