const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const admin = require("firebase-admin");
const { verifyFirebaseToken, generateInviteCode, removeUndefined } = require("../helpers");
const { verifyOfficeLocationInput } = require("../services/verifiedOfficeLocation");

const MAX_OFFICE_LOCATIONS = 40;

/* ----------------------------------------------------
   CREATE COMPANY (Auth required — company owners)
---------------------------------------------------- */
router.post("/companies", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyName } = req.body;
    const ownerId = req.user.uid;

    if (!companyName?.trim()) {
      return res.status(400).json({ error: "Company name is required" });
    }

    const userDoc = await db.collection("users").doc(ownerId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().role !== "companyOwner") {
      return res.status(403).json({ error: "Only company owners can create companies" });
    }

    const rawCode = generateInviteCode();
    const companyRef = db.collection("companies").doc();
    const companyId = companyRef.id;

    await companyRef.set(removeUndefined({
      companyId,
      companyName: companyName.trim(),
      ownerId,
      inviteCode: rawCode,
      createdAt: admin.firestore.Timestamp.now(),
    }));

    // Update user doc with companyId (no invite code stored on user)
    await db.collection("users").doc(ownerId).update({ companyId, companyName: companyName.trim() });

    return res.status(201).json({ companyId, inviteCode: rawCode });
  } catch (err) {
    console.error("POST /api/companies error:", err);
    return res.status(500).json({ error: "Failed to create company" });
  }
});

/* ----------------------------------------------------
   LINK REPRESENTATIVE TO COMPANY via invite code
---------------------------------------------------- */
router.post("/link-company", verifyFirebaseToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user.uid;

    if (!inviteCode?.trim()) {
      return res.status(400).json({ error: "Invite code is required" });
    }

    const companiesSnap = await db.collection("companies").where("inviteCode", "==", inviteCode.trim().toUpperCase()).get();
    if (companiesSnap.empty) return res.status(400).json({ error: "Invalid invite code." });

    const companyDoc = companiesSnap.docs[0];
    const companyId = companyDoc.id;
    const { companyName, representativeIDs = [] } = companyDoc.data();

    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().companyId === companyId) {
      return res.status(400).json({ error: "You are already linked to this company." });
    }

    await db.runTransaction(async (transaction) => {
      transaction.update(db.collection("companies").doc(companyId), {
        representativeIDs: [...new Set([...representativeIDs, userId])],
      });
      transaction.update(db.collection("users").doc(userId), { companyId, companyName });
    });

    return res.json({ companyId, companyName });
  } catch (err) {
    console.error("POST /api/link-company error:", err);
    return res.status(500).json({ error: "Failed to link company" });
  }
});

/* ----------------------------------------------------
   SEARCH COMPANIES BY NAME PREFIX (admin only)
---------------------------------------------------- */
router.get("/companies/search", verifyFirebaseToken, async (req, res) => {
  try {
    const requestingUid = req.user.uid;

    const userDoc = await db.collection("users").doc(requestingUid).get();
    if (!userDoc.exists || userDoc.data().role !== "administrator") {
      return res.status(403).json({ error: "Only administrators can search companies" });
    }

    const q = req.query.q;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    const prefix = q.trim();
    const end = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

    const snap = await db.collection("companies")
      .where("companyName", ">=", prefix)
      .where("companyName", "<", end)
      .limit(20)
      .get();

    const results = snap.docs.map((doc) => ({ id: doc.id, companyName: doc.data().companyName }));
    return res.json(results);
  } catch (err) {
    console.error("GET /api/companies/search error:", err);
    return res.status(500).json({ error: "Failed to search companies" });
  }
});

