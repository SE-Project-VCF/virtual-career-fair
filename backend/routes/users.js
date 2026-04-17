const express = require("express");
const router = express.Router();
const { db, auth } = require("../firebase");
const admin = require("firebase-admin");
const { removeUndefined, generateInviteCode, verifyFirebaseToken, verifyRepOrOwner } = require("../helpers");
const { streamServerClient } = require("../streamServerClient");
const { mapStudentRecord, studentMatchesInterestQuery } = require("../helpers/studentUserMapping");

/**
 * Employer UI passes the company's primary booth id (`companies.boothId` → global `booths/{id}`).
 * Students may have `users/{uid}/boothHistory/{docId}` keyed by that id, or by a fair-scoped
 * booth copy id (`fairs/.../booths/{fairBoothId}`) when tracking used the fair URL id.
 * Fair booth docs store `originalBoothId` pointing at the global booth.
 */
async function resolveBoothHistoryDocIdsForLookup(primaryBoothId) {
  const ids = new Set([primaryBoothId]);
  try {
    const snap = await db
      .collectionGroup("booths")
      .where("originalBoothId", "==", primaryBoothId)
      .get();
    snap.docs.forEach((d) => ids.add(d.id));
  } catch {
    console.warn(
      "[GET /students] Could not resolve linked fair booth ids (index may be required)"
    );
  }
  return [...ids];
}

async function studentHasBoothHistoryForAnyId(studentId, boothHistoryDocIds) {
  const snaps = await Promise.all(
    boothHistoryDocIds.map((bid) =>
      db.collection("users").doc(studentId).collection("boothHistory").doc(bid).get()
    )
  );
  return snaps.some((d) => d.exists);
}

