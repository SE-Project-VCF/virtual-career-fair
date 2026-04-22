const { mockDocSnap, mockQuerySnap, createTestApp } = require("../testUtils");

jest.mock("firebase-admin", () => {
  const FieldValue = {
    delete: jest.fn(() => "__DELETE__"),
    serverTimestamp: jest.fn(() => "__SERVER_TIMESTAMP__"),
    arrayUnion: jest.fn((...args) => ({ __arrayUnion: args })),
  };
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
    storage: jest.fn(() => ({
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({
          save: jest.fn().mockResolvedValue(),
          download: jest.fn().mockResolvedValue([Buffer.from("PDF content")]),
          getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com/resume.pdf"]),
          exists: jest.fn().mockResolvedValue([true]),
        })),
        getFiles: jest.fn().mockResolvedValue([[
          {
            name: "resumes/test-uid/resume.pdf",
            getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com/resume.pdf"]),
          },
        ]]),
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
  return {
    ...actual,
    verifyAdmin: jest.fn(),
    requireCompanyResumeViewAccess: jest.fn().mockResolvedValue(null),
    resolveApplicantResumePathOrUrl: jest.fn().mockResolvedValue({
      type: "path",
      value: "resumes/student-1/resume.pdf",
    }),
  };
});

jest.mock("../../patchCache", () => ({
  setCacheEntry: jest.fn().mockReturnValue({ cached: true }),
  getCacheEntry: jest.fn().mockReturnValue({ cached: false, error: "Cache miss" }),
  clearCacheEntry: jest.fn().mockReturnValue(true),
  getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 }),
}));

jest.mock("../../resumeParser", () => ({
  extractTextFromBuffer: jest.fn().mockResolvedValue("Raw resume text content"),
  toStructuredResume: jest.fn().mockReturnValue({
    summary: "Experienced software engineer",
    skills: { items: ["JavaScript", "Node.js"] },
    experience: [
      {
        expId: "exp_001",
        title: "Software Engineer",
        company: "Acme Corp",
        bullets: [{ bulletId: "bullet_001", text: "Built REST APIs" }],
      },
    ],
    projects: [],
  }),
}));

jest.mock("../../resumeTailorHelpers", () => ({
  parseGeminiJson: jest.fn().mockReturnValue({
    parsed: {
      patches: [],
      skill_suggestions: [],
    },
  }),
  verifyPatches: jest.fn().mockReturnValue({ verifiedPatches: [], issues: [] }),
  normalizeRemovalPatch: jest.fn((patch) => patch),
  mapPatchParentIds: jest.fn((patch) => patch),
  logTailorV2Debug: jest.fn(),
}));

jest.mock("../../patchValidator", () => {
  return jest.fn().mockImplementation(() => ({
    validatePatches: jest.fn().mockReturnValue({
      valid: true,
      patches: [],
      issues: [],
      summary: { total: 0, valid: 0, invalid: 0 },
    }),
    detectPatchConflicts: jest.fn().mockReturnValue([]),
  }));
});

jest.mock("../../patchApplier", () => ({
  applyPatches: jest.fn().mockReturnValue({
    success: true,
    tailoredResume: { summary: "Tailored resume", skills: { items: [] }, experience: [], projects: [] },
    appliedCount: 1,
    errors: [],
  }),
}));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(
            JSON.stringify({ patches: [], skill_suggestions: [] })
          ),
        },
      }),
    }),
  })),
}));

jest.mock("../../resumeTailorSimple", () => ({
  generateResumeChanges: jest.fn().mockResolvedValue([
    { id: "change_1", original: "Old text", suggested: "New text", reason: "Better wording" },
  ]),
  applyChanges: jest.fn().mockResolvedValue("Tailored resume text content"),
  reformatResumeWithGemini: jest.fn().mockResolvedValue("Reformatted resume text content"),
}));

