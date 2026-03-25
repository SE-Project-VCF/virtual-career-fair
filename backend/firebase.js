const admin = require("firebase-admin");

function getServiceAccount() {
  // Production / Render path
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Fix escaped newlines in private key (important in env vars)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replaceAll(String.raw`\n`, "\n");
    }

    return serviceAccount;
  }

  // Local dev path (keep privateKey.json uncommitted)
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require("./privateKey.json");
}

const DEFAULT_BUCKET = "careerfairdb-48105.firebasestorage.app"; // your current value

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    // Prefer env var in prod, fallback to your current bucket for local/dev
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET,
  });
}

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket(); // ✅ this uses storageBucket from initializeApp

module.exports = { db, auth, bucket };