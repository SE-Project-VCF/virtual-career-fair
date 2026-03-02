const admin = require("firebase-admin");

function getServiceAccount() {
  // Production / Render path
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Fix escaped newlines in private key (important in env vars)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    return serviceAccount;
  }

  // Local dev path (keep privateKey.json uncommitted)
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require("./privateKey.json");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, auth };
