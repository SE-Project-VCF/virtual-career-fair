const admin = require("firebase-admin");
const readline = require("readline");
const serviceAccount = require("./careerfairdb-48105-firebase-adminsdk-fbsvc-9dc17b40da.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ------------------ Allowed Collections & Fields ------------------

const ALLOWED_COLLECTIONS = ["students", "employers", "representatives", "jobs", "booths"];

const COLLECTION_FIELDS = {
  students: {
    firstName: true, lastName: true, email: true, cityZip: true, major: true,
    labels: true, school: true, phone: true, picture: true, username: true, password: true
  },
  employers: {
    companyName: true, primaryLocation: true, secondaryLocations: true,
    jobFields: true, description: true, boothId: true, pictureFile: true, username: true, password: true
  },
  representatives: {
    firstName: true, lastName: true, company: true, email: true, phone: true,
    pictureFile: true, username: true, password: true
  },
  jobs: {
    name: true, description: true, applicationLink: true, majorsAssociated: true, employer: true
  },
  booths: {
    employer: true,
    boothTable: {
      boothName: true,
      location: true,
      description: true,
      representatives: true
    }
  }
};

// ------------------ Recursive Field Validation ------------------

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

// ------------------ Utility Functions ------------------

async function listAll(collection) {
  const snapshot = await db.collection(collection).get();
  if (snapshot.empty) {
    console.log(`\nNo documents found in '${collection}'`);
  } else {
    console.log(`\nAll documents in '${collection}':`);
    snapshot.forEach(doc => console.log(`${doc.id}:`, doc.data()));
  }
  console.log("\n----------------------------------\n");
}

async function queryCollection(collection, field, value) {
  const snapshot = await db.collection(collection).where(field, "==", value).get();
  if (snapshot.empty) {
    console.log(`\nNo documents found in '${collection}' where ${field} = ${value}`);
  } else {
    console.log(`\nQuery results in '${collection}' where ${field} = ${value}:`);
    snapshot.forEach(doc => console.log(`${doc.id}:`, doc.data()));
  }
  console.log("\n----------------------------------\n");
}

async function addDocument(collection, data) {
  const error = validateFields(collection, data);
  if (error) {
    console.log(error);
    return;
  }
  const docRef = await db.collection(collection).add(data);
  console.log(`\nAdded document with ID: ${docRef.id}\n`);
}

async function updateDocument(collection, id, data) {
  const error = validateFields(collection, data);
  if (error) {
    console.log(error);
    return;
  }
  const docRef = db.collection(collection).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    console.log(`❌ Cannot update. Document with ID '${id}' does not exist in '${collection}'`);
    return;
  }
  await docRef.update(data);
  console.log(`\nUpdated document with ID: ${id}\n`);
}

async function deleteDocument(collection, id) {
  const docRef = db.collection(collection).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    console.log(`❌ Cannot delete. Document with ID '${id}' does not exist in '${collection}'`);
    return;
  }
  await docRef.delete();
  console.log(`\nDeleted document with ID: ${id}\n`);
}

// ------------------ Multi-line JSON Input ------------------

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

// ------------------ Interactive Console ------------------

function startConsole() {
  rl.question("Enter command (type 'help' for instructions): ", async (input) => {
    const [command, collection, ...rest] = input.split(" ");
    const args = rest.join(" ");

    // Collection whitelist check
    if (collection && !ALLOWED_COLLECTIONS.includes(collection)) {
      console.log(`❌ Invalid collection name. Allowed: ${ALLOWED_COLLECTIONS.join(", ")}`);
      return startConsole();
    }

    try {
      switch (command.toLowerCase()) {
        case "help":
          console.log(`
Commands:
- list <collection>                  : List all documents in a collection
- query <collection> <field> <value> : Query documents by field=value
- add <collection>                    : Add a new document (multi-line JSON)
- update <collection> <id>            : Update a document by ID (multi-line JSON)
- delete <collection> <id>           : Delete a document by ID
- exit                               : Quit console
Collections: ${ALLOWED_COLLECTIONS.join(", ")}
          `);
          break;

        case "list":
          await listAll(collection);
          break;

        case "query": {
          const [field, ...valueParts] = rest;
          const value = valueParts.join(" ");
          if (!field || !value) {
            console.log("❌ Invalid query format. Example: query students major Computer Science");
          } else {
            await queryCollection(collection, field, value);
          }
          break;
        }

        case "add": {
          readJSON(`Enter JSON for new document in '${collection}'`, async (err, data) => {
            if (err) {
              console.log("❌ Invalid JSON. Try again.");
            } else {
              await addDocument(collection, data);
            }
            startConsole();
          });
          return;
        }

        case "update": {
          const [id] = rest;
          if (!id) {
            console.log("❌ Invalid update format. Example: update students <id>");
          } else {
            readJSON(`Enter JSON to update document '${id}' in '${collection}'`, async (err, data) => {
              if (err) {
                console.log("❌ Invalid JSON. Try again.");
              } else {
                await updateDocument(collection, id, data);
              }
              startConsole();
            });
            return;
          }
          break;
        }

        case "delete": {
          const [id] = rest;
          if (!id) {
            console.log("❌ Invalid delete format. Example: delete students <id>");
          } else {
            await deleteDocument(collection, id);
          }
          break;
        }

        case "exit":
          console.log("Exiting console...");
          return rl.close();

        default:
          console.log("❌ Unknown command. Type 'help' for instructions.");
      }
    } catch (err) {
      console.log("❌ Error:", err.message);
    }

    startConsole();
  });
}

console.log("🔥 Firebase Interactive Console Ready!");
console.log("Type 'help' to see all commands.\n");
startConsole();
