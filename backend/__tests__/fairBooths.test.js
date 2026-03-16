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
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
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
const { db } = require("../firebase");
const { evaluateFairStatusForFair } = require("../helpers");

describe("GET /api/fairs/:fairId/booths (current route behavior)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when fair is not live and caller is not admin", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });

    const res = await request(app).get("/api/fairs/fair1/booths");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not currently live/i);
  });

  it("returns booths when fair is live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              orderBy: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({
                docs: [
                  { id: "booth1", data: () => ({ companyName: "Acme" }) },
                  { id: "booth2", data: () => ({ companyName: "Globex" }) },
                ],
              }),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/fairs/fair1/booths");

    expect(res.status).toBe(200);
    expect(res.body.booths).toHaveLength(2);
    expect(res.body.booths[0].id).toBe("booth1");
    expect(res.body.booths[1].companyName).toBe("Globex");
  });

  it("returns 404 when fair does not exist", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Fair not found"));

    const res = await request(app).get("/api/fairs/missing/booths");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/fair not found/i);
  });
});
