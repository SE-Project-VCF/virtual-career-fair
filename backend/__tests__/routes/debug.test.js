const { mockDocSnap, mockQuerySnap, createTestApp } = require("../testUtils");

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
    storage: jest.fn(() => ({
      bucket: jest.fn(() => ({
        name: "test-bucket",
        getFiles: jest.fn().mockResolvedValue([[{ name: "test-file.pdf" }]]),
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

jest.mock("../../patchCache", () => ({
  getStats: jest.fn().mockReturnValue({ hits: 10, misses: 5 }),
}));

const request = require("supertest");
const debugRouter = require("../../routes/debug");
const { createTestApp: _unused, ...testUtils } = require("../testUtils");
const { db, auth } = require("../../firebase");
const app = createTestApp(debugRouter);

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

describe("GET /api/debug/gemini-models", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns models on success", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        models: [
          { name: "gemini-pro", supportedGenerationMethods: ["generateContent"] },
          { name: "embedding-001", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    });

    const res = await request(app).get("/api/debug/gemini-models");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.models).toEqual(["gemini-pro"]);

    global.fetch = originalFetch;
  });

  it("returns 500 on error", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const res = await request(app).get("/api/debug/gemini-models");
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);

    global.fetch = originalFetch;
  });
});

describe("GET /api/debug/storage-bucket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns bucket info on success", async () => {
    const res = await request(app).get("/api/debug/storage-bucket");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.bucket).toBe("test-bucket");
  });
});

describe("GET /api/debug/patch-cache", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 outside development", async () => {
    const res = await request(app)
      .get("/api/debug/patch-cache")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });
});
