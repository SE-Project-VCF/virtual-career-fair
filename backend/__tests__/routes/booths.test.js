const { mockDocSnap, mockQuerySnap, createTestApp } = require("../testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    increment: jest.fn((n) => `INCREMENT(${n})`),
    arrayUnion: jest.fn((...args) => `ARRAY_UNION(${args})`),
    arrayRemove: jest.fn((...args) => `ARRAY_REMOVE(${args})`),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
    storage: jest.fn(() => ({
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({
          save: jest.fn().mockResolvedValue(),
          getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com/logo.png"]),
          exists: jest.fn().mockResolvedValue([true]),
        })),
        getFiles: jest.fn().mockResolvedValue([[]]),
      })),
    })),
  };
});

jest.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: jest.fn(() => ({
      upsertUser: jest.fn().mockResolvedValue({}),
      createToken: jest.fn().mockReturnValue("tok"),
      queryChannels: jest.fn().mockResolvedValue([]),
    })),
  },
}));

jest.mock("../../firebase", () => ({
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../../helpers", () => {
  const actual = jest.requireActual("../../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const boothsRouter = require("../../routes/booths");
const { db, auth } = require("../../firebase");
const { verifyAdmin } = require("../../helpers");
const admin = require("firebase-admin");
const app = createTestApp(boothsRouter);

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

// --- collection mock factories (kept flat to avoid deep nesting) ---

function makeCompanyCollection(companyDoc) {
  const docRef = { get: jest.fn().mockResolvedValue(companyDoc) };
  return { doc: jest.fn(() => docRef) };
}

function makeUserCollection(userDoc) {
  const docRef = { get: jest.fn().mockResolvedValue(userDoc) };
  return { doc: jest.fn(() => docRef) };
}

function makeBoothSubcollection(visitorDoc, ratingsSnap) {
  const visitorDocRef = {
    get: jest.fn().mockResolvedValue(visitorDoc),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const studentVisitsRef = {
    doc: jest.fn(() => visitorDocRef),
    get: jest.fn().mockResolvedValue(mockQuerySnap([])),
  };

  const ratingDocRef = {
    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const ratingsRef = {
    doc: jest.fn(() => ratingDocRef),
    get: jest.fn().mockResolvedValue(ratingsSnap),
  };

  return (sub) => {
    if (sub === "studentVisits") return studentVisitsRef;
    if (sub === "ratings") return ratingsRef;
    return {};
  };
}

function makeBoothCollection(boothDoc, boothAdd, visitorDoc, ratingsSnap) {
  const boothDocRef = {
    get: jest.fn().mockResolvedValue(boothDoc),
    update: jest.fn().mockResolvedValue(undefined),
    id: boothDoc.id || "booth-1",
    collection: jest.fn(makeBoothSubcollection(visitorDoc, ratingsSnap)),
  };
  return {
    doc: jest.fn(() => boothDocRef),
    add: jest.fn().mockResolvedValue(boothAdd),
  };
}

function makeFairSubBoothDocRef() {
  return { get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) };
}

function makeFairSubBoothCollection() {
  return { doc: jest.fn(makeFairSubBoothDocRef) };
}

function makeFairDocRef() {
  return { collection: jest.fn(() => makeFairSubBoothCollection()) };
}

function makeFairsCollection(fairsSnap) {
  return {
    doc: jest.fn(() => makeFairDocRef()),
    get: jest.fn().mockResolvedValue(fairsSnap),
  };
}

/**
 * Wire up db.collection with sensible defaults for all collections used in booths.js.
 * Pass overrides for any of the named documents/snapshots.
 */
function mockCollections({
  companyDoc = mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1"),
  boothDoc = mockDocSnap({ companyId: "company-1", boothName: "Test Booth", currentVisitors: [] }, true, "booth-1"),
  boothAdd = { id: "new-booth-id" },
  userDoc = mockDocSnap({ role: "student", companyId: "company-1", firstName: "Jane", lastName: "Doe", email: "jane@test.com", major: "CS" }, true, "test-uid"),
  fairsSnap = mockQuerySnap([]),
  visitorDoc = mockDocSnap(null, false, "test-uid"),
  ratingsSnap = mockQuerySnap([]),
} = {}) {
  db.collection.mockImplementation((name) => {
    if (name === "companies") return makeCompanyCollection(companyDoc);
    if (name === "booths") return makeBoothCollection(boothDoc, boothAdd, visitorDoc, ratingsSnap);
    if (name === "users") return makeUserCollection(userDoc);
    if (name === "fairs") return makeFairsCollection(fairsSnap);
  });
}

/* ============================================================
   POST /api/booths
============================================================ */
describe("POST /api/booths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).post("/api/booths").send({ companyId: "c1", boothName: "Booth" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ boothName: "Booth" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/i);
  });

  it("returns 400 when boothName is missing", async () => {
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/i);
  });

  it("returns 400 when boothName exceeds 200 characters", async () => {
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1", boothName: "a".repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/200 characters/i);
  });

  it("returns 400 when location exceeds 200 characters", async () => {
    mockCollections();
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1", boothName: "Booth", location: "x".repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/200 characters/i);
  });

  it("returns 400 when description exceeds 2000 characters", async () => {
    mockCollections();
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1", boothName: "Booth", description: "d".repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2000 characters/i);
  });

  it("returns 404 when company does not exist", async () => {
    mockCollections({ companyDoc: mockDocSnap(null, false) });
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "bad-company", boothName: "Booth" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Invalid company ID/i);
  });

  it("returns 403 when user is not authorized for company", async () => {
    mockCollections({
      companyDoc: mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "company-1"),
    });
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1", boothName: "Booth" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized/i);
  });

  it("returns 200 with boothId on success", async () => {
    mockCollections({ boothAdd: { id: "new-booth-id" } });
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1", boothName: "My Booth", location: "Hall A", description: "Great booth" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.boothId).toBe("new-booth-id");
  });

  it("returns 200 and sanitizes boothName whitespace", async () => {
    mockCollections({ boothAdd: { id: "sanitized-id" } });
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1", boothName: "  Trimmed Booth  " });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB down")) })) };
      }
    });
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "company-1", boothName: "Booth" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/DB down/i);
  });
});

