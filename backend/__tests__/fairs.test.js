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
  db: {
    collection: jest.fn(),
    collectionGroup: jest.fn(),
    batch: jest.fn(),
  },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return {
    ...actual,
    verifyAdmin: jest.fn(),
    evaluateFairStatusForFair: jest.fn(),
  };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin, evaluateFairStatusForFair } = require("../helpers");

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "admin@test.com" });
  return "Bearer valid-token";
}

// Build a chainable subcollection mock: db.collection("fairs").doc(id).collection("booths").doc(id).get()
function makeSubcollectionMock({ docData, docExists = true, docId = "doc-id", docs = [], newDocId = "new-id" } = {}) {
  const subDocRef = {
    get: jest.fn().mockResolvedValue(mockDocSnap(docData, docExists, docId)),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    id: docId,
    ref: { parent: { parent: { id: "fair-id" } } },
    parent: { parent: { id: "fair-id" } },
  };
  const subColRef = {
    doc: jest.fn(() => subDocRef),
    add: jest.fn().mockResolvedValue({ id: newDocId }),
    get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  };
  return { subColRef, subDocRef };
}

// Create a db.collection mock that supports .doc().collection() chains
function setupFairsDbMock({
  fairData,
  fairExists = true,
  fairId = "fair-id",
  boothData,
  boothExists = true,
  boothId = "booth-id",
  jobData,
  jobExists = true,
  jobId = "job-id",
  enrollmentData,
  enrollmentExists = false,
  companyData,
  companyExists = true,
  userData,
  userExists = true,
  fairDocs = [],
  boothDocs = [],
  jobDocs = [],
  enrollmentDocs = [],
} = {}) {
  const batchMock = {
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  db.batch.mockReturnValue(batchMock);

  db.collection.mockImplementation((name) => {
    if (name === "fairs") {
      const boothSubcol = makeSubcollectionMock({
        docData: boothData,
        docExists: boothExists,
        docId: boothId,
        docs: boothDocs,
        newDocId: "new-booth-id",
      });
      const jobSubcol = makeSubcollectionMock({
        docData: jobData,
        docExists: jobExists,
        docId: jobId,
        docs: jobDocs,
        newDocId: "new-job-id",
      });
      const enrollmentSubcol = makeSubcollectionMock({
        docData: enrollmentData,
        docExists: enrollmentExists,
        docId: "company-id",
        docs: enrollmentDocs,
        newDocId: "company-id",
      });

      const fairDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(fairData, fairExists, fairId)),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        id: fairId,
        collection: jest.fn((sub) => {
          if (sub === "booths") return boothSubcol.subColRef;
          if (sub === "jobs") return jobSubcol.subColRef;
          if (sub === "enrollments") return enrollmentSubcol.subColRef;
          return makeSubcollectionMock().subColRef;
        }),
      };

      return {
        doc: jest.fn(() => fairDocRef),
        add: jest.fn().mockResolvedValue({ id: "new-fair-id" }),
        get: jest.fn().mockResolvedValue(mockQuerySnap(fairDocs)),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    }

    if (name === "companies") {
      const companyDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(companyData, companyExists, "company-id")),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        id: "company-id",
      };
      return {
        doc: jest.fn(() => companyDocRef),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    }

    if (name === "users") {
      const userDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(userData, userExists, "user-id")),
      };
      return {
        doc: jest.fn(() => userDocRef),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
      };
    }

    if (name === "booths") {
      const globalBoothDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(boothData, boothExists, boothId)),
      };
      return {
        doc: jest.fn(() => globalBoothDocRef),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    if (name === "jobs") {
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    return {
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });

  return batchMock;
}

const FAIR_DATA = {
  name: "Spring Fair",
  description: "Test fair",
  isLive: false,
  startTime: { toMillis: () => 500 },
  endTime: { toMillis: () => 2000 },
  inviteCode: "ABCD1234",
  createdAt: { toMillis: () => 100 },
  updatedAt: { toMillis: () => 200 },
};

/* =======================================================
   GET /api/fairs
======================================================= */
describe("GET /api/fairs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns list of fairs", async () => {
    setupFairsDbMock({
      fairDocs: [{ id: "fair-1", data: () => FAIR_DATA }],
    });

    const res = await request(app).get("/api/fairs");
    expect(res.status).toBe(200);
    expect(res.body.fairs).toHaveLength(1);
    expect(res.body.fairs[0].name).toBe("Spring Fair");
  });
});

/* =======================================================
   GET /api/fairs/:fairId
======================================================= */
describe("GET /api/fairs/:fairId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when fair not found", async () => {
    setupFairsDbMock({ fairExists: false });
    const res = await request(app).get("/api/fairs/bad-id");
    expect(res.status).toBe(404);
  });

  it("returns fair data", async () => {
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app).get("/api/fairs/fair-id");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Spring Fair");
    expect(res.body.inviteCode).toBe("ABCD1234");
  });
});

