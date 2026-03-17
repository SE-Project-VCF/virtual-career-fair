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

const TEST_USER_SECRET = "student-pass-123";

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
        password: TEST_USER_SECRET,
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
        password: TEST_USER_SECRET,
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
        password: TEST_USER_SECRET,
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

  it("POST /api/upload-resume returns 400 when file exceeds 5MB (lines 283-290)", async () => {
    const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024);
    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader("resume-user"))
      .attach("file", oversizedBuffer, {
        filename: "large.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("File size must be under 5MB");
  });

  it("POST /api/upload-resume sanitizes filename with replaceAll (lines 291)", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000000300);

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
      skills: { items: [] },
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
        filename: "resume@test#1.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.filePath).toContain("1700000000300-resume_test_1.pdf");

    nowSpy.mockRestore();
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

  describe("GET /api/student/:studentId/resume-url (lines 411-450)", () => {
    it("student viewing own resume returns 200", async () => {
      const newestFile = { getSignedUrl: jest.fn().mockResolvedValue(["https://signed.example/own"]) };
      const bucket = {
        getFiles: jest.fn().mockResolvedValue([[newestFile]]),
      };
      admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

      const res = await request(app)
        .get("/api/student/student-1/resume-url")
        .set("Authorization", authHeader("student-1"));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.resumeUrl).toBe("https://signed.example/own");
    });

    it("company user viewing student resume with resumeVisible returns 200", async () => {
      const newestFile = { getSignedUrl: jest.fn().mockResolvedValue(["https://signed.example/student-resume"]) };
      const bucket = {
        getFiles: jest.fn().mockResolvedValue([[newestFile]]),
      };
      admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn((id) => ({
              get: jest.fn().mockResolvedValue(
                id === "company-rep"
                  ? { exists: true, data: () => ({ role: "company", companyId: "c1" }) }
                  : { exists: true, data: () => ({ resumeVisible: true }) }
              ),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn() })) };
      });

      const res = await request(app)
        .get("/api/student/student-1/resume-url")
        .set("Authorization", authHeader("company-rep"));

      expect(res.status).toBe(200);
      expect(res.body.resumeUrl).toBe("https://signed.example/student-resume");
    });

    it("returns 404 when requester user doc not found", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ exists: false }),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn() })) };
      });

      const res = await request(app)
        .get("/api/student/student-1/resume-url")
        .set("Authorization", authHeader("unknown-user"));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("User not found");
    });

    it("returns 403 when non-company user views other resume", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ role: "student" }) }),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn() })) };
      });

      const res = await request(app)
        .get("/api/student/student-1/resume-url")
        .set("Authorization", authHeader("other-student"));

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Not authorized to view this resume");
    });

    it("returns 404 when student doc not found", async () => {
      let docCallCount = 0;
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn((id) => ({
              get: jest.fn().mockResolvedValue(
                id === "company-rep"
                  ? { exists: true, data: () => ({ role: "company", companyId: "c1" }) }
                  : { exists: false }
              ),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn() })) };
      });

      const res = await request(app)
        .get("/api/student/nonexistent-student/resume-url")
        .set("Authorization", authHeader("company-rep"));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Student not found");
    });

    it("returns 403 when resumeVisible is false", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn((id) => ({
              get: jest.fn().mockResolvedValue(
                id === "company-rep"
                  ? { exists: true, data: () => ({ role: "company", companyId: "c1" }) }
                  : { exists: true, data: () => ({ resumeVisible: false }) }
              ),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn() })) };
      });

      const res = await request(app)
        .get("/api/student/student-1/resume-url")
        .set("Authorization", authHeader("company-rep"));

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Student has set resume to private");
    });

    it("returns 404 when no resume files in storage", async () => {
      const bucket = { getFiles: jest.fn().mockResolvedValue([[]]) };
      admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });

      const res = await request(app)
        .get("/api/student/student-1/resume-url")
        .set("Authorization", authHeader("student-1"));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No resume found");
    });
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

  it("allows request with no Origin header (CORS)", async () => {
    const res = await request(app)
      .get("/api/debug/storage-bucket")
      .set("Origin", "");
    expect(res.status).toBe(200);
  });

  it("POST /api/upload-resume rejects non-PDF file via multer fileFilter", async () => {
    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader("user-1"))
      .attach("file", Buffer.from("not a pdf"), {
        filename: "resume.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(500);
  });

  it("POST /api/upload-booth-logo rejects non-image file via multer fileFilter", async () => {
    const res = await request(app)
      .post("/api/upload-booth-logo")
      .set("Authorization", authHeader("user-1"))
      .field("companyId", "company-1")
      .attach("file", Buffer.from("not an image"), {
        filename: "doc.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(500);
  });
});
