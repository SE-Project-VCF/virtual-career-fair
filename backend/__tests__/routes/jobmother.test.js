"use strict";

const { mockDocSnap, createTestApp } = require("../testUtils");

const mockGenerateContent = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: (...args) => mockGenerateContent(...args),
    })),
  })),
}));

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

jest.mock("../../firebase", () => ({
  db: { collection: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../../helpers", () => {
  const actual = jest.requireActual("../../helpers");
  return { ...actual };
});

const request = require("supertest");
const jobmotherRouter = require("../../routes/jobmother");
const { db, auth } = require("../../firebase");

const app = createTestApp(jobmotherRouter);
const AUTH = "Bearer valid-token";

const ORIGINAL_GEMINI = process.env.GEMINI_API_KEY;

describe("POST /api/jobmother/navigate", () => {
  let usersDocGet;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    auth.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u@test.com" });

    usersDocGet = jest.fn();
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({ get: usersDocGet })),
        };
      }
      return {
        where: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ docs: [] }),
        })),
      };
    });
  });

  afterEach(() => {
    if (ORIGINAL_GEMINI === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = ORIGINAL_GEMINI;
    }
  });

  it("returns 401 without Authorization", async () => {
    const res = await request(app).post("/api/jobmother/navigate").send({ message: "hi" });
    expect(res.status).toBe(401);
  });

  it("returns 500 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    usersDocGet.mockResolvedValue(mockDocSnap({ role: "student" }, true, "u1"));
    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "where are fairs?" });
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/i);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns 400 when message is empty", async () => {
    usersDocGet.mockResolvedValue(mockDocSnap({ role: "student" }, true, "u1"));
    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "   " });
    expect(res.status).toBe(400);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns 404 when user doc missing", async () => {
    usersDocGet.mockResolvedValue(mockDocSnap(null, false, "u1"));
    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "help" });
    expect(res.status).toBe(404);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns 502 when Gemini JSON is invalid", async () => {
    usersDocGet.mockResolvedValue(mockDocSnap({ role: "student" }, true, "u1"));
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "not json {{{" },
    });
    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "hi" });
    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
  });

  it("returns resolver-vetted links and drops unknown / out-of-role intents", async () => {
    usersDocGet.mockResolvedValue(mockDocSnap({ role: "student" }, true, "u1"));
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            reply: "Student paths only.",
            intents: [
              { id: "GO_FAIRS" },
              { id: "GO_JOB_INVITATIONS" },
              { id: "UNKNOWN_XYZ" },
              { id: "GO_MANAGE_BOOTH" },
            ],
            tips: ["Bring a short intro.", "x".repeat(300)],
            needsClarification: true,
          }),
      },
    });

    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "navigate me", pathname: "/dashboard" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.reply).toBe("Student paths only.");
    expect(res.body.links).toEqual([
      { path: "/fairs", label: "Browse Fairs" },
      { path: "/dashboard/job-invitations", label: "Job Invitations" },
    ]);
    expect(res.body.needsClarification).toBe(true);
    expect(res.body.tips).toEqual(["Bring a short intro.", "x".repeat(240)]);
  });

  it("uses fairId from body and maps fair intents", async () => {
    usersDocGet.mockResolvedValue(mockDocSnap({ role: "student" }, true, "u1"));
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            reply: "Fair booths ahead.",
            intents: [{ id: "GO_FAIR_BOOTHS" }],
          }),
      },
    });

    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "booths here", fairId: "fair-42" });

    expect(res.status).toBe(200);
    expect(res.body.links).toEqual([{ path: "/fair/fair-42/booths", label: "Fair booths" }]);
  });

  it("defaults needsClarification false and tips empty when omitted from Gemini", async () => {
    usersDocGet.mockResolvedValue(mockDocSnap({ role: "student" }, true, "u1"));
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            reply: "Ok.",
            intents: [{ id: "GO_DASHBOARD" }],
          }),
      },
    });

    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "hi" });

    expect(res.status).toBe(200);
    expect(res.body.needsClarification).toBe(false);
    expect(res.body.tips).toEqual([]);
  });

  it("derives fairId from pathname when body omits it", async () => {
    usersDocGet.mockResolvedValue(mockDocSnap({ role: "student" }, true, "u1"));
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            reply: "Welcome to the fair.",
            intents: [{ id: "GO_FAIR_LANDING" }],
          }),
      },
    });

    const res = await request(app)
      .post("/api/jobmother/navigate")
      .set("Authorization", AUTH)
      .send({ message: "home", pathname: "/fair/abc123/booths" });

    expect(res.status).toBe(200);
    expect(res.body.links).toEqual([{ path: "/fair/abc123", label: "Fair home" }]);
  });
});