/* ============================================================
   POST /api/upload-booth-logo
============================================================ */
describe("POST /api/upload-booth-logo", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .attach("file", Buffer.from("img"), { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader())
      .field("companyId", "company-1");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file provided/i);
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader())
      .attach("file", Buffer.from("img"), { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Company ID required/i);
  });

  it("rejects non-image files (multer fileFilter blocks them before the route handler)", async () => {
    // The upload middleware calls cb(new Error("Only image files are allowed")) for non-image
    // MIME types on this path. Express 5 propagates the multer error, so the response is not 200.
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader())
      .field("companyId", "company-1")
      .attach("file", Buffer.from("pdf content"), { filename: "doc.pdf", contentType: "application/pdf" });
    expect(res.status).not.toBe(200);
  });

  it("returns 200 with filePath on successful upload", async () => {
    const bucketMock = {
      file: jest.fn(() => ({
        save: jest.fn().mockResolvedValue(),
        getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com/logo.png"]),
      })),
    };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucketMock) });

    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader())
      .field("companyId", "company-1")
      .attach("file", Buffer.from("img data"), { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.filePath).toMatch(/boothLogos\/company-1\/test-uid\//);
    expect(res.body.message).toMatch(/uploaded successfully/i);
  });

  it("returns 500 on storage save error", async () => {
    admin.storage.mockReturnValue({
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({
          save: jest.fn().mockRejectedValue(new Error("Storage failure")),
        })),
      })),
    });

    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader())
      .field("companyId", "company-1")
      .attach("file", Buffer.from("img data"), { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Storage failure/i);
  });
});

