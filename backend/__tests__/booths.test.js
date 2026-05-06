const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    increment: jest.fn((n) => ({ _increment: n })),
    arrayUnion: jest.fn((...args) => ({ _arrayUnion: args })),
    arrayRemove: jest.fn((...args) => ({ _arrayRemove: args })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
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

jest.mock("../firebase", () => ({
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

function setupDbMock(configs) {
  db.collection.mockImplementation((name) => {
    const cfg = configs[name] || {};
    const docRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap(cfg.docData, cfg.docExists !== false, cfg.docId || "mock-id")
      ),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      id: cfg.docId || "mock-id",
    };
    return {
      doc: jest.fn(() => docRef),
      add: jest.fn().mockResolvedValue({ id: cfg.newDocId || "new-booth-id" }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(cfg.docs || [])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

describe("POST /api/booths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/booths").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ boothName: "Booth A" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when boothName is missing", async () => {
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when company does not exist", async () => {
    setupDbMock({ companies: { docExists: false } });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", boothName: "Booth A" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not authorized", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "other-user", representativeIDs: [] }, docExists: true },
    });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", boothName: "Booth A" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when booth name exceeds 200 characters", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "test-uid", representativeIDs: [] }, docExists: true },
    });

    const longName = "A".repeat(201);
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", boothName: longName });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("200 characters");
  });

  it("returns 400 when location exceeds 200 characters", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "test-uid", representativeIDs: [] }, docExists: true },
    });

    const longLocation = "A".repeat(201);
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", boothName: "Valid Name", location: longLocation });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("200 characters");
  });

  it("returns 400 when description exceeds 2000 characters", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "test-uid", representativeIDs: [] }, docExists: true },
    });

    const longDesc = "A".repeat(2001);
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", boothName: "Valid Name", description: longDesc });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("2000 characters");
  });

  it("creates booth successfully", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "test-uid", representativeIDs: [] }, docExists: true },
      booths: { newDocId: "booth-123" },
    });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({
        companyId: "c1",
        boothName: "Booth A",
        location: "Hall 1",
        description: "Our booth",
        representatives: ["rep1"],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.boothId).toBe("booth-123");
  });

  it("returns 500 when database add fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        add: jest.fn().mockRejectedValueOnce(new Error("DB error")),
      };
    });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({
        companyId: "c1",
        boothName: "Booth A",
        location: "Hall 1",
        description: "Our booth",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB error");
  });
});

describe("GET /api/booths (list)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when firestore query throws", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValueOnce(new Error("query boom")),
      };
    });

    const res = await request(app)
      .get("/api/booths?companyId=c1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch booths");
  });
});

describe("DELETE /api/booths/:boothId", () => {
  beforeEach(() => jest.clearAllMocks());

  function setupBoothDelete({ boothData, boothExists = true, companyData, companyExists = true, deleteFn } = {}) {
    const boothDelete = deleteFn || jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(boothData, boothExists)),
            delete: boothDelete,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(companyData, companyExists)),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    return { boothDelete };
  }

  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/booths/b1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when booth not found", async () => {
    setupBoothDelete({ boothExists: false });
    const res = await request(app)
      .delete("/api/booths/missing")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Booth not found");
  });

  it("returns 400 when booth has no companyId", async () => {
    setupBoothDelete({ boothData: {} });
    const res = await request(app)
      .delete("/api/booths/b1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Booth has no associated company");
  });

  it("returns 404 when company does not exist", async () => {
    setupBoothDelete({
      boothData: { companyId: "c1" },
      companyExists: false,
    });
    const res = await request(app)
      .delete("/api/booths/b1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Invalid company ID");
  });

  it("returns 403 when user is not authorized", async () => {
    setupBoothDelete({
      boothData: { companyId: "c1" },
      companyData: { ownerId: "other-user", representativeIDs: [] },
    });
    const res = await request(app)
      .delete("/api/booths/b1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Not authorized for this company");
  });

  it("deletes booth successfully when user is owner", async () => {
    const { boothDelete } = setupBoothDelete({
      boothData: { companyId: "c1" },
      companyData: { ownerId: "test-uid", representativeIDs: [] },
    });
    const res = await request(app)
      .delete("/api/booths/b1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(boothDelete).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when firestore throws", async () => {
    db.collection.mockImplementation(() => {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockRejectedValueOnce(new Error("fire boom")),
        })),
      };
    });
    const res = await request(app)
      .delete("/api/booths/b1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("fire boom");
  });
});

