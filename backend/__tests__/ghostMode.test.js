const { mockDocSnap } = require("./testUtils");

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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), batch: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../streamServerClient", () => ({
  streamServerClient: { channel: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "student-uid", email: "s@test.com" });
});

describe("PATCH /api/users/me/ghost-mode", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).patch("/api/users/me/ghost-mode").send({ ghostMode: true });
    expect(res.status).toBe(401);
  });

  it("returns 400 when ghostMode is not a boolean", async () => {
    const res = await request(app)
      .patch("/api/users/me/ghost-mode")
      .set("Authorization", VALID_TOKEN)
      .send({ ghostMode: "yes" });
    expect(res.status).toBe(400);
  });

  it("updates the user document and returns the new value", async () => {
    const updateMock = jest.fn().mockResolvedValue({});
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ update: updateMock })) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .patch("/api/users/me/ghost-mode")
      .set("Authorization", VALID_TOKEN)
      .send({ ghostMode: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ghostMode: true });
    expect(updateMock).toHaveBeenCalledWith({ ghostMode: true });
  });
});