/* ============================================================
   GET /api/get-booth-logo-url/:companyId
============================================================ */
describe("GET /api/get-booth-logo-url/:companyId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/get-booth-logo-url/company-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when no logo files exist", async () => {
    admin.storage.mockReturnValue({
      bucket: jest.fn(() => ({
        getFiles: jest.fn().mockResolvedValue([[]]),
      })),
    });

    const res = await request(app)
      .get("/api/get-booth-logo-url/company-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No logo found/i);
  });

  it("returns 200 with signed URL when logo exists", async () => {
    const fileRef = {
      getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com/logo.png"]),
    };
    admin.storage.mockReturnValue({
      bucket: jest.fn(() => ({
        getFiles: jest.fn().mockResolvedValue([[fileRef]]),
      })),
    });

    const res = await request(app)
      .get("/api/get-booth-logo-url/company-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logoUrl).toBe("https://signed-url.com/logo.png");
  });

  it("returns 500 on storage error", async () => {
    admin.storage.mockReturnValue({
      bucket: jest.fn(() => ({
        getFiles: jest.fn().mockRejectedValue(new Error("Storage unavailable")),
      })),
    });

    const res = await request(app)
      .get("/api/get-booth-logo-url/company-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Storage unavailable/i);
  });
});

/* ============================================================
   POST /api/booth/:boothId/track-view
============================================================ */
describe("POST /api/booth/:boothId/track-view", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).post("/api/booth/booth-1/track-view");
    expect(res.status).toBe(401);
  });

  it("returns 404 when student user does not exist", async () => {
    mockCollections({ userDoc: mockDocSnap(null, false) });
    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Student not found/i);
  });

  it("returns 404 when booth does not exist", async () => {
    // Users exist but booth is not found in booths or fairs
    mockCollections({
      userDoc: mockDocSnap({ firstName: "Jane", lastName: "Doe", email: "jane@test.com", major: "CS" }, true),
      boothDoc: mockDocSnap(null, false),
      fairsSnap: mockQuerySnap([]),
    });
    const res = await request(app)
      .post("/api/booth/nonexistent-booth/track-view")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Booth not found/i);
  });

  it("creates a new visitor record on first visit", async () => {
    mockCollections({
      userDoc: mockDocSnap({ firstName: "Jane", lastName: "Doe", email: "jane@test.com", major: "CS" }, true),
      boothDoc: mockDocSnap({ companyId: "company-1", boothName: "Test Booth", currentVisitors: [] }, true, "booth-1"),
      visitorDoc: mockDocSnap(null, false),
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tracked).toBe(true);
  });

  it("updates existing visitor record on subsequent visit", async () => {
    mockCollections({
      userDoc: mockDocSnap({ firstName: "Jane", lastName: "Doe", email: "jane@test.com", major: "CS" }, true),
      boothDoc: mockDocSnap({ companyId: "company-1", boothName: "Test Booth", currentVisitors: ["test-uid"] }, true, "booth-1"),
      visitorDoc: mockDocSnap({ isCurrentlyViewing: false, viewCount: 1 }, true, "test-uid"),
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tracked).toBe(true);
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => {
      return { doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB error")) })) };
    });
    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/DB error/i);
  });
});

/* ============================================================
   POST /api/booth/:boothId/track-leave
============================================================ */
describe("POST /api/booth/:boothId/track-leave", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).post("/api/booth/booth-1/track-leave");
    expect(res.status).toBe(401);
  });

  it("returns 404 when booth does not exist", async () => {
    mockCollections({
      boothDoc: mockDocSnap(null, false),
      fairsSnap: mockQuerySnap([]),
    });
    const res = await request(app)
      .post("/api/booth/nonexistent-booth/track-leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Booth not found/i);
  });

  it("returns 200 and removes student from current visitors", async () => {
    mockCollections({
      boothDoc: mockDocSnap({ companyId: "company-1", currentVisitors: ["test-uid"] }, true, "booth-1"),
      visitorDoc: mockDocSnap({ isCurrentlyViewing: true }, true, "test-uid"),
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tracked).toBe(false);
  });

  it("returns 200 even when visitor record does not exist", async () => {
    mockCollections({
      boothDoc: mockDocSnap({ companyId: "company-1", currentVisitors: [] }, true, "booth-1"),
      visitorDoc: mockDocSnap(null, false),
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB error")) })),
    }));
    const res = await request(app)
      .post("/api/booth/booth-1/track-leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/DB error/i);
  });
});

