const express = require("express");
const cors = require("cors");
const { db, auth } = require("./firebase");
const admin = require("firebase-admin");

const app = express();
const PORT = 5000;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

function removeUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

// -------------------
// Register User (Student, Representative, or Company Owner)
// -------------------
app.post("/register-user", async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, companyName } = req.body;

    if (!email || !password || !role) {
      return res.status(400).send({ success: false, error: "Missing required fields" });
    }

    // Create the user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName || ""} ${lastName || ""}`.trim(),
    });

    let companyId = null;
    let inviteCode = null;

    // If this is a company owner, create a company record too
    if (role === "companyOwner") {
      inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      const companyRef = db.collection("companies").doc();
      companyId = companyRef.id;

      await companyRef.set(
        removeUndefined({
          companyId,
          companyName,
          ownerId: userRecord.uid,
          inviteCode,
          createdAt: admin.firestore.Timestamp.now(),
        })
      );
    }

    // Create the user entry
    const docData = removeUndefined({
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role, // student, representative, or companyOwner
      companyId,
      inviteCode,
      emailVerified: false,
      createdAt: admin.firestore.Timestamp.now(),
    });

    await db.collection("users").doc(userRecord.uid).set(docData);

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

// -------------------
// Add Job (Company only)
// -------------------
app.post("/add-job", async (req, res) => {
  try {
    const { companyId, name, description, majorsAssociated, applicationLink } = req.body;

    if (!companyId || !name) {
      return res.status(400).send({ success: false, error: "Missing required fields" });
    }

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res.status(403).send({ success: false, error: "Invalid company ID" });
    }

    const jobRef = await db.collection("jobs").add(
      removeUndefined({
        companyId,
        name,
        description,
        majorsAssociated,
        applicationLink,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, jobId: jobRef.id });
  } catch (err) {
    console.error("Error adding job:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// -------------------
// Add Booth (Company only)
// -------------------
app.post("/add-booth", async (req, res) => {
  try {
    const { companyId, boothName, location, description, representatives } = req.body;

    if (!companyId || !boothName) {
      return res.status(400).send({ success: false, error: "Missing required fields" });
    }

    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res.status(403).send({ success: false, error: "Invalid company ID" });
    }

    const boothRef = await db.collection("booths").add(
      removeUndefined({
        companyId,
        boothName,
        location,
        description,
        representatives,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, boothId: boothRef.id });
  } catch (err) {
    console.error("Error adding booth:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
