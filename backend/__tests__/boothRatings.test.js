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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), runTransaction: jest.fn() },
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
const { evaluateFairStatusForFair } = require("../helpers");

function makeFairsCollectionWithBooth(boothSnapshot) {
  const boothDocRef = {
    get: jest.fn().mockResolvedValue(boothSnapshot),
  };
  const boothsCollection = {
    doc: jest.fn(() => boothDocRef),
  };
  const fairDocRef = {
    collection: jest.fn(() => boothsCollection),
  };
  return {
    doc: jest.fn(() => fairDocRef),
  };
}

function makeUsersCollectionForAdminRole() {
  return {
    doc: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ role: "administrator" }) }),
    })),
  };
}

describe("GET /api/fairs/:fairId/booths/:boothId (current route behavior)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when fair is not live and caller is not admin", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });

    const res = await request(app).get("/api/fairs/fair1/booths/booth1");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not currently live/i);
  });

  it("returns booth details when fair is live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return makeFairsCollectionWithBooth({
          exists: true,
          id: "booth1",
          data: () => ({ companyName: "Acme", industry: "Tech" }),
        });
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/fairs/fair1/booths/booth1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("booth1");
    expect(res.body.companyName).toBe("Acme");
  });

  it("allows admin when fair is not live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid" });

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return makeUsersCollectionForAdminRole();
      }
      if (name === "fairs") {
        return makeFairsCollectionWithBooth({
          exists: true,
          id: "booth1",
          data: () => ({ companyName: "Acme" }),
        });
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/fairs/fair1/booths/booth1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("booth1");
  });

  it("returns 404 when booth does not exist", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return makeFairsCollectionWithBooth({ exists: false });
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/fairs/fair1/booths/missing");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/booth not found/i);
  });
});
