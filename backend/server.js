// server.js
const express = require('express');
const cors = require('cors');
const { db } = require('./firebase'); // Firebase Admin setup
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(express.json());

// --------------------
// Test route
// --------------------
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// --------------------
// REGISTER STUDENT
// --------------------
app.post('/register-student', async (req, res) => {
  try {
    const { firstName, lastName, email, major, school, username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const docRef = await db.collection('students').add({
      firstName,
      lastName,
      email,
      major,
      school,
      username,
      password: hashedPassword,
      createdAt: admin.firestore.Timestamp.now()
    });

    res.status(201).send({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// --------------------
// REGISTER EMPLOYER
// --------------------
app.post('/register-employer', async (req, res) => {
  try {
    const { companyName, primaryLocation, description, username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const docRef = await db.collection('employers').add({
      companyName,
      primaryLocation,
      description,
      username,
      password: hashedPassword,
      createdAt: admin.firestore.Timestamp.now()
    });

    res.status(201).send({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// --------------------
// REGISTER REPRESENTATIVE
// --------------------
app.post('/register-representative', async (req, res) => {
  try {
    const { firstName, lastName, company, email, username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    // Find employer ID based on company name
    const employerQuery = await db.collection('employers')
      .where('companyName', '==', company)
      .limit(1)
      .get();

    if (employerQuery.empty) {
      return res.status(404).send({ success: false, message: 'Employer not found for this representative' });
    }

    const employerId = employerQuery.docs[0].id;

    const docRef = await db.collection('representatives').add({
      firstName,
      lastName,
      company,
      employerId, // link representative to employer
      email,
      username,
      password: hashedPassword,
      createdAt: admin.firestore.Timestamp.now()
    });

    res.status(201).send({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// --------------------
// CREATE BOOTH (Employer or Representative)
// --------------------
app.post('/create-booth', async (req, res) => {
  try {
    const { creatorId, creatorType, title, description } = req.body;

    if (!creatorId || !creatorType) {
      return res.status(400).send({ success: false, message: 'creatorId and creatorType are required' });
    }

    let employerId;

    if (creatorType === 'employer') {
      const employerDoc = await db.collection('employers').doc(creatorId).get();
      if (!employerDoc.exists) return res.status(404).send({ success: false, message: 'Employer not found' });
      employerId = creatorId;
    } else if (creatorType === 'representative') {
      const repDoc = await db.collection('representatives').doc(creatorId).get();
      if (!repDoc.exists) return res.status(404).send({ success: false, message: 'Representative not found' });
      employerId = repDoc.data().employerId;
    } else {
      return res.status(400).send({ success: false, message: 'Invalid creatorType' });
    }

    const docRef = await db.collection('booths').add({
      employerId,
      title,
      description,
      createdBy: { id: creatorId, type: creatorType },
      createdAt: admin.firestore.Timestamp.now()
    });

    res.status(201).send({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// --------------------
// CREATE JOB (Employer or Representative)
// --------------------
app.post('/create-job', async (req, res) => {
  try {
    const { creatorId, creatorType, name, description, applicationLink, majorsAssociated } = req.body;

    if (!creatorId || !creatorType) {
      return res.status(400).send({ success: false, message: 'creatorId and creatorType are required' });
    }

    let employerId;

    if (creatorType === 'employer') {
      const employerDoc = await db.collection('employers').doc(creatorId).get();
      if (!employerDoc.exists) return res.status(404).send({ success: false, message: 'Employer not found' });
      employerId = creatorId;
    } else if (creatorType === 'representative') {
      const repDoc = await db.collection('representatives').doc(creatorId).get();
      if (!repDoc.exists) return res.status(404).send({ success: false, message: 'Representative not found' });
      employerId = repDoc.data().employerId;
    } else {
      return res.status(400).send({ success: false, message: 'Invalid creatorType' });
    }

    const docRef = await db.collection('jobs').add({
      employerId,
      name,
      description,
      applicationLink,
      majorsAssociated,
      createdBy: { id: creatorId, type: creatorType },
      createdAt: admin.firestore.Timestamp.now()
    });

    res.status(201).send({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// --------------------
// Start Server
// --------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