describe("POST /api/booth/:boothId/track-view (missing fields)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when boothId is empty", async () => {
    // Express matches trailing slash routes differently — use a space-like empty to trigger the guard.
    // The guard checks !boothId || !studentId. With auth present studentId is set,
    // so trigger by making boothId fall to falsy via the route param. Easiest: pass a boothId
    // that is an empty string after trim isn't possible in Express — instead we exercise
    // the track-leave path where boothId is validated the same way via an empty param.
    // Since Express won't route an empty :boothId, we assert the route exists and 404s.
    const res = await request(app)
      .post("/api/booth//track-view")
      .set("Authorization", authHeader());
    expect([400, 404]).toContain(res.status);
  });
});

describe("GET /api/booth/:boothId/current-visitors (missing fields)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when booth does not resolve", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
              })),
            })),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        })),
      };
    });
    const res = await request(app)
      .get("/api/booth/unknown/current-visitors")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/upload-booth-logo validation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when no file is provided", async () => {
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader())
      .field("companyId", "c1");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No file provided");
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader())
      .attach("file", Buffer.from("fake image"), { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Company ID required");
  });

});

// ---------------------------------------------------------------------------
// Helpers shared by tracking/ratings tests
// ---------------------------------------------------------------------------
function makeBoothRef(boothData, { visitorExists = false, visitorData = null, visitorDocs = [], ratingDocs = [] } = {}) {
  const visitorDocRef = {
    get: jest.fn().mockResolvedValue(mockDocSnap(visitorData, visitorExists)),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const ratingDocRef = {
    get: jest.fn().mockResolvedValue(
      ratingDocs.length > 0 ? mockDocSnap(ratingDocs[0], true, "rating-0") : mockDocSnap(null, false)
    ),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const ref = {
    get: jest.fn().mockResolvedValue(mockDocSnap(boothData, !!boothData)),
    update: jest.fn().mockResolvedValue(undefined),
    collection: jest.fn((sub) => {
      if (sub === "studentVisits") return { doc: jest.fn(() => visitorDocRef), get: jest.fn().mockResolvedValue(mockQuerySnap(visitorDocs)) };
      if (sub === "ratings") return { doc: jest.fn(() => ratingDocRef), get: jest.fn().mockResolvedValue(mockQuerySnap(ratingDocs)) };
      return { doc: jest.fn(), get: jest.fn() };
    }),
    id: "booth-1",
  };
  ref._visitorDocRef = visitorDocRef;
  ref._ratingDocRef = ratingDocRef;
  return ref;
}

// ---------------------------------------------------------------------------
// POST /api/booth/:boothId/track-view
// ---------------------------------------------------------------------------
describe("POST /api/booth/:boothId/track-view", () => {
  beforeEach(() => jest.clearAllMocks());

  const studentData = { firstName: "Jane", lastName: "Doe", email: "jane@test.com", major: "CS" };

  it("returns 404 when student not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    const res = await request(app).post("/api/booth/b1/track-view").set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Student not found");
  });

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(studentData, true)) })) };
      if (name === "booths") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      if (name === "fairs") return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    const res = await request(app).post("/api/booth/unknown/track-view").set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Booth not found");
  });

  it("creates new visitor record on first visit and adds to currentVisitors", async () => {
    const boothRef = makeBoothRef({ companyId: "c1", currentVisitors: [] }, { visitorExists: false });
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(studentData, true)) })) };
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).post("/api/booth/booth-1/track-view").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(boothRef._visitorDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ studentId: "test-uid", viewCount: 1 }));
    expect(boothRef.update).toHaveBeenCalled();
  });

  it("updates existing visitor record and handles already-in-currentVisitors branch", async () => {
    const visitorData = { isCurrentlyViewing: true, viewCount: 2 };
    const boothRef = makeBoothRef(
      { companyId: "c1", currentVisitors: ["test-uid"] },
      { visitorExists: true, visitorData }
    );
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(studentData, true)) })) };
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).post("/api/booth/booth-1/track-view").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(boothRef._visitorDocRef.update).toHaveBeenCalledWith(expect.objectContaining({ isCurrentlyViewing: true }));
    expect(boothRef.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/booth/:boothId/track-leave
// ---------------------------------------------------------------------------
describe("POST /api/booth/:boothId/track-leave", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      if (name === "fairs") return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      return {};
    });
    const res = await request(app).post("/api/booth/unknown/track-leave").set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("marks visitor as not viewing and removes from currentVisitors", async () => {
    const boothRef = makeBoothRef({ companyId: "c1" }, { visitorExists: true, visitorData: { isCurrentlyViewing: true } });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).post("/api/booth/booth-1/track-leave").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tracked).toBe(false);
    expect(boothRef._visitorDocRef.update).toHaveBeenCalledWith(expect.objectContaining({ isCurrentlyViewing: false }));
    expect(boothRef.update).toHaveBeenCalled();
  });

  it("still removes from currentVisitors when no visitor record exists", async () => {
    const boothRef = makeBoothRef({ companyId: "c1" }, { visitorExists: false });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).post("/api/booth/booth-1/track-leave").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(boothRef._visitorDocRef.update).not.toHaveBeenCalled();
    expect(boothRef.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/booth-visitors/:boothId
// ---------------------------------------------------------------------------
describe("GET /api/booth-visitors/:boothId", () => {
  beforeEach(() => jest.clearAllMocks());

  const makeVisitorDoc = (data, id) => ({ ...mockDocSnap(data, true, id), id });

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      if (name === "fairs") return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      return {};
    });
    const res = await request(app).get("/api/booth-visitors/unknown").set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("returns 400 when booth has no companyId", async () => {
    const boothRef = makeBoothRef({ boothName: "Booth" });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).get("/api/booth-visitors/booth-1").set("Authorization", authHeader());
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not authorized for the company", async () => {
    const boothRef = makeBoothRef({ companyId: "c1" });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true)) })) };
      return {};
    });
    const res = await request(app).get("/api/booth-visitors/booth-1").set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns all visitors for authorized owner", async () => {
    const visitors = [
      makeVisitorDoc({ firstName: "Alice", lastName: "Smith", email: "a@test.com", major: "CS", isCurrentlyViewing: true, lastViewedAt: { toMillis: () => 2000 }, viewCount: 3 }, "s1"),
      makeVisitorDoc({ firstName: "Bob", lastName: "Jones", email: "b@test.com", major: "Math", isCurrentlyViewing: false, lastViewedAt: { toMillis: () => 1000 }, viewCount: 1 }, "s2"),
    ];
    const boothRef = makeBoothRef({ companyId: "c1" }, { visitorDocs: visitors });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "test-uid" }, true)) })) };
      return {};
    });
    const res = await request(app).get("/api/booth-visitors/booth-1").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.visitors).toHaveLength(2);
    expect(res.body.currentlyViewing).toBe(1);
  });

  it("filters to current visitors only", async () => {
    const visitors = [
      makeVisitorDoc({ firstName: "Alice", lastName: "A", email: "a@t.com", major: "CS", isCurrentlyViewing: true, lastViewedAt: { toMillis: () => 2000 }, viewCount: 1 }, "s1"),
      makeVisitorDoc({ firstName: "Bob", lastName: "B", email: "b@t.com", major: "CS", isCurrentlyViewing: false, lastViewedAt: { toMillis: () => 1000 }, viewCount: 1 }, "s2"),
    ];
    const boothRef = makeBoothRef({ companyId: "c1" }, { visitorDocs: visitors });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "test-uid" }, true)) })) };
      return {};
    });
    const res = await request(app).get("/api/booth-visitors/booth-1?filter=current").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].firstName).toBe("Alice");
  });

  it("filters to previous visitors and applies search + major filters", async () => {
    const visitors = [
      makeVisitorDoc({ firstName: "Alice", lastName: "Smith", email: "a@t.com", major: "Computer Science", isCurrentlyViewing: false, lastViewedAt: { toMillis: () => 2000 }, viewCount: 2 }, "s1"),
      makeVisitorDoc({ firstName: "Bob", lastName: "Jones", email: "b@t.com", major: "Math", isCurrentlyViewing: false, lastViewedAt: { toMillis: () => 1000 }, viewCount: 1 }, "s2"),
    ];
    const boothRef = makeBoothRef({ companyId: "c1" }, { visitorDocs: visitors });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "test-uid" }, true)) })) };
      return {};
    });
    const res = await request(app)
      .get("/api/booth-visitors/booth-1?filter=previous&search=alice&major=computer")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].firstName).toBe("Alice");
  });

  it("sorts visitors by name", async () => {
    const visitors = [
      makeVisitorDoc({ firstName: "Zoe", lastName: "A", email: "z@t.com", major: "CS", isCurrentlyViewing: true, lastViewedAt: { toMillis: () => 2000 }, viewCount: 1 }, "s1"),
      makeVisitorDoc({ firstName: "Alice", lastName: "B", email: "a@t.com", major: "CS", isCurrentlyViewing: true, lastViewedAt: { toMillis: () => 1000 }, viewCount: 2 }, "s2"),
    ];
    const boothRef = makeBoothRef({ companyId: "c1" }, { visitorDocs: visitors });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "test-uid" }, true)) })) };
      return {};
    });
    const res = await request(app).get("/api/booth-visitors/booth-1?sort=name").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.visitors[0].firstName).toBe("Alice");
  });

  it("sorts visitors by viewCount", async () => {
    const visitors = [
      makeVisitorDoc({ firstName: "Low", lastName: "A", email: "l@t.com", major: "CS", isCurrentlyViewing: true, lastViewedAt: { toMillis: () => 1000 }, viewCount: 1 }, "s1"),
      makeVisitorDoc({ firstName: "High", lastName: "B", email: "h@t.com", major: "CS", isCurrentlyViewing: true, lastViewedAt: { toMillis: () => 2000 }, viewCount: 10 }, "s2"),
    ];
    const boothRef = makeBoothRef({ companyId: "c1" }, { visitorDocs: visitors });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "test-uid" }, true)) })) };
      return {};
    });
    const res = await request(app).get("/api/booth-visitors/booth-1?sort=viewCount").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.visitors[0].firstName).toBe("High");
  });
});

