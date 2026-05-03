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
  db: { collection: jest.fn(), batch: jest.fn() },
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
  auth.verifyIdToken.mockResolvedValue({ uid: "owner-uid", email: "o@test.com" });
});

describe("POST /api/companies — companyNameLower write", () => {
  it("writes companyNameLower alongside companyName on creation", async () => {
    const setSpy = jest.fn().mockResolvedValue();
    const updateSpy = jest.fn().mockResolvedValue();
    const ownerDoc = mockDocSnap({ role: "companyOwner" }, true, "owner-uid");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(ownerDoc),
            update: updateSpy,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            id: "new-company-id",
            set: setSpy,
          })),
        };
      }
      return {};
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", VALID_TOKEN)
      .send({ companyName: "Acme Corp" });

    expect(res.status).toBe(201);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const written = setSpy.mock.calls[0][0];
    expect(written.companyName).toBe("Acme Corp");
    expect(written.companyNameLower).toBe("acme corp");
  });

  it("lowercases trimmed companyName for companyNameLower", async () => {
    const setSpy = jest.fn().mockResolvedValue();
    const ownerDoc = mockDocSnap({ role: "companyOwner" }, true, "owner-uid");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(ownerDoc),
            update: jest.fn().mockResolvedValue(),
          })),
        };
      }
      if (name === "companies") {
        return { doc: jest.fn(() => ({ id: "c2", set: setSpy })) };
      }
      return {};
    });

    await request(app)
      .post("/api/companies")
      .set("Authorization", VALID_TOKEN)
      .send({ companyName: "  MixedCASE Co  " });

    const written = setSpy.mock.calls[0][0];
    expect(written.companyName).toBe("MixedCASE Co");
    expect(written.companyNameLower).toBe("mixedcase co");
  });
});