/* ----------------------------------------------------
   GET COMPANY INVITE CODE (owner, representative, or admin)
---------------------------------------------------- */
router.get("/companies/:companyId/invite-code", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const requestingUid = req.user.uid;

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) return res.status(404).json({ error: "Company not found" });

    const { ownerId, inviteCode, representativeIDs = [] } = companyDoc.data();

    const userDoc = await db.collection("users").doc(requestingUid).get();
    const isAdmin = userDoc.exists && userDoc.data().role === "administrator";
    const isOwner = ownerId === requestingUid;
    const isRepresentative =
      Array.isArray(representativeIDs) && representativeIDs.includes(requestingUid);

    if (!isAdmin && !isOwner && !isRepresentative) {
      return res.status(403).json({
        error: "Only the company owner, a representative of this company, or an admin can view the invite code",
      });
    }

    if (!inviteCode) {
      return res.status(404).json({ error: "No invite code found. Please generate one." });
    }

    return res.json({ inviteCode });
  } catch (err) {
    console.error("GET /api/companies/:companyId/invite-code error:", err);
    return res.status(500).json({ error: "Failed to retrieve invite code" });
  }
});

/* ----------------------------------------------------
   PUT COMPANY OFFICE LOCATIONS (owner only)
---------------------------------------------------- */
router.put("/companies/:companyId/locations", verifyFirebaseToken, async (req, res) => {
  const { companyId } = req.params;
  const ownerUid = req.user.uid;
  const { remoteEmployer, officeLocations } = req.body;

  try {
    const companyRef = db.collection("companies").doc(companyId);
    const companyDoc = await companyRef.get();
    if (!companyDoc.exists) {
      return res.status(404).json({
        error: "Company not found",
        code: "COMPANY_DOC_MISSING",
        hint:
          "The API did not find this company in Firestore. If the site loads the company but save fails, the backend Admin SDK is likely using a different Firebase project than the web app—check FIREBASE_SERVICE_ACCOUNT or privateKey.json project_id matches the frontend projectId.",
      });
    }

    const company = companyDoc.data();
    if (company.ownerId !== ownerUid) {
      return res.status(403).json({ error: "Only the company owner can update office locations" });
    }

    const remote = remoteEmployer === true;
    if (remote) {
      await companyRef.update(
        removeUndefined({
          remoteEmployer: true,
          officeLocations: [],
          updatedAt: admin.firestore.Timestamp.now(),
        }),
      );
      return res.json({ success: true, remoteEmployer: true, officeLocations: [] });
    }

    if (!Array.isArray(officeLocations)) {
      return res.status(400).json({ error: "officeLocations must be an array" });
    }
    if (officeLocations.length > MAX_OFFICE_LOCATIONS) {
      return res.status(400).json({ error: `At most ${MAX_OFFICE_LOCATIONS} office locations allowed` });
    }

    const stored = [];
    for (const raw of officeLocations) {
      if (!raw || typeof raw !== "object") {
        return res.status(400).json({ error: "Invalid office location entry" });
      }
      const verified = await verifyOfficeLocationInput({
        id: raw.id,
        label: raw.label,
        geocodeQuery: raw.geocodeQuery,
        city: raw.city,
        state: raw.state,
        zip: raw.zip,
      });
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const v = verified.value;
      stored.push(
        removeUndefined({
          id: v.id,
          label: v.label,
          city: v.city,
          state: v.state,
          zip: v.zip,
          country: v.country,
          lat: v.lat,
          lng: v.lng,
          mapboxId: v.mapboxId,
          venueGeo: new admin.firestore.GeoPoint(v.lat, v.lng),
        }),
      );
    }

    await companyRef.update(
      removeUndefined({
        remoteEmployer: false,
        officeLocations: stored,
        updatedAt: admin.firestore.Timestamp.now(),
      }),
    );

    return res.json({
      success: true,
      remoteEmployer: false,
      officeLocations: stored.map((s) => ({
        id: s.id,
        label: s.label,
        city: s.city,
        state: s.state,
        zip: s.zip ?? null,
        country: s.country ?? null,
        lat: s.lat,
        lng: s.lng,
        mapboxId: s.mapboxId ?? null,
      })),
    });
  } catch (err) {
    console.error("PUT /api/companies/:companyId/locations error:", err);
    return res.status(500).json({ error: "Failed to update office locations" });
  }
});

module.exports = router;