/* ----------------------------------------------------
   REGISTER USER (Firestore + Stream upsert)
---------------------------------------------------- */
router.post("/register-user", async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, companyName } = req.body;

    if (!email || !password || !role) {
      return res
        .status(400)
        .send({ success: false, error: "Missing required fields" });
    }

    // Prevent administrator registration through public endpoint
    if (role === "administrator") {
      return res
        .status(403)
        .send({ success: false, error: "Administrator accounts cannot be created through public registration" });
    }

    // Create Firebase Auth user
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName || ""} ${lastName || ""}`.trim(),
      emailVerified: true,
    });

    let companyId = null;
    let plainInviteCode = null;

    // Company owner setup
    if (role === "companyOwner") {
      plainInviteCode = generateInviteCode();

      const companyRef = db.collection("companies").doc();
      companyId = companyRef.id;

      await companyRef.set(
        removeUndefined({
          companyId,
          companyName,
          ownerId: userRecord.uid,
          inviteCode: plainInviteCode,
          createdAt: admin.firestore.Timestamp.now(),
        })
      );
    }

    // Save user in Firestore (invite code is not stored on the user doc)
    const docData = removeUndefined({
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role,
      companyId,
      companyName: role === "companyOwner" ? companyName : undefined,
      emailVerified: true,
      createdAt: admin.firestore.Timestamp.now(),
    });

    await db.collection("users").doc(userRecord.uid).set(docData);

    // ---------------------------
    // STREAM UPSERT USER
    // ---------------------------
    try {
      const username = email.includes("@")
        ? email.split("@")[0]
        : email;

      await streamServerClient.upsertUser({
        id: userRecord.uid,
        name: `${firstName || ""} ${lastName || ""}`.trim() || email,
        email,
        username,
        firstName: firstName || "",
        lastName: lastName || "",
        role: "user", // Stream requires a valid role
      });

    } catch (error_) {
      console.error("Stream upsert error:", error_);
    }

    res.send({
      success: true,
      user: {
        uid: userRecord.uid,
        email,
        role,
        companyId,
      },
    });
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   GET LIST OF STUDENTS (for invitation UI)
---------------------------------------------------- */
router.get("/students", verifyFirebaseToken, async (req, res) => {
  try {
    const { userId, search, major, boothId, interest } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Verify user is representative, company owner, or admin
    const authCheck = await verifyRepOrOwner(userId, null);
    if (authCheck) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    let students = [];

    if (boothId) {
      // Find students who visited this booth (global id and/or linked fair booth instance ids)
      const boothHistoryDocIds = await resolveBoothHistoryDocIdsForLookup(boothId);
      console.log(
        `[GET /students] booth filter: ${boothHistoryDocIds.length} resolved doc id(s)`
      );

      const allStudentsQuery = db.collection("users").where("role", "==", "student");
      const studentsSnapshot = await allStudentsQuery.get();

      const studentPromises = studentsSnapshot.docs.map(async (studentDoc) => {
        const studentData = studentDoc.data();
        const visited = await studentHasBoothHistoryForAnyId(studentDoc.id, boothHistoryDocIds);
        if (visited) {
          return mapStudentRecord(studentDoc.id, studentData);
        }
        return null;
      });

      students = (await Promise.all(studentPromises)).filter((s) => s !== null);
      console.log(`Found ${students.length} students who visited booth`);
    } else {
      // Get all students (existing logic)
      let query = db.collection("users").where("role", "==", "student");
      const studentsSnapshot = await query.get();

      students = studentsSnapshot.docs.map((doc) => mapStudentRecord(doc.id, doc.data()));
    }

    // Apply search filter if provided
    if (search?.trim()) {
      const searchLower = search.toLowerCase().trim();
      students = students.filter((student) => {
        const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
        const tagMatch = (student.interestTags || []).some((tag) => {
          const tl = tag.toLowerCase();
          return tl.includes(searchLower) || searchLower.includes(tl);
        });
        const skillsLower = (student.skills || "").toLowerCase();
        return (
          fullName.includes(searchLower) ||
          student.email.toLowerCase().includes(searchLower) ||
          student.major.toLowerCase().includes(searchLower) ||
          skillsLower.includes(searchLower) ||
          tagMatch
        );
      });
    }

    // Apply major filter if provided
    if (major?.trim()) {
      const majorLower = major.toLowerCase().trim();
      students = students.filter((student) =>
        student.major.toLowerCase().includes(majorLower)
      );
    }

    // Apply interest tag filter (e.g. interest=Finance)
    if (interest?.trim()) {
      const interestTrimmed = interest.trim();
      students = students.filter((student) => studentMatchesInterestQuery(student, interestTrimmed));
    }

    console.log(`Returning ${students.length} students`);
    return res.json({ students });
  } catch (err) {
    console.error("Error fetching students:", err);
    return res.status(500).json({ error: "Failed to fetch students", details: err.message });
  }
});

/* ----------------------------------------------------
   CREATE ADMIN ACCOUNT (Protected - requires secret key)
---------------------------------------------------- */
router.post("/create-admin", async (req, res) => {
  try {
    const { firstName, lastName, email, password, adminSecret } = req.body;

    if (!email || !password || !adminSecret) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify admin secret key
    const expectedSecret = process.env.ADMIN_SECRET_KEY;
    if (!expectedSecret) {
      console.error("ADMIN_SECRET_KEY not set in environment variables");
      return res.status(500).json({ error: "Server configuration error" });
    }

    if (adminSecret !== expectedSecret) {
      return res.status(403).json({ error: "Invalid admin secret key" });
    }

    // Check if user already exists
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      // User exists, check if they're already an admin
      const userDoc = await db.collection("users").doc(userRecord.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.role === "administrator") {
          return res.status(400).json({ error: "User is already an administrator" });
        }
        // Update existing user to admin
        await db.collection("users").doc(userRecord.uid).update({
          role: "administrator",
        });
        return res.json({
          success: true,
          message: "User upgraded to administrator",
          uid: userRecord.uid
        });
      }
    } catch (err) {
      if (err.code !== "auth/user-not-found") {
        throw err;
      }
      // User doesn't exist, create new one
    }

    // Create new Firebase Auth user
    if (!userRecord) {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: `${firstName || ""} ${lastName || ""}`.trim(),
        emailVerified: true, // Auto-verify admin emails
      });
    }

    // Save user in Firestore
    const docData = removeUndefined({
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role: "administrator",
      emailVerified: true,
      createdAt: admin.firestore.Timestamp.now(),
    });

    await db.collection("users").doc(userRecord.uid).set(docData, { merge: true });

    // Upsert to Stream Chat
    try {
      const username = email.includes("@")
        ? email.split("@")[0]
        : email;

      await streamServerClient.upsertUser({
        id: userRecord.uid,
        name: `${firstName || ""} ${lastName || ""}`.trim() || email,
        email,
        username,
        firstName: firstName || "",
        lastName: lastName || "",
        role: "user",
      });
    } catch (error_) {
      console.error("STREAM UPSERT ERROR:", error_);
    }

    return res.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email,
        role: "administrator",
      },
    });
  } catch (err) {
    console.error("Error creating admin:", err);
    return res.status(500).json({ error: err.message || "Failed to create admin account" });
  }
});

module.exports = router;
