const admin = require("firebase-admin");
const serviceAccount = require("./API HERE"); // Make sure path is correct

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();   // ✅ This creates the Firestore instance
module.exports = { db };