/* =======================================================
   GET /api/fairs/:fairId/status
======================================================= */
describe("GET /api/fairs/:fairId/status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns live status", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true, source: "manual", name: "Spring Fair" });
    const res = await request(app).get("/api/fairs/fair-id/status");
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
  });

  it("returns 404 when fair not found", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Fair not found"));
    const res = await request(app).get("/api/fairs/bad-id/status");
    expect(res.status).toBe(404);
  });
});

/* =======================================================
   POST /api/fairs
======================================================= */
describe("POST /api/fairs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/fairs").send({ name: "Test" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({});
    const res = await request(app)
      .post("/api/fairs")
      .set("Authorization", authHeader())
      .send({ name: "Test" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({});
    const res = await request(app)
      .post("/api/fairs")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  it("creates fair successfully", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({});
    const res = await request(app)
      .post("/api/fairs")
      .set("Authorization", authHeader())
      .send({ name: "New Fair", description: "A new fair" });
    expect(res.status).toBe(201);
  });
});

/* =======================================================
   POST /api/fairs/:fairId/toggle-status
======================================================= */
describe("POST /api/fairs/:fairId/toggle-status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/fairs/fair-id/toggle-status").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/toggle-status")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 404 when fair not found", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairExists: false });
    const res = await request(app)
      .post("/api/fairs/bad-id/toggle-status")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(404);
  });

  it("toggles fair live status", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: { ...FAIR_DATA, isLive: false } });
    const res = await request(app)
      .post("/api/fairs/fair-id/toggle-status")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
  });
});

/* =======================================================
   POST /api/fairs/:fairId/enroll
======================================================= */
describe("POST /api/fairs/:fairId/enroll", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/fairs/fair-id/enroll").send({ companyId: "c1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when neither companyId nor inviteCode provided", async () => {
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/enroll")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when company is already enrolled", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      fairData: FAIR_DATA,
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", boothId: "booth-id" },
      companyData: { companyName: "Acme", ownerId: "admin-uid", representativeIDs: [] },
    });
    const res = await request(app)
      .post("/api/fairs/fair-id/enroll")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already enrolled/i);
  });

  it("enrolls company successfully as admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      fairData: FAIR_DATA,
      enrollmentExists: false,
      companyData: { companyName: "Acme", ownerId: "admin-uid", boothId: null, representativeIDs: [] },
    });
    const res = await request(app)
      .post("/api/fairs/fair-id/enroll")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id" });
    expect(res.status).toBe(201);
    expect(res.body.boothId).toBeDefined();
    expect(res.body.fairId).toBe("fair-id");
  });
});

/* =======================================================
   GET /api/fairs/:fairId/enrollments
======================================================= */
describe("GET /api/fairs/:fairId/enrollments", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/fairs/fair-id/enrollments");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({});
    const res = await request(app)
      .get("/api/fairs/fair-id/enrollments")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns enrollments list for admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      fairData: FAIR_DATA,
      enrollmentDocs: [
        { id: "company-id", data: () => ({ companyId: "company-id", companyName: "Acme", boothId: "b1" }) },
      ],
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/enrollments")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(1);
  });
});

/* =======================================================
   DELETE /api/fairs/:fairId/enrollments/:companyId
======================================================= */
describe("DELETE /api/fairs/:fairId/enrollments/:companyId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/fairs/fair-id/enrollments/company-id");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({ enrollmentExists: true });
    const res = await request(app)
      .delete("/api/fairs/fair-id/enrollments/company-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns 404 when enrollment not found", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ enrollmentExists: false });
    const res = await request(app)
      .delete("/api/fairs/fair-id/enrollments/company-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("removes enrollment successfully", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      fairData: FAIR_DATA,
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", companyName: "Acme", boothId: "booth-id" },
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/enrollments/company-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* =======================================================
   GET /api/fairs/:fairId/booths
======================================================= */
describe("GET /api/fairs/:fairId/booths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when fair is not live (unauthenticated)", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app).get("/api/fairs/fair-id/booths");
    expect(res.status).toBe(403);
  });

  it("returns booths when fair is live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });
    setupFairsDbMock({
      fairData: FAIR_DATA,
      boothDocs: [
        { id: "b1", data: () => ({ companyName: "Acme", companyId: "c1" }) },
      ],
    });
    const res = await request(app).get("/api/fairs/fair-id/booths");
    expect(res.status).toBe(200);
    expect(res.body.booths).toHaveLength(1);
  });
});

/* =======================================================
   PUT /api/fairs/:fairId/booths/:boothId
======================================================= */
describe("PUT /api/fairs/:fairId/booths/:boothId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .put("/api/fairs/fair-id/booths/booth-id")
      .send({ companyName: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when booth not found", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ boothExists: false });
    const res = await request(app)
      .put("/api/fairs/fair-id/booths/bad-booth")
      .set("Authorization", authHeader())
      .send({ companyName: "Updated" });
    expect(res.status).toBe(404);
  });

  it("updates booth successfully as admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      boothData: { companyId: "company-id", companyName: "Acme" },
      companyData: { companyName: "Acme", ownerId: "admin-uid", representativeIDs: [] },
    });
    const res = await request(app)
      .put("/api/fairs/fair-id/booths/booth-id")
      .set("Authorization", authHeader())
      .send({ companyName: "Acme Updated", description: "New desc" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
