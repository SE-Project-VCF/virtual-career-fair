jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };

  const mockBucket = {
    name: "mock-bucket",
    getFiles: jest.fn().mockResolvedValue([[{ name: "sample.pdf" }]]),
  };

  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
    storage: jest.fn(() => ({ bucket: jest.fn(() => mockBucket) })),
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
  db: { collection: jest.fn(), runTransaction: jest.fn(), collectionGroup: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../resumeParser", () => ({
  extractTextFromBuffer: jest.fn(),
  toStructuredResume: jest.fn(),
}));

const request = require("supertest");
const admin = require("firebase-admin");
const app = require("../server");
const { db, auth } = require("../firebase");
const { extractTextFromBuffer, toStructuredResume } = require("../resumeParser");

function authHeader(uid = "test-uid") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

describe("server misc endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn();
  });

  it("POST /test-endpoint returns success payload", async () => {
    const res = await request(app).post("/test-endpoint");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/direct endpoint works/i);
  });

  it("GET /api/debug/gemini-models returns filtered models", async () => {
    globalThis.fetch.mockResolvedValue({
      json: async () => ({
        models: [
          { name: "models/a", supportedGenerationMethods: ["generateContent"] },
          { name: "models/b", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    });

    const res = await request(app).get("/api/debug/gemini-models");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.models).toEqual(["models/a"]);
  });

  it("GET /api/debug/gemini-models returns 500 on fetch failure", async () => {
    globalThis.fetch.mockRejectedValue(new Error("fetch failed"));

    const res = await request(app).get("/api/debug/gemini-models");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("fetch failed");
  });

  it("GET /api/debug/storage-bucket returns bucket info", async () => {
    const res = await request(app).get("/api/debug/storage-bucket");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.bucket).toBe("mock-bucket");
    expect(res.body.sampleFile).toBe("sample.pdf");
  });

  it("GET /api/debug/storage-bucket returns 500 on storage error", async () => {
    const failingBucket = {
      name: "mock-bucket",
      getFiles: jest.fn().mockRejectedValue(new Error("storage down")),
    };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => failingBucket) });

    const res = await request(app).get("/api/debug/storage-bucket");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("storage down");
  });

  it("POST /api/register-user blocks administrator role", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({
        firstName: "Admin",
        lastName: "User",
        email: "admin@test.com",
        password: "password123",
        role: "administrator",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/register-user returns 500 when auth createUser fails", async () => {
    auth.createUser.mockRejectedValue(new Error("auth down"));

    const res = await request(app)
      .post("/api/register-user")
      .send({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@test.com",
        password: "password123",
        role: "student",
      });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("auth down");
  });

  it("POST /api/register-user creates student user successfully", async () => {
    auth.createUser.mockResolvedValue({ uid: "uid-1" });

    const userSet = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ set: userSet })) };
      }
      return { doc: jest.fn(() => ({ set: jest.fn() })) };
    });

    const res = await request(app)
      .post("/api/register-user")
      .send({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@test.com",
        password: "password123",
        role: "student",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.uid).toBe("uid-1");
    expect(userSet).toHaveBeenCalled();
  });

  it("POST /api/upload-resume returns 400 when file is missing", async () => {
    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader("resume-user"));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No file provided");
  });

  it("POST /api/upload-resume uploads, parses, and stores metadata", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000000000);

    const uploadedFile = {
      save: jest.fn().mockResolvedValue(undefined),
      download: jest.fn().mockResolvedValue([Buffer.from("%PDF mock")]),
    };
    const bucket = {
      file: jest.fn(() => uploadedFile),
      getFiles: jest.fn(),
    };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

    extractTextFromBuffer.mockResolvedValue("Raw resume text");
    toStructuredResume.mockReturnValue({
      summary: { text: "summary" },
      skills: { items: ["JavaScript"] },
      experience: [],
    });

    const userSet = jest.fn().mockResolvedValue(undefined);
    const userGet = jest.fn().mockResolvedValue({ data: () => ({ resumePath: "stored-path" }) });
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ set: userSet, get: userGet })) };
      }
      return { doc: jest.fn(() => ({ set: jest.fn(), get: jest.fn() })) };
    });

    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader("resume-user"))
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.filePath).toContain("resumes/resume-user/1700000000000-resume.pdf");
    expect(uploadedFile.save).toHaveBeenCalled();
    expect(extractTextFromBuffer).toHaveBeenCalled();
    expect(toStructuredResume).toHaveBeenCalled();
    expect(userSet).toHaveBeenCalled();

    nowSpy.mockRestore();
  });

  it("POST /api/upload-resume succeeds even when parsing fails", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000000100);

    const uploadedFile = {
      save: jest.fn().mockResolvedValue(undefined),
      download: jest.fn().mockResolvedValue([Buffer.from("%PDF mock")]),
    };
    const bucket = {
      file: jest.fn(() => uploadedFile),
      getFiles: jest.fn(),
    };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

    extractTextFromBuffer.mockRejectedValueOnce(new Error("parse failed"));

    const userSet = jest.fn().mockResolvedValue(undefined);
    const userGet = jest.fn().mockResolvedValue({ data: () => ({ resumePath: "fallback-path" }) });
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ set: userSet, get: userGet })) };
      }
      return { doc: jest.fn(() => ({ set: jest.fn(), get: jest.fn() })) };
    });

    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader("resume-user"))
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(userSet).toHaveBeenCalled();

    nowSpy.mockRestore();
  });

  it("GET /api/get-resume-url/:userId returns 403 for different requester", async () => {
    const res = await request(app)
      .get("/api/get-resume-url/owner-id")
      .set("Authorization", authHeader("other-user"));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("GET /api/get-resume-url/:userId returns 404 when no resume exists", async () => {
    const bucket = { getFiles: jest.fn().mockResolvedValue([[]]) };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

    const res = await request(app)
      .get("/api/get-resume-url/resume-user")
      .set("Authorization", authHeader("resume-user"));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No resume found");
  });

  it("GET /api/get-resume-url/:userId returns signed URL", async () => {
    const newestFile = { getSignedUrl: jest.fn().mockResolvedValue(["https://signed.example/resume"]) };
    const bucket = {
      getFiles: jest.fn().mockResolvedValue([[{ getSignedUrl: jest.fn() }, newestFile]]),
    };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

    const res = await request(app)
      .get("/api/get-resume-url/resume-user")
      .set("Authorization", authHeader("resume-user"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resumeUrl).toBe("https://signed.example/resume");
  });

  it("POST /api/upload-booth-logo validates missing companyId", async () => {
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader("logo-user"))
      .attach("file", Buffer.from("mock image"), {
        filename: "logo.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Company ID required");
  });

  it("POST /api/upload-booth-logo uploads image and returns filePath", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000000200);

    const logoFile = { save: jest.fn().mockResolvedValue(undefined) };
    const bucket = { file: jest.fn(() => logoFile), getFiles: jest.fn() };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader("logo-user"))
      .field("companyId", "company-1")
      .attach("file", Buffer.from("mock image"), {
        filename: "logo.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.filePath).toContain("boothLogos/company-1/logo-user/1700000000200-logo.png");
    expect(logoFile.save).toHaveBeenCalled();

    nowSpy.mockRestore();
  });

  it("GET /api/get-booth-logo-url/:companyId returns 404 when no logo exists", async () => {
    const bucket = { getFiles: jest.fn().mockResolvedValue([[]]) };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

    const res = await request(app)
      .get("/api/get-booth-logo-url/company-1")
      .set("Authorization", authHeader("logo-user"));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No logo found");
  });

  it("GET /api/get-booth-logo-url/:companyId returns signed URL", async () => {
    const newestLogo = { getSignedUrl: jest.fn().mockResolvedValue(["https://signed.example/logo"]) };
    const bucket = {
      getFiles: jest.fn().mockResolvedValue([[{ getSignedUrl: jest.fn() }, newestLogo]]),
    };
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

    const res = await request(app)
      .get("/api/get-booth-logo-url/company-1")
      .set("Authorization", authHeader("logo-user"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logoUrl).toBe("https://signed.example/logo");
  });
});
