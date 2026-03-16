const { mockDocSnap } = require("./testUtils");

/* ------------------------------------------------------------------ */
/*  firebase-admin mock (includes storage for the resume URL endpoint) */
/* ------------------------------------------------------------------ */
jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    delete: jest.fn(() => "FieldValue.delete"),
    arrayUnion: jest.fn((...args) => args),
    arrayRemove: jest.fn((...args) => args),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
    storage: jest.fn(), // controlled per-test via mockReturnValue
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
  db: { collection: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const admin = require("firebase-admin");

/* ------------------------------------------------------------------ */
/*  Auth helper                                                        */
/* ------------------------------------------------------------------ */
function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

/* ------------------------------------------------------------------ */
/*  DB mock helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Configures db.collection for the applicant-resume-url endpoint.
 * Chain: jobApplications → doc → get
 *        companies → doc → get
 */
function setupResumeUrlDbMock({
  appData = { companyId: "c1", studentId: "u1", attachedResumePath: "resumes/u1/cv.pdf" },
  appExists = true,
  companyData = { ownerId: "test-uid", representativeIDs: [] },
  companyExists = true,
} = {}) {
  db.collection.mockImplementation((name) => {
    if (name === "jobApplications") {
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(appData, appExists)) })) };
    }
    if (name === "companies") {
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(companyData, companyExists)) })) };
    }
    return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
  });
}

/**
 * Configures db.collection for the applicant-tailored-resume endpoint.
 * Chain: jobApplications → doc → get
 *        companies → doc → get
 *        users → doc → collection("tailoredResumes") → doc → get
 */
function setupTailoredDbMock({
  appData = { companyId: "c1", studentId: "u1", attachedTailoredResumeId: "tr-1" },
  appExists = true,
  companyData = { ownerId: "test-uid", representativeIDs: [] },
  companyExists = true,
  tailoredData = { tailoredText: "JANE DOE\nSoftware Engineer\n\nExperience..." },
  tailoredExists = true,
} = {}) {
  db.collection.mockImplementation((name) => {
    if (name === "jobApplications") {
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(appData, appExists)) })) };
    }
    if (name === "companies") {
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(companyData, companyExists)) })) };
    }
    if (name === "users") {
      return {
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap(tailoredData, tailoredExists)),
            })),
          })),
        })),
      };
    }
    return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
  });
}

/** Configures admin.storage() → bucket() → file() → getSignedUrl() */
function setupStorageMock({ signedUrl = "https://example.com/signed-resume.pdf", shouldFail = false } = {}) {
  const getSignedUrl = shouldFail
    ? jest.fn().mockRejectedValue(new Error("Storage error"))
    : jest.fn().mockResolvedValue([signedUrl]);

  admin.storage.mockReturnValue({
    bucket: jest.fn().mockReturnValue({
      file: jest.fn().mockReturnValue({ getSignedUrl }),
    }),
  });

  return { getSignedUrl };
}

/* ==================================================================
   GET /api/applicant-resume-url/:applicationId
   ================================================================== */
describe("GET /api/applicant-resume-url/:applicationId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStorageMock();
  });

  it("returns 401 without an auth token", async () => {
    const res = await request(app).get("/api/applicant-resume-url/app-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when application does not exist", async () => {
    setupResumeUrlDbMock({ appExists: false });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/application not found/i);
  });

  it("returns 404 when application has no attachedResumePath", async () => {
    setupResumeUrlDbMock({
      appData: { companyId: "c1", studentId: "u1" }, // no attachedResumePath
    });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no resume attached/i);
  });

  it("returns 404 when company does not exist", async () => {
    setupResumeUrlDbMock({ companyExists: false });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when requester is not the company owner or a rep", async () => {
    setupResumeUrlDbMock({
      companyData: { ownerId: "other-owner", representativeIDs: [] },
    });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("returns 200 with a signed URL when company owner requests", async () => {
    setupResumeUrlDbMock();
    setupStorageMock({ signedUrl: "https://example.com/signed-resume.pdf" });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://example.com/signed-resume.pdf");
  });

  it("returns 200 with a signed URL when a company representative requests", async () => {
    setupResumeUrlDbMock({
      companyData: { ownerId: "other-owner", representativeIDs: ["test-uid"] },
    });
    setupStorageMock({ signedUrl: "https://example.com/rep-signed.pdf" });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://example.com/rep-signed.pdf");
  });

  it("returns 500 when storage throws an error", async () => {
    setupResumeUrlDbMock();
    setupStorageMock({ shouldFail: true });

    const res = await request(app)
      .get("/api/applicant-resume-url/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

/* ==================================================================
   GET /api/applicant-tailored-resume/:applicationId
   ================================================================== */
describe("GET /api/applicant-tailored-resume/:applicationId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without an auth token", async () => {
    const res = await request(app).get("/api/applicant-tailored-resume/app-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when application does not exist", async () => {
    setupTailoredDbMock({ appExists: false });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/application not found/i);
  });

  it("returns 404 when application has no attachedTailoredResumeId", async () => {
    setupTailoredDbMock({
      appData: { companyId: "c1", studentId: "u1" }, // no attachedTailoredResumeId
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no tailored resume attached/i);
  });

  it("returns 404 when company does not exist", async () => {
    setupTailoredDbMock({ companyExists: false });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when requester is not the company owner or a rep", async () => {
    setupTailoredDbMock({
      companyData: { ownerId: "other-owner", representativeIDs: [] },
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("returns 404 when the tailored resume document does not exist", async () => {
    setupTailoredDbMock({ tailoredExists: false });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/tailored resume not found/i);
  });

  it("returns 200 with tailoredText for plain-text format resumes", async () => {
    setupTailoredDbMock({
      tailoredData: { tailoredText: "JANE DOE\nSoftware Engineer\n\nExperience...", structured: null },
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.tailoredText).toBe("JANE DOE\nSoftware Engineer\n\nExperience...");
    expect(res.body.structured).toBeNull();
  });

  it("returns 200 with structured data for patch-based format resumes", async () => {
    const structured = {
      summary: { text: "Senior engineer" },
      skills: { items: ["React", "Node.js"] },
      experience: [],
    };
    setupTailoredDbMock({
      tailoredData: { tailoredText: null, structured },
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.tailoredText).toBeNull();
    expect(res.body.structured).toEqual(structured);
  });

  it("returns 200 and includes jobContext in the response", async () => {
    const jobContext = { jobTitle: "Frontend Engineer", jobDescription: "Build great UIs" };
    setupTailoredDbMock({
      tailoredData: { tailoredText: "Resume text", jobContext },
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.jobContext).toEqual(jobContext);
  });

  it("allows a company representative to retrieve the tailored resume", async () => {
    setupTailoredDbMock({
      companyData: { ownerId: "other-owner", representativeIDs: ["test-uid"] },
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws an error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("DB exploded");
    });

    const res = await request(app)
      .get("/api/applicant-tailored-resume/app-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});
