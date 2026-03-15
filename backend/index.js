const { db } = require("./firebase");
const admin = require("firebase-admin");
const bcrypt = require("bcrypt"); // for password encryption

function addStudent() {
  const plainPassword = process.env.STUDENT_PASSWORD;
  if (!plainPassword) {
    throw new Error("Missing STUDENT_PASSWORD environment variable.");
  }

  return bcrypt.hash(plainPassword, 10).then((hashedPassword) => {
    const docRef = db.collection("students").doc(); // auto-generated ID
    return docRef
      .set({
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice@example.com",
        cityZip: "12345",
        major: "Computer Science",
        labels: ["honor student", "scholarship"],
        school: "State University",
        phone: "555-1234", // optional
        picture: "https://example.com/pic.jpg",
        username: "alicej",
        password: hashedPassword,
        createdAt: admin.firestore.Timestamp.now(),
      })
      .then(() => {
        console.log(`Student added with ID: ${docRef.id}`);
      });
  });
}

// CommonJS script: top-level await would require ESM module conversion.
(async () => { // NOSONAR
  try {
    await addStudent();
  } catch (err) {
    console.error("Failed to add student:", err);
    process.exitCode = 1;
  }
})();