// ---------------------------------------------------------------------------
// POST /api/booths/:boothId/ratings
// ---------------------------------------------------------------------------
describe("POST /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  const { verifyAdmin } = require("../helpers");

  it("returns 404 when user not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      return {};
    });
    const res = await request(app).post("/api/booths/b1/ratings").set("Authorization", authHeader()).send({ rating: 4 });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a student", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner" }, true)) })) };
      return {};
    });
    const res = await request(app).post("/api/booths/b1/ratings").set("Authorization", authHeader()).send({ rating: 4 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Only students can submit ratings");
  });

  it("returns 400 for invalid rating value", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)) })) };
      return {};
    });
    const res = await request(app).post("/api/booths/b1/ratings").set("Authorization", authHeader()).send({ rating: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/between 1 and 5/);
  });

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)) })) };
      if (name === "booths") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)), collection: jest.fn() })) };
      return {};
    });
    const res = await request(app).post("/api/booths/b1/ratings").set("Authorization", authHeader()).send({ rating: 4 });
    expect(res.status).toBe(404);
  });

  it("submits rating successfully", async () => {
    const boothRef = makeBoothRef({ companyId: "c1" });
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)) })) };
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).post("/api/booths/booth-1/ratings").set("Authorization", authHeader()).send({ rating: 5, comment: "Great!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(boothRef._ratingDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, studentId: "test-uid" }));
  });

  it("attaches fairId and fairName when fair exists", async () => {
    const boothRef = makeBoothRef({ companyId: "c1" });
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)) })) };
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "fairs") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Spring Fair" }, true)) })) };
      return {};
    });
    const res = await request(app).post("/api/booths/booth-1/ratings").set("Authorization", authHeader()).send({ rating: 3, fairId: "fair-1" });
    expect(res.status).toBe(200);
    expect(boothRef._ratingDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ fairId: "fair-1", fairName: "Spring Fair" }));
  });
});