const request = require("supertest");
const resumeRouter = require("../../routes/resume");
const { db, auth } = require("../../firebase");
const admin = require("firebase-admin");
const patchCache = require("../../patchCache");
const app = createTestApp(resumeRouter);

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeBucketFile(overrides = {}) {
  return {
    save: jest.fn().mockResolvedValue(),
    download: jest.fn().mockResolvedValue([Buffer.from("PDF content")]),
    getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com/resume.pdf"]),
    exists: jest.fn().mockResolvedValue([true]),
    ...overrides,
  };
}

function makeBucket(fileOverrides = {}, filesListOverride = null) {
  const fileRef = makeBucketFile(fileOverrides);
  const filesList = filesListOverride ?? [
    {
      name: "resumes/test-uid/resume.pdf",
      getSignedUrl: jest.fn().mockResolvedValue(["https://signed-url.com/resume.pdf"]),
    },
  ];
  return {
    file: jest.fn(() => fileRef),
    getFiles: jest.fn().mockResolvedValue([filesList]),
  };
}

function resetStorage(bucketOverrides = {}) {
  const bucket = { ...makeBucket(), ...bucketOverrides };
  admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });
  return bucket;
}

// ─── POST /api/upload-resume ─────────────────────────────────────────────────

describe("POST /api/upload-resume", () => {
  beforeEach(() => {
    resetStorage();
    const docRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({
          resumePath: "resumes/test-uid/old.pdf",
          currentResumePath: "resumes/test-uid/old.pdf",
          resumeFileName: "old.pdf",
        })
      ),
      set: jest.fn().mockResolvedValue(undefined),
    };
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).post("/api/upload-resume");
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is attached", async () => {
    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });

  it("rejects a non-PDF file (multer fileFilter returns error before route handler)", async () => {
    // multer's fileFilter calls cb(new Error(...)) for non-PDF files, which Express
    // surfaces as a 500 before the route's own mimetype check can run.
    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader())
      .attach("file", Buffer.from("plain text"), { filename: "cv.txt", contentType: "text/plain" });
    expect(res.status).toBe(500);
  });

  it("uploads a PDF and returns success with filePath", async () => {
    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader())
      .attach("file", Buffer.from("%PDF-1.4 fake pdf"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.filePath).toMatch(/^resumes\/test-uid\//);
  });

  it("still succeeds if resume parsing throws an error", async () => {
    const { extractTextFromBuffer } = require("../../resumeParser");
    extractTextFromBuffer.mockRejectedValueOnce(new Error("Parse failed"));

    const res = await request(app)
      .post("/api/upload-resume")
      .set("Authorization", authHeader())
      .attach("file", Buffer.from("%PDF-1.4 fake pdf"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── GET /api/get-resume-url/:userId ─────────────────────────────────────────

describe("GET /api/get-resume-url/:userId", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/get-resume-url/test-uid");
    expect(res.status).toBe(401);
  });

  it("returns 403 when requesting another user's resume URL", async () => {
    const res = await request(app)
      .get("/api/get-resume-url/other-uid")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("returns 404 when no resume files exist", async () => {
    admin.storage.mockReturnValue({
      bucket: jest.fn(() => ({
        getFiles: jest.fn().mockResolvedValue([[]]),
      })),
    });

    const res = await request(app)
      .get("/api/get-resume-url/test-uid")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no resume found/i);
  });

  it("returns a signed URL for the user's own resume", async () => {
    resetStorage();

    const res = await request(app)
      .get("/api/get-resume-url/test-uid")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resumeUrl).toBe("https://signed-url.com/resume.pdf");
  });
});

// ─── GET /api/student/:studentId/resume-url ──────────────────────────────────

describe("GET /api/student/:studentId/resume-url", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/student/some-student/resume-url");
    expect(res.status).toBe(401);
  });

  it("allows a student to view their own resume URL", async () => {
    resetStorage();

    const res = await request(app)
      .get("/api/student/test-uid/resume-url")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resumeUrl).toBe("https://signed-url.com/resume.pdf");
  });

  it("returns 404 when the requester user doc does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/student/other-student/resume-url")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 403 when requester is not a company user", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "student" }, true, "test-uid")
            ),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/student/other-student/resume-url")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("returns 403 when student has set resume to private", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        const docMock = jest.fn();
        docMock.mockImplementation((uid) => {
          if (uid === "test-uid") {
            return {
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ role: "company", companyId: "co-1" }, true, "test-uid")
              ),
            };
          }
          // Student doc
          return {
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ resumeVisible: false }, true, "student-1")
            ),
          };
        });
        return { doc: docMock };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/student/student-1/resume-url")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/private/i);
  });

  it("returns signed URL for company user with student's visible resume", async () => {
    resetStorage();

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        const docMock = jest.fn();
        docMock.mockImplementation((uid) => {
          if (uid === "test-uid") {
            return {
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ role: "company", companyId: "co-1" }, true, "test-uid")
              ),
            };
          }
          return {
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ resumeVisible: true }, true, "student-1")
            ),
          };
        });
        return { doc: docMock };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/student/student-1/resume-url")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resumeUrl).toBe("https://signed-url.com/resume.pdf");
  });
});

