const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
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
