// console.js
const admin = require("firebase-admin");
const readline = require("node:readline");

// Only initialize Firebase when running as CLI (not in tests)
let db;
if (process.env.NODE_ENV === "test") {
  // In test environment, db will be mocked
  db = require("./firebase").db;
} else {
  const serviceAccount = require("./privateKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
}
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ------------------ Allowed Collections & Fields ------------------

const ALLOWED_COLLECTIONS = ["students", "employers", "representatives", "jobs", "booths"];

const COLLECTION_FIELDS = {
  students: {
    firstName: true, lastName: true, email: true, cityZip: true, major: true,
    labels: true, school: true, phone: true, picture: true, username: true, createdAt: true
  },
  employers: {
    companyName: true, primaryLocation: true, secondaryLocations: true,
    jobFields: true, description: true, boothId: true, pictureFile: true, username: true, email: true, createdAt: true
  },
  representatives: {
    firstName: true, lastName: true, company: true, email: true, phone: true,
    pictureFile: true, username: true, createdAt: true
  },
  jobs: {
    name: true, description: true, applicationLink: true, majorsAssociated: true, employer: true
  },
  booths: {
    employer: true,
    boothTable: { boothName: true, location: true, description: true, representatives: true }
  }
};

// ------------------ Field Validation ------------------

function validateFieldsRecursive(schema, data, path = "") {
  for (const key of Object.keys(data)) {
    if (!schema[key]) {
      return `❌ Invalid field '${path + key}'`;
    }
    if (typeof data[key] === "object" && data[key] !== null && typeof schema[key] === "object") {
      const nestedError = validateFieldsRecursive(schema[key], data[key], path + key + ".");
      if (nestedError) return nestedError;
    }
  }
  return null;
}

function validateFields(collection, data) {
  const schema = COLLECTION_FIELDS[collection];
  return validateFieldsRecursive(schema, data);
}

// ------------------ CRUD Functions ------------------

async function listAll(collection) {
  const snapshot = await db.collection(collection).get();
  if (snapshot.empty) return console.log(`No documents found in '${collection}'`);
  snapshot.forEach(doc => console.log(`${doc.id}:`, doc.data()));
}

async function addDocument(collection, data) {
  const error = validateFields(collection, data);
  if (error) return console.log(error);
  const docRef = await db.collection(collection).add(data);
  console.log(`✅ Added document with ID: ${docRef.id}`);
}

async function updateDocument(collection, id, data) {
  const error = validateFields(collection, data);
  if (error) return console.log(error);
  const docRef = db.collection(collection).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return console.log(`❌ Document '${id}' not found`);
  await docRef.update(data);
  console.log(`✅ Updated document with ID: ${id}`);
}

async function deleteDocument(collection, id) {
  const docRef = db.collection(collection).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return console.log(`❌ Document '${id}' not found`);
  await docRef.delete();
  console.log(`🗑️ Deleted document with ID: ${id}`);
}

// ------------------ Input and Command Loop ------------------

function readJSON(promptText, callback) {
  console.log(`${promptText} (Press Enter twice when done)`);
  let input = "";
  rl.on("line", (line) => {
    if (line.trim() === "") {
      rl.removeAllListeners("line");
      try {
        const data = JSON.parse(input);
        callback(null, data);
      } catch (err) {
        callback(err, null);
      }
    } else {
      input += line;
    }
  });
}

function startConsole() {
  rl.question("Enter command (help for list): ", async (input) => {
    const [command, collection, ...rest] = input.split(" ");
    const args = rest.join(" ");

    if (collection && !ALLOWED_COLLECTIONS.includes(collection)) {
      console.log(`❌ Invalid collection. Allowed: ${ALLOWED_COLLECTIONS.join(", ")}`);
      return startConsole();
    }

    try {
      switch (command.toLowerCase()) {
        case "help":
          console.log(`
Commands:
- list <collection>
- add <collection>
- update <collection> <id>
- delete <collection> <id>
- exit
          `);
          break;

        case "list":
          await listAll(collection);
          break;

        case "add":
          readJSON(`Enter JSON for new document in '${collection}'`, async (err, data) => {
            if (err) console.log("❌ Invalid JSON");
            else await addDocument(collection, data);
            startConsole();
          });
          return;

        case "update": {
          const [id] = rest;
          if (!id) return console.log("❌ Must provide document ID");
          readJSON(`Enter JSON to update document '${id}'`, async (err, data) => {
            if (err) console.log("❌ Invalid JSON");
            else await updateDocument(collection, id, data);
            startConsole();
          });
          return;
        }

        case "delete":
          await deleteDocument(collection, args);
          break;

        case "exit":
          console.log("Goodbye!");
          rl.close();
          return;

        default:
          console.log("❌ Unknown command");
      }
    } catch (err) {
      console.log("❌ Error:", err.message);
    }

    startConsole();
  });
}

// Export functions for testing
module.exports = {
  validateFieldsRecursive,
  validateFields,
  listAll,
  addDocument,
  updateDocument,
  deleteDocument,
  ALLOWED_COLLECTIONS,
  COLLECTION_FIELDS,
};

// Only start console when run directly (not when imported for testing)
if (require.main === module) {
  console.log("🔥 Firebase Admin Console Ready");
  startConsole();
}