/* ============================================================
   GET /api/booth/:boothId/current-visitors
============================================================ */
describe("GET /api/booth/:boothId/current-visitors", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/booth/booth-1/current-visitors");
    expect(res.status).toBe(401);
  });

  it("returns 404 when booth does not exist", async () => {
    mockCollections({
      boothDoc: mockDocSnap(null, false),
      fairsSnap: mockQuerySnap([]),
    });
    const res = await request(app)
      .get("/api/booth/nonexistent-booth/current-visitors")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Booth not found/i);
  });

  it("returns 200 with empty visitors when no one is viewing", async () => {
    mockCollections({
      boothDoc: mockDocSnap({ companyId: "company-1", currentVisitors: [] }, true, "booth-1"),
    });

    const res = await request(app)
      .get("/api/booth/booth-1/current-visitors")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.currentVisitorCount).toBe(0);
    expect(res.body.currentVisitors).toEqual([]);
  });

  it("returns 200 with visitor details when students are viewing", async () => {
    const visitorData = {
      studentId: "student-1",
      firstName: "Alice",
      lastName: "Smith",
      major: "Engineering",
    };
    const visitorDocSnap = mockDocSnap(visitorData, true, "student-1");

    // Build booth doc with currentVisitors list
    const boothDocSnap = mockDocSnap(
      { companyId: "company-1", currentVisitors: ["student-1"] },
      true,
      "booth-1"
    );

    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        const studentVisitsRef = {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(visitorDocSnap),
          })),
        };
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(boothDocSnap),
            update: jest.fn().mockResolvedValue(undefined),
            id: "booth-1",
            collection: jest.fn(() => studentVisitsRef),
          })),
        };
      }
      if (name === "fairs") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
    });

    const res = await request(app)
      .get("/api/booth/booth-1/current-visitors")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.currentVisitorCount).toBe(1);
    expect(res.body.currentVisitors[0].firstName).toBe("Alice");
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB error")) })),
    }));
    const res = await request(app)
      .get("/api/booth/booth-1/current-visitors")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/DB error/i);
  });
});

/* ============================================================
   GET /api/booth-visitors/:boothId
============================================================ */
describe("GET /api/booth-visitors/:boothId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/booth-visitors/booth-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when booth does not exist", async () => {
    mockCollections({
      boothDoc: mockDocSnap(null, false),
      fairsSnap: mockQuerySnap([]),
    });
    const res = await request(app)
      .get("/api/booth-visitors/nonexistent-booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Booth not found/i);
  });

  it("returns 404 when user does not exist", async () => {
    mockCollections({
      boothDoc: mockDocSnap({ companyId: "company-1" }, true, "booth-1"),
      userDoc: mockDocSnap(null, false),
    });
    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User not found/i);
  });

  it("returns 403 when user belongs to a different company", async () => {
    mockCollections({
      boothDoc: mockDocSnap({ companyId: "other-company" }, true, "booth-1"),
      userDoc: mockDocSnap({ companyId: "company-1" }, true, "test-uid"),
    });
    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized/i);
  });

  it("returns 200 with all visitor records for authorized company user", async () => {
    const visitDoc = mockDocSnap(
      {
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@test.com",
        major: "Physics",
        isCurrentlyViewing: true,
        viewCount: 3,
        lastViewedAt: { toMillis: () => 2000000 },
      },
      true,
      "student-2"
    );

    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        const studentVisitsRef = {
          get: jest.fn().mockResolvedValue(mockQuerySnap([visitDoc])),
        };
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1", currentVisitors: [] }, true, "booth-1")
            ),
            collection: jest.fn(() => studentVisitsRef),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "test-uid")
            ),
          })),
        };
      }
      if (name === "fairs") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalVisitors).toBe(1);
    expect(res.body.visitors[0].firstName).toBe("Bob");
  });

  it("filters visitors by current status", async () => {
    const currentVisitor = mockDocSnap(
      { firstName: "A", lastName: "B", email: "a@b.com", major: "CS", isCurrentlyViewing: true, viewCount: 1, lastViewedAt: { toMillis: () => 1000 } },
      true, "s1"
    );
    const prevVisitor = mockDocSnap(
      { firstName: "C", lastName: "D", email: "c@d.com", major: "Math", isCurrentlyViewing: false, viewCount: 2, lastViewedAt: { toMillis: () => 500 } },
      true, "s2"
    );

    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1", currentVisitors: [] }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([currentVisitor, prevVisitor])),
            })),
          })),
        };
      }
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true)) })) };
      }
      if (name === "fairs") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-1?filter=current")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalVisitors).toBe(1);
    expect(res.body.visitors[0].isCurrentlyViewing).toBe(true);
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB error")) })),
    }));
    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/DB error/i);
  });
});

