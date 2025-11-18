/**
 * Script to create an administrator account
 * 
 * Usage: node scripts/createAdmin.js <email> <password> [firstName] [lastName]
 * 
 * Requires ADMIN_SECRET_KEY to be set in .env file
 */

require("dotenv").config();
const { db, auth } = require("../firebase");
const admin = require("firebase-admin");
const { StreamChat } = require("stream-chat");

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: node scripts/createAdmin.js <email> <password> [firstName] [lastName]");
    console.error("Example: node scripts/createAdmin.js admin@example.com SecurePass123 John Doe");
    process.exit(1);
  }

  const email = args[0];
  const password = args[1];
  const firstName = args[2] || "";
  const lastName = args[3] || "";

  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) {
    console.error("❌ ERROR: ADMIN_SECRET_KEY not set in .env file");
    console.error("Please set ADMIN_SECRET_KEY in your .env file");
    console.error("Example: ADMIN_SECRET_KEY=your-secret-key-here");
    process.exit(1);
  }

  try {
    console.log("Creating administrator account...");
    
    // Check if user already exists
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log("User already exists, upgrading to administrator...");
      
      // Check if already admin
      const userDoc = await db.collection("users").doc(userRecord.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.role === "administrator") {
          console.log("✅ User is already an administrator");
          console.log(`   Email: ${email}`);
          console.log(`   UID: ${userRecord.uid}`);
          return;
        }
      }
      
      // Update existing user to admin
      await db.collection("users").doc(userRecord.uid).update({
        role: "administrator",
        firstName: firstName || userDoc.data()?.firstName,
        lastName: lastName || userDoc.data()?.lastName,
      });
      
      console.log("✅ User upgraded to administrator successfully!");
      console.log(`   Email: ${email}`);
      console.log(`   UID: ${userRecord.uid}`);
      return;
    } catch (err) {
      if (err.code !== "auth/user-not-found") {
        throw err;
      }
      // User doesn't exist, create new one
    }

    // Create new Firebase Auth user
    userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName || ""} ${lastName || ""}`.trim(),
      emailVerified: true, // Auto-verify admin emails
    });

    // Save user in Firestore
    const docData = {
      uid: userRecord.uid,
      firstName,
      lastName,
      email,
      role: "administrator",
      emailVerified: true,
      createdAt: admin.firestore.Timestamp.now(),
    };

    // Remove undefined values
    Object.keys(docData).forEach(key => {
      if (docData[key] === undefined) {
        delete docData[key];
      }
    });

    await db.collection("users").doc(userRecord.uid).set(docData);

    // Upsert to Stream Chat if configured
    try {
      const streamApiKey = process.env.STREAM_API_KEY;
      const streamApiSecret = process.env.STREAM_API_SECRET;
      
      if (streamApiKey && streamApiSecret) {
        const streamServer = StreamChat.getInstance(streamApiKey, streamApiSecret);
        const username = email.includes("@") ? email.split("@")[0] : email;

        await streamServer.upsertUser({
          id: userRecord.uid,
          name: `${firstName || ""} ${lastName || ""}`.trim() || email,
          email,
          username,
          firstName: firstName || "",
          lastName: lastName || "",
          role: "user",
        });
        console.log("   Stream Chat user created");
      }
    } catch (streamErr) {
      console.warn("   Warning: Could not create Stream Chat user:", streamErr.message);
    }

    console.log("✅ Administrator account created successfully!");
    console.log(`   Email: ${email}`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Password: ${password}`);
    console.log("\n⚠️  IMPORTANT: Save the password securely. It won't be shown again.");
  } catch (err) {
    console.error("❌ Failed to create admin:", err.message);
    if (err.code === "auth/email-already-exists") {
      console.error("   A user with this email already exists. Use the upgrade functionality.");
    }
    process.exit(1);
  }
}

createAdmin();