// ─── GET /api/applicant-resume-url/:applicationId ────────────────────────────

describe("GET /api/applicant-resume-url/:applicationId", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/applicant-resume-url/app-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when application does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/application not found/i);
  });

  it("returns signed URL when requester is authorized company user", async () => {
    resetStorage();

    // Mock requireCompanyResumeViewAccess to allow access
    const helpers = require("../../helpers");
    jest.spyOn(helpers, "requireCompanyResumeViewAccess").mockResolvedValue(null);
    jest.spyOn(helpers, "resolveApplicantResumePathOrUrl").mockResolvedValue({
      type: "path",
      value: "resumes/student-1/resume.pdf",
    });

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ companyId: "co-1", studentId: "student-1" }, true, "app-1")
        ),
      })),
    });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://signed-url.com/resume.pdf");
  });
});

// ─── GET /api/applicant-tailored-resume/:applicationId ───────────────────────

describe("GET /api/applicant-tailored-resume/:applicationId", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/applicant-tailored-resume/app-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when application does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/application not found/i);
  });

  it("returns 404 when no tailored resume is attached to the application", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            { companyId: "co-1", studentId: "student-1", attachedTailoredResumeId: null },
            true
          )
        ),
      })),
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no tailored resume/i);
  });

  it("returns 403 when requester is not company owner or rep", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobApplications") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { companyId: "co-1", studentId: "student-1", attachedTailoredResumeId: "tr-1" },
                true
              )
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-user", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("returns tailored resume content for authorized company owner", async () => {
    const tailoredData = {
      tailoredText: "My tailored resume...",
      structured: { summary: "Tailored" },
      jobContext: { jobId: "job-1", jobTitle: "Engineer" },
      method: "patch-based",
    };

    db.collection.mockImplementation((name) => {
      if (name === "jobApplications") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { companyId: "co-1", studentId: "student-1", attachedTailoredResumeId: "tr-1" },
                true
              )
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(mockDocSnap(tailoredData, true, "tr-1")),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.tailoredText).toBe("My tailored resume...");
    expect(res.body.method).toBe("patch-based");
  });
});

// ─── POST /api/resume/parse ───────────────────────────────────────────────────

describe("POST /api/resume/parse", () => {
  beforeEach(() => {
    const bucket = makeBucket();
    admin.storage.mockReturnValue({ bucket: jest.fn(() => bucket) });
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/resume/parse");
    expect(res.status).toBe(401);
  });

  it("returns 404 when user doc does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        set: jest.fn().mockResolvedValue(undefined),
      })),
    });

    const res = await request(app)
      .post("/api/resume/parse")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user doc not found/i);
  });

  it("returns 400 when user has no resume path", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ resumePath: null, currentResumePath: null, resumeUrl: null }, true)
        ),
        set: jest.fn().mockResolvedValue(undefined),
      })),
    });

    const res = await request(app)
      .post("/api/resume/parse")
      .set("Authorization", authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no resumepath/i);
  });

  it("parses resume and returns structured data", async () => {
    const docRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap(
          { currentResumePath: "resumes/test-uid/resume.pdf", resumeFileName: "resume.pdf" },
          true
        )
      ),
      set: jest.fn().mockResolvedValue(undefined),
    };
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app)
      .post("/api/resume/parse")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumeId).toMatch(/^resume_/);
    expect(res.body.bulletCounts).toBeDefined();
  });
});

