/**
 * Integration tests — verify each route domain is properly mounted
 * on the full app and that auth middleware runs through the real chain.
 */
const { mockQuerySnap } = require("../testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    delete: jest.fn(() => "__DELETE__"),
    serverTimestamp: jest.fn(() => "__SERVER_TIMESTAMP__"),
    arrayUnion: jest.fn((...args) => ({ __arrayUnion: args })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
    storage: jest.fn(() => ({
      bucket: jest.fn(() => ({
        name: "test-bucket",
        file: jest.fn(() => ({
          save: jest.fn().mockResolvedValue(),
          getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com"]),
          exists: jest.fn().mockResolvedValue([true]),
        })),
        getFiles: jest.fn().mockResolvedValue([[{ name: "test-file.pdf" }]]),
      })),
    })),
  };
});

jest.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: jest.fn(() => ({
      upsertUser: jest.fn().mockResolvedValue({}),
      createToken: jest.fn().mockReturnValue("mock-token"),
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
  get: jest.fn(),
  set: jest.fn(),
  getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 }),
}));

const request = require("supertest");
const app = require("../../server");
const { db, auth } = require("../../firebase");

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

beforeEach(() => jest.clearAllMocks());

describe("Integration: jobs routes", () => {
  it("POST /api/jobs requires auth (has verifyFirebaseToken)", async () => {
    const res = await request(app).post("/api/jobs").send({ companyId: "c1", name: "Dev" });
    expect(res.status).toBe(401);
  });

  it("GET /api/jobs is mounted and accessible (no auth)", async () => {
    db.collection.mockReturnValue({
      where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      })),
    });
    const res = await request(app).get("/api/jobs?companyId=c1");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });
});

describe("Integration: companies routes", () => {
  it("POST /api/companies requires auth", async () => {
    const res = await request(app).post("/api/companies").send({ companyName: "Test" });
    expect(res.status).toBe(401);
  });

  it("POST /api/link-company requires auth", async () => {
    const res = await request(app).post("/api/link-company").send({ inviteCode: "ABC" });
    expect(res.status).toBe(401);
  });
});

describe("Integration: stream routes", () => {
  it("GET /api/stream-token requires auth", async () => {
    const res = await request(app).get("/api/stream-token");
    expect(res.status).toBe(401);
  });

  it("GET /api/stream-token returns token through full app", async () => {
    const res = await request(app)
      .get("/api/stream-token")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.token).toBe("mock-token");
  });
});

describe("Integration: users routes", () => {
  it("POST /api/register-user validates input (no auth, returns 400)", async () => {
    const res = await request(app).post("/api/register-user").send({});
    expect(res.status).toBe(400);
  });
});

describe("Integration: fairStatus routes", () => {
  it("POST /api/toggle-fair-status requires auth", async () => {
    const res = await request(app).post("/api/toggle-fair-status").send({});
    expect(res.status).toBe(401);
  });
});

describe("Integration: booths routes", () => {
  it("POST /api/booths requires auth", async () => {
    const res = await request(app).post("/api/booths").send({});
    expect(res.status).toBe(401);
  });
});

describe("Integration: jobInvitations routes", () => {
  it("POST /api/job-invitations/send requires auth", async () => {
    const res = await request(app).post("/api/job-invitations/send").send({});
    expect(res.status).toBe(401);
  });

  it("GET /api/job-invitations/:invitationId requires auth", async () => {
    const res = await request(app).get("/api/job-invitations/inv1");
    expect(res.status).toBe(401);
  });
});

describe("Integration: resume routes", () => {
  it("POST /api/upload-resume requires auth", async () => {
    const res = await request(app).post("/api/upload-resume");
    expect(res.status).toBe(401);
  });

  it("GET /api/get-resume-url/:userId requires auth", async () => {
    const res = await request(app).get("/api/get-resume-url/user1");
    expect(res.status).toBe(401);
  });
});

describe("Integration: debug routes", () => {
  it("GET /api/debug/gemini-models is accessible (no auth required)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ models: [] }),
    });

    const res = await request(app).get("/api/debug/gemini-models");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    globalThis.fetch = originalFetch;
  });
});

describe("Integration: fairs routes", () => {
  it("POST /api/fairs requires auth", async () => {
    const res = await request(app).post("/api/fairs").send({});
    expect(res.status).toBe(401);
  });
});

describe("Integration: global middleware", () => {
  it("test-endpoint works without auth", async () => {
    const res = await request(app).post("/test-endpoint");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("CORS allows requests with no Origin header", async () => {
    const res = await request(app).post("/test-endpoint");
    expect(res.status).toBe(200);
  });
});
