const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    arrayUnion: jest.fn((...args) => ({ _type: "arrayUnion", args })),
    arrayRemove: jest.fn((...args) => ({ _type: "arrayRemove", args })),
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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), runTransaction: jest.fn(), batch: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

jest.mock("../streamServerClient", () => ({
  streamServerClient: {
    upsertUser: jest.fn().mockResolvedValue({}),
    createToken: jest.fn().mockReturnValue("tok"),
    queryChannels: jest.fn().mockResolvedValue([]),
  },
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin } = require("../helpers");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "a@test.com" });
  verifyAdmin.mockResolvedValue(null);
});

function setupEnrollMock({ companyData, boothDocs = {}, fairExists = true, enrollmentExists = false } = {}) {
  const batch = {
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  db.batch.mockReturnValue(batch);

  let fairBoothCounter = 0;

  db.collection.mockImplementation((name) => {
    if (name === "fairs") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(fairExists ? { name: "Spring Fair" } : null, fairExists, "fair1")
          ),
          collection: jest.fn((sub) => {
            if (sub === "enrollments") {
              return {
                doc: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue(mockDocSnap(null, enrollmentExists)),
                })),
              };
            }
            if (sub === "booths") {
              return {
                doc: jest.fn(() => {
                  fairBoothCounter += 1;
                  return { id: `fairBooth${fairBoothCounter}` };
                }),
              };
            }
            if (sub === "jobs") {
              return { doc: jest.fn(() => ({ id: "fairJob1" })) };
            }
            return { doc: jest.fn(() => ({ id: "x" })) };
          }),
        })),
      };
    }

    if (name === "companies") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(companyData || { companyName: "Acme", ownerId: "admin-uid" }, true, "comp1")
          ),
        })),
      };
    }

    if (name === "booths") {
      return {
        doc: jest.fn((boothId) => ({
          get: jest.fn().mockResolvedValue(
            boothDocs[boothId]
              ? mockDocSnap(boothDocs[boothId], true, boothId)
              : mockDocSnap(null, false, boothId)
          ),
        })),
      };
    }

    if (name === "jobs") {
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    return {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
    };
  });

  return batch;
}

describe("POST /api/fairs/:fairId/enroll - multi-booth", () => {
  it("returns 400 when boothIds is an empty array", async () => {
    setupEnrollMock();

    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1", boothIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boothIds must be a non-empty array/i);
  });

  it("returns 400 when boothIds is not an array", async () => {
    setupEnrollMock();

    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1", boothIds: "booth-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boothIds must be a non-empty array/i);
  });

  it("returns 403 when a boothId does not belong to the company", async () => {
    setupEnrollMock({
      companyData: { companyName: "Acme", ownerId: "admin-uid" },
      boothDocs: {
        "booth-other": { companyName: "Other Co", companyId: "other-company" },
      },
    });

    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1", boothIds: ["booth-other"] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong to this company/i);
  });

  it("returns 400 when a boothId does not exist", async () => {
    setupEnrollMock({
      companyData: { companyName: "Acme", ownerId: "admin-uid" },
      boothDocs: {},
    });

    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1", boothIds: ["nonexistent-booth"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 201 with multiple booths and returns boothIds array of correct length", async () => {
    const batch = setupEnrollMock({
      companyData: { companyName: "Acme", ownerId: "admin-uid" },
      boothDocs: {
        "booth-a": { companyName: "Acme", companyId: "comp1", industry: "Tech" },
        "booth-b": { companyName: "Acme", companyId: "comp1", industry: "Finance" },
      },
    });

    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1", boothIds: ["booth-a", "booth-b"] });

    expect(res.status).toBe(201);
    expect(res.body.fairId).toBe("fair1");
    expect(Array.isArray(res.body.boothIds)).toBe(true);
    expect(res.body.boothIds).toHaveLength(2);
    // batch.set called: 2 booth snapshots + 1 enrollment doc = 3
    expect(batch.set).toHaveBeenCalledTimes(3);
    expect(batch.commit).toHaveBeenCalled();
  });

  it("returns 201 with legacy single-booth (no boothIds) and returns boothIds array", async () => {
    const batch = setupEnrollMock({
      companyData: { companyName: "Acme", ownerId: "admin-uid", boothId: null },
    });

    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1" });

    expect(res.status).toBe(201);
    expect(res.body.fairId).toBe("fair1");
    expect(Array.isArray(res.body.boothIds)).toBe(true);
    expect(res.body.boothIds).toHaveLength(1);
    expect(batch.commit).toHaveBeenCalled();
  });
});