// ─── POST /api/resume/tailor ──────────────────────────────────────────────────

describe("POST /api/resume/tailor", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/resume/tailor").send({ jobDescription: "test" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobDescription is missing", async () => {
    const res = await request(app)
      .post("/api/resume/tailor")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jobdescription is required/i);
  });

  it("returns 500 when GEMINI_API_KEY is not set", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const res = await request(app)
      .post("/api/resume/tailor")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer position" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/gemini_api_key/i);

    process.env.GEMINI_API_KEY = original || "test-key";
  });

  it("returns 404 when user doc does not exist", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user doc not found/i);
  });

  it("returns 400 when user has no parsed resume", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap({ resumeStructured: null }, true)),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no parsed resume/i);
  });

  it("returns patches on success", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            {
              resumeStructured: {
                summary: "Engineer",
                skills: { items: ["Node.js"] },
                experience: [],
                projects: [],
              },
            },
            true
          )
        ),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Backend engineer", roleTitle: "Engineer" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.patches)).toBe(true);
  });
});

// ─── POST /api/resume/tailor/simple ──────────────────────────────────────────

describe("POST /api/resume/tailor/simple", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/resume/tailor/simple").send({ jobDescription: "test" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobDescription is missing", async () => {
    const res = await request(app)
      .post("/api/resume/tailor/simple")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jobdescription is required/i);
  });

  it("returns 404 when user doc does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor/simple")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 400 when user has no resume raw text", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ resumeRawText: null }, true)
        ),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor/simple")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no resume found/i);
  });

  it("returns suggested changes on success", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ resumeRawText: "My raw resume text here" }, true)
        ),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor/simple")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Backend engineer", jobTitle: "Software Engineer" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.changes)).toBe(true);
    expect(res.body.originalText).toBe("My raw resume text here");
  });
});

// ─── POST /api/resume/tailored/simple/save ───────────────────────────────────

describe("POST /api/resume/tailored/simple/save", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/resume/tailored/simple/save").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when invitationId is missing", async () => {
    const res = await request(app)
      .post("/api/resume/tailored/simple/save")
      .set("Authorization", authHeader())
      .send({ originalText: "text", approvedChanges: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invitationid is required/i);
  });

  it("returns 400 when originalText is missing", async () => {
    const res = await request(app)
      .post("/api/resume/tailored/simple/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", approvedChanges: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/originaltext is required/i);
  });

  it("returns 400 when approvedChanges is not an array", async () => {
    const res = await request(app)
      .post("/api/resume/tailored/simple/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", originalText: "text", approvedChanges: "invalid" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approvedchanges must be an array/i);
  });

  it("returns 400 when invitation does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailored/simple/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", originalText: "text", approvedChanges: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invitation not found/i);
  });

  it("saves tailored resume successfully", async () => {
    const invDocRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({ jobId: "job-1" }, true, "inv-1")
      ),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const tailoredDocRef = {
      id: "tailored-new-id",
      set: jest.fn().mockResolvedValue(undefined),
    };
    const jobDocRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({ name: "Software Engineer", description: "Build things" }, true, "job-1")
      ),
    };

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") return { doc: jest.fn(() => invDocRef) };
      if (name === "jobs") return { doc: jest.fn(() => jobDocRef) };
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => tailoredDocRef),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/resume/tailored/simple/save")
      .set("Authorization", authHeader())
      .send({
        invitationId: "inv-1",
        originalText: "My resume text",
        approvedChanges: [{ id: "c1", original: "Old", suggested: "New" }],
        jobTitle: "Engineer",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tailoredResumeId).toBeDefined();
  });
});

// ─── POST /api/resume/tailor/v2 ──────────────────────────────────────────────