/* ============================================================
   POST /api/booths/:boothId/ratings
============================================================ */
describe("POST /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .send({ rating: 4 });
    expect(res.status).toBe(401);
  });

  it("returns 404 when user does not exist", async () => {
    mockCollections({ userDoc: mockDocSnap(null, false) });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User not found/i);
  });

  it("returns 403 when user is not a student", async () => {
    mockCollections({ userDoc: mockDocSnap({ role: "representative" }, true) });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only students can submit ratings/i);
  });

  it("returns 400 when rating is missing", async () => {
    mockCollections({ userDoc: mockDocSnap({ role: "student" }, true) });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating must be a number/i);
  });

  it("returns 400 when rating is out of range (0)", async () => {
    mockCollections({ userDoc: mockDocSnap({ role: "student" }, true) });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating must be a number/i);
  });

  it("returns 400 when rating exceeds 5", async () => {
    mockCollections({ userDoc: mockDocSnap({ role: "student" }, true) });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating must be a number/i);
  });

  it("returns 404 when booth does not exist", async () => {
    mockCollections({
      userDoc: mockDocSnap({ role: "student" }, true),
      boothDoc: mockDocSnap(null, false),
    });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Booth not found/i);
  });

  it("returns 200 and saves rating on success", async () => {
    const ratingsDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const ratingsCollectionRef = {
      doc: jest.fn(() => ratingsDocRef),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)) })) };
      }
      if (name === "booths") {
        const boothDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
          collection: jest.fn(() => ratingsCollectionRef),
        };
        return { doc: jest.fn(() => boothDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 5, comment: "Excellent booth!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(ratingsDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "test-uid",
        rating: 5,
        comment: "Excellent booth!",
        fairId: null,
      })
    );
  });

  it("stores fairId when valid fairId is provided", async () => {
    const ratingsDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const ratingsCollectionRef = {
      doc: jest.fn(() => ratingsDocRef),
    };

    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, true, "booth-1")),
            collection: jest.fn(() => ratingsCollectionRef),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, "test-uid")),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Spring Fair" }, true, "fair-1")),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 5, comment: "Great", fairId: "fair-1" });

    expect(res.status).toBe(200);
    expect(ratingsDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ fairId: "fair-1" })
    );
  });

  it("returns 400 when fairId is provided but fair does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, true, "booth-1")),
            collection: jest.fn(() => ({ doc: jest.fn(() => ({ set: jest.fn() })) })),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, "test-uid")),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4, fairId: "nonexistent-fair" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid fairId/i);
  });

  it("stores fairId as null when no fairId provided", async () => {
    const ratingsDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const ratingsCollectionRef = { doc: jest.fn(() => ratingsDocRef) };
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, true, "booth-1")),
            collection: jest.fn(() => ratingsCollectionRef),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, "test-uid")),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 5 });

    expect(res.status).toBe(200);
    expect(ratingsDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ fairId: null })
    );
  });

  it("trims comment whitespace", async () => {
    const ratingsDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      set: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)) })) };
      }
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
            collection: jest.fn(() => ({ doc: jest.fn(() => ratingsDocRef) })),
          })),
        };
      }
    });

    await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 3, comment: "  Great!  " });
    expect(ratingsDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ comment: "Great!" })
    );
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB error")) })),
    }));
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4 });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to submit rating/i);
  });
});

/* ============================================================
   GET /api/booths/:boothId/ratings/me
============================================================ */
describe("GET /api/booths/:boothId/ratings/me", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/booths/booth-1/ratings/me");
    expect(res.status).toBe(401);
  });

  it("returns rating: null when no rating exists", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
              })),
            })),
          })),
        };
      }
    });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings/me")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.rating).toBeNull();
  });

  it("returns the student's existing rating", async () => {
    const ratingData = {
      rating: 4,
      comment: "Nice booth",
      createdAt: { toMillis: () => 1000000 },
    };
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(mockDocSnap(ratingData, true)),
              })),
            })),
          })),
        };
      }
    });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings/me")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.rating.rating).toBe(4);
    expect(res.body.rating.comment).toBe("Nice booth");
    expect(res.body.rating.createdAt).toBe(1000000);
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB error")) })),
        })),
      })),
    }));
    const res = await request(app)
      .get("/api/booths/booth-1/ratings/me")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch rating/i);
  });
});

