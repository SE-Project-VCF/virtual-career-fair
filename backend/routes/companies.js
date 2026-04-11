const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const admin = require("firebase-admin");
const { verifyFirebaseToken, generateInviteCode, removeUndefined } = require("../helpers");

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

module.exports = router;