describe("POST /api/resume/tailor/v2", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/resume/tailor/v2").send({ jobDescription: "test" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobDescription is missing", async () => {
    const res = await request(app)
      .post("/api/resume/tailor/v2")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jobdescription is required/i);
  });

  it("returns 500 when GEMINI_API_KEY is not set", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const res = await request(app)
      .post("/api/resume/tailor/v2")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/gemini_api_key/i);

    process.env.GEMINI_API_KEY = original || "test-key";
  });

  it("returns 404 when user doc does not exist", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor/v2")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user doc not found/i);
  });

  it("returns 400 when user has neither raw text nor structured resume", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ resumeRawText: null, resumeStructured: null }, true)
        ),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor/v2")
      .set("Authorization", authHeader())
      .send({ jobDescription: "Software engineer" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no parsed resume/i);
  });

  it("returns patches and caches them when invitationId is provided", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            { resumeRawText: "My resume", resumeStructured: { skills: { items: [] }, experience: [] } },
            true
          )
        ),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailor/v2")
      .set("Authorization", authHeader())
      .send({
        jobDescription: "Backend engineer",
        jobTitle: "Engineer",
        invitationId: "inv-1",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(patchCache.setCacheEntry).toHaveBeenCalled();
  });
});

// ─── POST /api/resume/tailored/save ──────────────────────────────────────────

describe("POST /api/resume/tailored/save", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/resume/tailored/save").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when invitationId or acceptedPatchIds are missing", async () => {
    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invitationid and acceptedpatchids/i);
  });

  it("returns 404 when user doc does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", acceptedPatchIds: ["p1"] });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 400 when resume is not parsed", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ resumeStructured: null, resumeRawText: null }, true)
        ),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", acceptedPatchIds: ["p1"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resume not parsed/i);
  });

  it("returns 400 when patches are not in cache", async () => {
    patchCache.getCacheEntry.mockReturnValueOnce({ cached: false, error: "Cache miss" });

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            {
              resumeStructured: {
                skills: { items: ["Node.js"] },
                experience: [{ expId: "e1", bullets: [] }],
              },
            },
            true
          )
        ),
      })),
    });

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", acceptedPatchIds: ["p1"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/patches not found in cache/i);
  });

  it("saves tailored resume when cache hit and patches apply successfully", async () => {
    patchCache.getCacheEntry.mockReturnValueOnce({
      cached: true,
      patchResponse: {
        patches: [
          { opId: "p1", type: "replace_bullet", confidence: 0.9 },
        ],
      },
      jobContext: {
        jobId: "job-1",
        jobTitle: "Engineer",
        jobDescription: "Build things",
        requiredSkills: "Node.js",
      },
    });

    const batchMock = {
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                {
                  resumeStructured: {
                    skills: { items: ["Node.js"] },
                    experience: [],
                    projects: [],
                  },
                },
                true
              )
            ),
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ id: "tailored-id-1" })),
            })),
          })),
        };
      }
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({ id: "inv-1" })),
        };
      }
      return { doc: jest.fn() };
    });

    db.batch = jest.fn(() => batchMock);

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", acceptedPatchIds: ["p1"] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(batchMock.commit).toHaveBeenCalled();
  });
});

// ─── GET /api/resume/tailored ────────────────────────────────────────────────

describe("GET /api/resume/tailored", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/resume/tailored");
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no tailored resumes", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        })),
      })),
    });

    const res = await request(app)
      .get("/api/resume/tailored")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumes).toEqual([]);
  });

  it("returns list of tailored resumes", async () => {
    const docs = [
      mockDocSnap(
        {
          jobContext: { jobId: "j1", jobTitle: "Engineer" },
          structured: null,
          studentNotes: "",
          createdAt: null,
          status: "ready",
          expiresAt: null,
          acceptedPatches: [],
        },
        true,
        "tr-1"
      ),
    ];

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
        })),
      })),
    });

    const res = await request(app)
      .get("/api/resume/tailored")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumes).toHaveLength(1);
    expect(res.body.resumes[0].id).toBe("tr-1");
  });
});