/* ============================================================
   GET /api/booths/:boothId/ratings  (all ratings)
============================================================ */
describe("GET /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/booths/booth-1/ratings");
    expect(res.status).toBe(401);
  });

  it("returns 404 when booth does not exist", async () => {
    mockCollections({ boothDoc: mockDocSnap(null, false) });
    verifyAdmin.mockResolvedValue(null); // admin — skip non-admin path
    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Booth not found/i);
  });

  it("returns ratings when requester is an admin", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 5, comment: "Awesome", createdAt: { toMillis: () => 1000000 } },
      true,
      "rating-1"
    );
    mockCollections({ ratingsSnap: mockQuerySnap([ratingDoc]) });
    verifyAdmin.mockResolvedValue(null); // no error = is admin

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ratings).toHaveLength(1);
    expect(res.body.ratings[0].rating).toBe(5);
    expect(res.body.averageRating).toBe(5);
    expect(res.body.totalRatings).toBe(1);
  });

  it("returns 403 when user's company does not own the booth", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([])),
            })),
          })),
        };
      }
      if (name === "companies") {
        // Booth's company exists; the requester is NOT owner or rep
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "different-owner", representativeIDs: ["different-rep"] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  it("returns ratings for owner of the booth's company", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 3, comment: null, createdAt: { toMillis: () => 2000000 }, fairId: null },
      true,
      "rating-2"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "test-uid", representativeIDs: [] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(1);
    expect(res.body.averageRating).toBe(3);
    expect(res.body.ratings[0]).not.toHaveProperty("studentId");
  });

  it("returns ratings for representative of the booth's company", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 4, comment: "ok", createdAt: { toMillis: () => 2000000 }, fairId: null },
      true,
      "rating-3"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "some-other-uid", representativeIDs: ["test-uid"] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(1);
  });

  it("returns averageRating null when there are no ratings", async () => {
    mockCollections({ ratingsSnap: mockQuerySnap([]) });
    verifyAdmin.mockResolvedValue(null); // admin

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.averageRating).toBeNull();
    expect(res.body.totalRatings).toBe(0);
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("DB error")) })),
    }));
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch ratings/i);
  });

  it("annotates ratings with fairName and fairStartTime when fairId is set", async () => {
    const ratingDoc1 = mockDocSnap(
      { rating: 5, comment: "great", createdAt: { toMillis: () => 1000 }, fairId: "fair-1" },
      true,
      "rating-a"
    );
    const ratingDoc2 = mockDocSnap(
      { rating: 4, comment: null, createdAt: { toMillis: () => 2000 }, fairId: "fair-1" },
      true,
      "rating-b"
    );
    const ratingDoc3 = mockDocSnap(
      { rating: 3, comment: "ok", createdAt: { toMillis: () => 3000 }, fairId: "fair-2" },
      true,
      "rating-c"
    );
    const fairDocs = {
      "fair-1": mockDocSnap({ name: "Spring Fair", startTime: { toMillis: () => 50000 } }, true, "fair-1"),
      "fair-2": mockDocSnap({ name: "Fall Fair", startTime: { toMillis: () => 40000 } }, true, "fair-2"),
    };
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc1, ratingDoc2, ratingDoc3])),
            })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(fairDocs[id]),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ratings).toHaveLength(3);

    const byFair = res.body.ratings.reduce((acc, r) => {
      acc[r.fairId] = acc[r.fairId] || [];
      acc[r.fairId].push(r);
      return acc;
    }, {});
    expect(byFair["fair-1"]).toHaveLength(2);
    expect(byFair["fair-1"][0].fairName).toBe("Spring Fair");
    expect(byFair["fair-1"][0].fairStartTime).toBe(50000);
    expect(byFair["fair-2"]).toHaveLength(1);
    expect(byFair["fair-2"][0].fairName).toBe("Fall Fair");
  });

  it("returns null fair fields for ratings without fairId", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 5, comment: "legacy", createdAt: { toMillis: () => 1000 } },
      true,
      "rating-legacy"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ratings[0]).toMatchObject({
      fairId: null,
      fairName: null,
      fairStartTime: null,
    });
  });

  it("returns null fairName when fair has been deleted", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 5, comment: "x", createdAt: { toMillis: () => 1000 }, fairId: "deleted-fair" },
      true,
      "rating-x"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ratings[0]).toMatchObject({
      fairId: "deleted-fair",
      fairName: null,
      fairStartTime: null,
    });
  });
});