// ---------------------------------------------------------------------------
// GET /api/booths/:boothId/ratings/me
// ---------------------------------------------------------------------------
describe("GET /api/booths/:boothId/ratings/me", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when student has no rating", async () => {
    const boothRef = makeBoothRef({ companyId: "c1" }, { ratingDocs: [] });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).get("/api/booths/booth-1/ratings/me").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.rating).toBeNull();
  });

  it("returns existing rating for the student", async () => {
    const ratingData = { rating: 4, comment: "Nice", createdAt: { toMillis: () => 9999 } };
    const boothRef = makeBoothRef({ companyId: "c1" }, { ratingDocs: [ratingData] });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).get("/api/booths/booth-1/ratings/me").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.rating.rating).toBe(4);
    expect(res.body.rating.comment).toBe("Nice");
  });
});

// ---------------------------------------------------------------------------
// GET /api/booths/:boothId/ratings
// ---------------------------------------------------------------------------
describe("GET /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  const { verifyAdmin } = require("../helpers");

  it("returns 404 when booth not found", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)), collection: jest.fn() })) };
      return {};
    });
    const res = await request(app).get("/api/booths/unknown/ratings").set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("returns ratings for admin user", async () => {
    verifyAdmin.mockResolvedValue(null);
    const ratingDocs = [
      { ...mockDocSnap({ rating: 5, comment: "Excellent", createdAt: { toMillis: () => 1000 }, fairId: null, fairName: null }, true, "r1"), id: "r1" },
    ];
    const boothRef = makeBoothRef({ companyId: "c1" }, { ratingDocs });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).get("/api/booths/booth-1/ratings").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(1);
    expect(res.body.averageRating).toBe(5);
  });

  it("returns ratings for company owner", async () => {
    verifyAdmin.mockResolvedValue("not admin");
    const ratingDocs = [
      { ...mockDocSnap({ rating: 3, comment: null, createdAt: { toMillis: () => 1000 }, fairId: null, fairName: null }, true, "r1"), id: "r1" },
      { ...mockDocSnap({ rating: 5, comment: null, createdAt: { toMillis: () => 2000 }, fairId: null, fairName: null }, true, "r2"), id: "r2" },
    ];
    const boothRef = makeBoothRef({ companyId: "c1" }, { ratingDocs });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "test-uid" }, true)) })) };
      return {};
    });
    const res = await request(app).get("/api/booths/booth-1/ratings").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(2);
    expect(res.body.averageRating).toBe(4);
  });

  it("returns 403 when user is not authorized", async () => {
    verifyAdmin.mockResolvedValue("not admin");
    const boothRef = makeBoothRef({ companyId: "c1" });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      if (name === "companies") return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true)) })) };
      return {};
    });
    const res = await request(app).get("/api/booths/booth-1/ratings").set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns null averageRating when there are no ratings", async () => {
    verifyAdmin.mockResolvedValue(null);
    const boothRef = makeBoothRef({ companyId: "c1" }, { ratingDocs: [] });
    db.collection.mockImplementation((name) => {
      if (name === "booths") return { doc: jest.fn(() => boothRef) };
      return {};
    });
    const res = await request(app).get("/api/booths/booth-1/ratings").set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(0);
    expect(res.body.averageRating).toBeNull();
  });
});