// ─── GET /api/resume/tailored/list ───────────────────────────────────────────

describe("GET /api/resume/tailored/list", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/resume/tailored/list");
    expect(res.status).toBe(401);
  });

  it("returns tailored resumes list (alias endpoint)", async () => {
    const docs = [
      mockDocSnap(
        {
          jobContext: { jobId: "j1", jobTitle: "Engineer" },
          structured: null,
          studentNotes: "",
          createdAt: null,
          status: "ready",
          expiresAt: null,
          acceptedPatches: [],
        },
        true,
        "tr-2"
      ),
    ];

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
        })),
      })),
    });

    const res = await request(app)
      .get("/api/resume/tailored/list")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumes).toHaveLength(1);
  });
});

// ─── GET /api/resume/tailored/:tailoredResumeId ───────────────────────────────

describe("GET /api/resume/tailored/:tailoredResumeId", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/resume/tailored/tr-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when tailored resume does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        })),
      })),
    });

    const res = await request(app)
      .get("/api/resume/tailored/tr-missing")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/tailored resume not found/i);
  });

  it("returns the tailored resume data", async () => {
    const tailoredData = {
      baseResumeId: "test-uid",
      invitationId: "inv-1",
      jobContext: { jobId: "j1", jobTitle: "Engineer" },
      structured: { summary: "Tailored" },
      tailoredText: null,
      method: "patch-based",
      studentNotes: "Great fit",
      status: "ready",
      createdAt: null,
      changesCount: 2,
      acceptedPatches: [{ opId: "p1" }, { opId: "p2" }],
    };

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(tailoredData, true, "tr-1")),
          })),
        })),
      })),
    });

    const res = await request(app)
      .get("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tailoredResumeId).toBe("tr-1");
    expect(res.body.data.method).toBe("patch-based");
    expect(res.body.data.appliedPatches).toBe(2);
  });
});

// ─── PUT /api/resume/tailored/:tailoredResumeId ───────────────────────────────

describe("PUT /api/resume/tailored/:tailoredResumeId", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).put("/api/resume/tailored/tr-1").send({});
    expect(res.status).toBe(401);
  });

  it("returns 404 when tailored resume does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
            update: jest.fn().mockResolvedValue(undefined),
          })),
        })),
      })),
    });

    const res = await request(app)
      .put("/api/resume/tailored/tr-missing")
      .set("Authorization", authHeader())
      .send({ studentNotes: "Updated notes" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/tailored resume not found/i);
  });

  it("updates the tailored resume successfully", async () => {
    const resumeRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({ studentNotes: "Old notes" }, true, "tr-1")
      ),
      update: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => resumeRef),
        })),
      })),
    });

    const res = await request(app)
      .put("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader())
      .send({ studentNotes: "Updated notes", tailoredText: "New text" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(resumeRef.update).toHaveBeenCalled();
  });
});

// ─── DELETE /api/resume/tailored/:tailoredResumeId ────────────────────────────

describe("DELETE /api/resume/tailored/:tailoredResumeId", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/resume/tailored/tr-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when tailored resume does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
            delete: jest.fn().mockResolvedValue(undefined),
          })),
        })),
      })),
    });

    const res = await request(app)
      .delete("/api/resume/tailored/tr-missing")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/tailored resume not found/i);
  });

  it("deletes the tailored resume and clears the invitation reference", async () => {
    const invRef = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const resumeRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({ invitationId: "inv-1" }, true, "tr-1")
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => resumeRef),
            })),
          })),
        };
      }
      if (name === "jobInvitations") {
        return { doc: jest.fn(() => invRef) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .delete("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(resumeRef.delete).toHaveBeenCalled();
    expect(invRef.update).toHaveBeenCalled();
  });

  it("succeeds even if invitation update fails", async () => {
    const resumeRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({ invitationId: "inv-1" }, true, "tr-1")
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => resumeRef),
            })),
          })),
        };
      }
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            update: jest.fn().mockRejectedValue(new Error("Invitation update failed")),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .delete("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());
    // Should still succeed because invitation update failure is caught
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
