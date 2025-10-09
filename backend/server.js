const express = require('express');
const cors = require('cors');
const { db } = require('./firebase'); // import Firebase Admin setup
const admin = require('firebase-admin'); // needed for timestamps
const bcrypt = require('bcrypt'); // for password hashing

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// ---------------------------
// New route: Add a student
// ---------------------------
app.post('/add-student', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            cityZip,
            major,
            labels,
            school,
            phone,
            picture,
            username,
            password
        } = req.body;

        // Encrypt password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Add to Firestore
        const docRef = db.collection('students').doc(); // auto-generated ID
        await docRef.set({
            firstName,
            lastName,
            email,
            cityZip,
            major,
            labels,
            school,
            phone: phone || null, // optional
            picture,
            username,
            password: hashedPassword,
            createdAt: admin.firestore.Timestamp.now()
        });

        res.send({ success: true, id: docRef.id });
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: err.message });
    }
});

// Add employer registration endpoint
app.post('/add-employer', async (req, res) => {
    try {
        const {
            companyName,
            email,
            password,
            industry,
            companySize,
            website,
            description
        } = req.body;

        // Encrypt password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Add to Firestore
        const docRef = db.collection('employers').doc();
        await docRef.set({
            companyName,
            email,
            industry,
            companySize,
            website,
            description,
            password: hashedPassword,
            createdAt: admin.firestore.Timestamp.now()
        });

        res.send({ success: true, id: docRef.id });
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: err.message });
    }
});

// Add login endpoint for students
app.post('/login-student', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find student by email
        const studentsSnapshot = await db.collection('students')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (studentsSnapshot.empty) {
            return res.status(401).send({ success: false, error: 'Invalid email or password' });
        }

        const studentDoc = studentsSnapshot.docs[0];
        const studentData = studentDoc.data();

        // Verify password
        const isValidPassword = await bcrypt.compare(password, studentData.password);
        if (!isValidPassword) {
            return res.status(401).send({ success: false, error: 'Invalid email or password' });
        }

        // Remove password from response
        const { password: _, ...userData } = studentData;
        res.send({ success: true, user: { id: studentDoc.id, ...userData, role: 'student' } });
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: err.message });
    }
});

// Add login endpoint for employers
app.post('/login-employer', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find employer by email
        const employersSnapshot = await db.collection('employers')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (employersSnapshot.empty) {
            return res.status(401).send({ success: false, error: 'Invalid email or password' });
        }

        const employerDoc = employersSnapshot.docs[0];
        const employerData = employerDoc.data();

        // Verify password
        const isValidPassword = await bcrypt.compare(password, employerData.password);
        if (!isValidPassword) {
            return res.status(401).send({ success: false, error: 'Invalid email or password' });
        }

        // Remove password from response
        const { password: _, ...userData } = employerData;
        res.send({ success: true, user: { id: employerDoc.id, ...userData, role: 'employer' } });
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
