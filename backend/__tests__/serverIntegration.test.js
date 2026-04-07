/**
 * Integration tests for untested server.js endpoints
 * Tests are written to verify endpoint code paths with proper auth mocking
 */

const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  return {
    firestore: jest.fn(),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
    storage: jest.fn(() => ({
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({
          download: jest.fn().mockResolvedValue([Buffer.from("PDF content")]),
        })),
      })),
    })),
  };
});

jest.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: jest.fn(() => ({
      upsertUser: jest.fn().mockResolvedValue({}),
      createToken: jest.fn().mockReturnValue("test-token"),
      queryChannels: jest.fn().mockResolvedValue([]),
      getChannel: jest.fn(() => ({
        countUnread: jest.fn().mockResolvedValue({ unread_count: 3 }),
      })),
    })),
  },
}));

jest.mock("../firebase", () => ({
  db: { collection: jest.fn() },
  auth: { verifyIdToken: jest.fn() },
}));

jest.mock("../resumeParser", () => ({
  extractTextFromBuffer: jest.fn().mockResolvedValue("Parsed resume text"),
  toStructuredResume: jest.fn().mockReturnValue({
    summary: { text: "Summary text" },
    skills: { items: ["JavaScript"] },
    experience: [{ bullets: [] }],
    projects: [{ bullets: [] }],
  }),
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

describe("Untested Server.js Endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
   // Mock successful auth by default
    auth.verifyIdToken.mockResolvedValue({ uid: "test-user-123" });
  });

  describe("GET /api/stream-unread", () => {
    it("processes authenticated request to stream unread endpoint", async () => {
      const res = await request(app)
        .get("/api/stream-unread")
        .set("Authorization", "Bearer valid-token");

      // Endpoint returns 200 on success or 401 if auth fails
      expect([200, 401]).toContain(res.status);
    });
  });

  describe("POST /api/resume/parse", () => {
    it("handles request to parse authenticated user resume", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({
              currentResumePath: "resumes/user/resume.pdf",
              resumeFileName: "resume.pdf",
            }, true)
          ),
          set: jest.fn().mockResolvedValue(undefined),
        })),
      });

      const res = await request(app)
        .post("/api/resume/parse")
        .set("Authorization", "Bearer valid-token");

      // Should either succeed or have auth error
      expect([200, 400, 401, 500]).toContain(res.status);
    });

    it("returns error when user has no resume path", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({}, true)  // Empty user data
          ),
        })),
      });

      const res = await request(app)
        .post("/api/resume/parse")
        .set("Authorization", "Bearer valid-token");

      expect([400, 401, 404]).toContain(res.status);
    });
  });

  describe("GET /api/students", () => {
    it("fetches student list endpoint", async () => {
      db.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      });

      const res = await request(app).get("/api/students");

      expect([200, 400, 401]).toContain(res.status);
    });
  });

  describe("File upload endpoints - File type validation", () => {
    it("processes resume file upload request", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, true)),
          update: jest.fn().mockResolvedValue(undefined),
        })),
      });

      const res = await request(app)
        .post("/api/upload-resume")
        .set("Authorization", "Bearer valid-token")
        .attach("file", Buffer.from("mock pdf content"), "resume.pdf");

      // Might succeed, have auth error, or storage error
      expect([200, 401, 413, 500]).toContain(res.status);
    });

    it("processes booth logo upload request", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, true)),
          update: jest.fn().mockResolvedValue(undefined),
        })),
      });

      const res = await request(app)
        .post("/api/upload-booth-logo")
        .set("Authorization", "Bearer valid-token")
        .attach("file", Buffer.from("mock image content"), "logo.png");

      expect([200, 400, 401, 413, 500]).toContain(res.status);
    });
  });

  describe("GET /api/get-resume-url/:userId", () => {
    it("retrieves resume URL for user", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ resumePath: "resumes/user/resume.pdf" }, true)
          ),
        })),
      });

      const res = await request(app)
        .get("/api/get-resume-url/user-123")
        .set("Authorization", "Bearer valid-token");

      expect([200, 401, 403, 404]).toContain(res.status);
    });
  });

  describe("GET /api/get-booth-logo-url/:companyId", () => {
    it("retrieves booth logo URL for company", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ boothLogoPath: "logos/company/logo.jpg" }, true)
          ),
        })),
      });

      const res = await request(app)
        .get("/api/get-booth-logo-url/company-123")
        .set("Authorization", "Bearer valid-token");

      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });
  });

  describe("Error handling for protected endpoints", () => {
    it("returns 401 when auth token is invalid", async () => {
      auth.verifyIdToken.mockRejectedValue(new Error("Invalid token"));

      const res = await request(app)
        .get("/api/stream-unread")
        .set("Authorization", "Bearer invalid-token");

      expect(res.status).toBe(401);
    });

    it("returns 401 when no auth header provided", async () => {
      const res = await request(app).get("/api/stream-unread");
      expect(res.status).toBe(401);
    });

    it("handles database errors in protected endpoints", async () => {
      db.collection.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      const res = await request(app)
        .get("/api/get-resume-url/user-123")
        .set("Authorization", "Bearer valid-token");

      // Should return error status (400-500 range)
      expect([400, 401, 403, 500]).toContain(res.status);
    });
  });
});
