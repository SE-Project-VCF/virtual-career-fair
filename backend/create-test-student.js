const admin = require("firebase-admin");
const { db, auth } = require("./firebase");

async function createTestStudent() {
  const email = "student1@test.com";
  const password = "";
  const firstName = "Student";
  const lastName = "One";
  const role = "student";

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
      emailVerified: true,
    });

    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role,
      emailVerified: true,
      createdAt: admin.firestore.Timestamp.now(),
    });

    console.log(`Created student: ${email} (uid: ${userRecord.uid})`);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    process.exit(0);
  }
}

createTestStudent();
