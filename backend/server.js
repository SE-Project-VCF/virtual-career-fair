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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
