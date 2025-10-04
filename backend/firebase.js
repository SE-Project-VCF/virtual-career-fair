const admin = require("firebase-admin");
const serviceAccount = require("./careerfairdb-48105-firebase-adminsdk-fbsvc-9dc17b40da.json"); // Make sure path is correct

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();   // ✅ This creates the Firestore instance
module.exports = { db };
