const express = require("express");
const admin = require("firebase-admin");
const { db } = require("../firebase");
const { verifyFirebaseToken } = require("../helpers");
const { employerCandidatesCollection } = require("../lib/employerCandidates");

const router = express.Router();

router.post("/shortlist/add", verifyFirebaseToken, async (req, res) => {
  try {
    const { studentId, notes } = req.body;
    const employerId = req.user.uid;

    if (!studentId) {
      return res.status(400).json({ error: "Missing studentId" });
    }

    const studentDoc = await db.collection("users").doc(studentId).get();
    if (!studentDoc.exists) {
      return res.status(404).json({ error: "Student not found" });
    }

    await employerCandidatesCollection(db, employerId).doc(studentId).set(
      {
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        notes: notes || "",
        studentName: studentDoc.data().name || studentDoc.data().firstName || "",
        studentEmail: studentDoc.data().email || "",
      },
      { merge: true }
    );

    return res.json({ success: true, message: "Student added to shortlist" });
  } catch (err) {
    console.error("POST /shortlist/add error:", err);
    return res.status(500).json({ error: "Failed to add student to shortlist" });
  }
});

router.get("/shortlist/list", verifyFirebaseToken, async (req, res) => {
  try {
    const employerId = req.user.uid;

    const shortlistSnapshot = await employerCandidatesCollection(db, employerId).orderBy("addedAt", "desc").get();

    const shortlist = shortlistSnapshot.docs.map((doc) => ({
      studentId: doc.id,
      ...doc.data(),
      addedAt: doc.data().addedAt?.toMillis() || null,
    }));

    return res.json({ success: true, shortlist });
  } catch (err) {
    console.error("GET /shortlist/list error:", err);
    return res.status(500).json({ error: "Failed to fetch shortlist" });
  }
});

router.delete("/shortlist/:studentId", verifyFirebaseToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const employerId = req.user.uid;

    await employerCandidatesCollection(db, employerId).doc(studentId).delete();

    return res.json({ success: true, message: "Student removed from shortlist" });
  } catch (err) {
    console.error("DELETE /shortlist/:studentId error:", err);
    return res.status(500).json({ error: "Failed to remove student from shortlist" });
  }
});

module.exports = router;
