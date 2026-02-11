const { db } = require("./firebase");
const admin = require("firebase-admin");
const bcrypt = require("bcrypt"); // for password encryption

async function addStudent() {
  // Encrypt password before saving
  const plainPassword = "student123";
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const docRef = db.collection("students").doc(); // auto-generated ID
  await docRef.set({
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
    createdAt: admin.firestore.Timestamp.now()
  });

  console.log(`Student added with ID: ${docRef.id}`);
}

addStudent();
