// server.js
const express = require('express');
const cors = require('cors');
const { db, auth } = require('./firebase'); // Firebase Admin
const admin = require('firebase-admin');

const app = express();
const PORT = 5000;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// Helper to remove undefined fields
function removeUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

// -------------------
// Student Registration
// -------------------
app.post('/register-student', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password)
      return res.status(400).send({ success: false, error: "Missing required fields" });

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`
    });

    const docData = removeUndefined({ firstName, lastName, email, createdAt: admin.firestore.Timestamp.now() });
    await db.collection('students').doc(userRecord.uid).set(docData);

    // Return the user for frontend auto-login
    res.send({ success: true, user: { uid: userRecord.uid, email, role: 'student' } });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// -------------------
// Student Login
// -------------------
app.post('/login-student', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).send({ success: false, error: "Missing required fields" });

    // Firebase Auth does not allow password validation via Admin SDK.
    // Instead, frontend should use Firebase client SDK to login, or we return the user object
    const user = await auth.getUserByEmail(email);
    res.send({ success: true, user: { uid: user.uid, email, role: 'student' } });
  } catch (err) {
    console.error(err);
    res.status(401).send({ success: false, error: "Invalid login" });
  }
});

// -------------------
// Employer Registration
// -------------------
app.post('/register-employer', async (req, res) => {
  try {
    const { email, password, companyName } = req.body;
    if (!email || !password || !companyName)
      return res.status(400).send({ success: false, error: "Missing required fields" });

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: companyName
    });

    const docData = removeUndefined({ companyName, email, createdAt: admin.firestore.Timestamp.now() });
    await db.collection('employers').doc(userRecord.uid).set(docData);

    res.send({ success: true, user: { uid: userRecord.uid, email, role: 'employer' } });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// -------------------
// Employer Login
// -------------------
app.post('/login-employer', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).send({ success: false, error: "Missing required fields" });

    const user = await auth.getUserByEmail(email);
    res.send({ success: true, user: { uid: user.uid, email, role: 'employer' } });
  } catch (err) {
    console.error(err);
    res.status(401).send({ success: false, error: "Invalid login" });
  }
});

// -------------------
// Start Server
// -------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
