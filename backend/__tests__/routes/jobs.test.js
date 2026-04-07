const { mockDocSnap, mockQuerySnap, createTestApp } = require("../testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    delete: jest.fn(() => "DELETE_SENTINEL"),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
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
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../../helpers", () => {
  const actual = jest.requireActual("../../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const jobsRouter = require("../../routes/jobs");
const { db, auth } = require("../../firebase");
const app = createTestApp(jobsRouter);

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

const validJobBody = {
  companyId: "company-1",
  name: "Software Engineer",
  description: "Build great things.",
  majorsAssociated: "Computer Science",
  applicationLink: "https://example.com/apply",
};

// Mocks db so that:
//   jobs collection: returns the given jobDoc on .doc().get()
//   companies collection: returns the given companyDoc on .doc().get()
function mockJobsAndCompanies({ jobDoc, companyDoc }) {
  db.collection.mockImplementation((name) => {
    if (name === "jobs") {
      const docRef = {
        get: jest.fn().mockResolvedValue(jobDoc),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        id: jobDoc.id || "job-1",
        add: jest.fn().mockResolvedValue({ id: "new-job-id" }),
      };
      return {
        doc: jest.fn(() => docRef),
        add: jest.fn().mockResolvedValue({ id: "new-job-id" }),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        _docRef: docRef,
      };
    }
    if (name === "companies") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(companyDoc),
        })),
      };
    }
  });
}

/* ============================================================
   POST /api/jobs
============================================================ */
describe("POST /api/jobs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).post("/api/jobs").send(validJobBody);
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ ...validJobBody, companyId: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Company ID is required/i);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ ...validJobBody, name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Job title is required/i);
  });

  it("returns 400 when name exceeds 200 characters", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ ...validJobBody, name: "x".repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/200 characters/i);
  });

  it("returns 400 when description is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ ...validJobBody, description: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Job description is required/i);
  });

  it("returns 400 when description exceeds 5000 characters", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ ...validJobBody, description: "x".repeat(5001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5000 characters/i);
  });

  it("returns 400 when majorsAssociated is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ ...validJobBody, majorsAssociated: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Skills are required/i);
  });

  it("returns 400 when applicationLink is not a valid URL", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ ...validJobBody, applicationLink: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid application URL/i);
  });

  it("returns 404 when company does not exist", async () => {
    mockJobsAndCompanies({
      jobDoc: mockDocSnap(null, false, "job-1"),
      companyDoc: mockDocSnap(null, false, "company-1"),
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send(validJobBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when user is not authorized for the company", async () => {
    mockJobsAndCompanies({
      jobDoc: mockDocSnap(null, false, "job-1"),
      companyDoc: mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "company-1"),
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send(validJobBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized for this company/i);
  });

  it("creates a job successfully as company owner", async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: "new-job-id" });

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { add: mockAdd };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send(validJobBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBe("new-job-id");
    expect(mockAdd).toHaveBeenCalled();
  });

  it("creates a job successfully as a representative", async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: "new-job-id" });

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { add: mockAdd };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "owner-uid", representativeIDs: ["test-uid"] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send(validJobBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBe("new-job-id");
  });

  it("omits applicationLink from stored data when not provided", async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: "no-link-job" });

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { add: mockAdd };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const { applicationLink: _unused, ...bodyWithoutLink } = validJobBody;
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send(bodyWithoutLink);
    expect(res.status).toBe(200);
    const storedData = mockAdd.mock.calls[0][0];
    expect(storedData).not.toHaveProperty("applicationLink");
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send(validJobBody);
    expect(res.status).toBe(500);
  });
});

/* ============================================================
   GET /api/jobs
============================================================ */
describe("GET /api/jobs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when companyId query param is missing", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Company ID is required/i);
  });

  it("returns empty jobs array when no jobs found", async () => {
    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app).get("/api/jobs?companyId=company-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobs).toEqual([]);
  });

  it("returns jobs sorted by createdAt descending", async () => {
    const docs = [
      mockDocSnap(
        { companyId: "company-1", name: "Job A", description: "Desc A", majorsAssociated: "CS", createdAt: { toMillis: () => 1000 } },
        true,
        "job-a"
      ),
      mockDocSnap(
        { companyId: "company-1", name: "Job B", description: "Desc B", majorsAssociated: "EE", createdAt: { toMillis: () => 3000 } },
        true,
        "job-b"
      ),
      mockDocSnap(
        { companyId: "company-1", name: "Job C", description: "Desc C", majorsAssociated: "ME", createdAt: { toMillis: () => 2000 } },
        true,
        "job-c"
      ),
    ];

    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
    });

    const res = await request(app).get("/api/jobs?companyId=company-1");
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].id).toBe("job-b"); // createdAt: 3000
    expect(res.body.jobs[1].id).toBe("job-c"); // createdAt: 2000
    expect(res.body.jobs[2].id).toBe("job-a"); // createdAt: 1000
  });

  it("handles jobs with null createdAt by placing them at the end", async () => {
    const docs = [
      mockDocSnap(
        { companyId: "company-1", name: "Job A", description: "D", majorsAssociated: "CS", createdAt: { toMillis: () => 1000 } },
        true,
        "job-a"
      ),
      mockDocSnap(
        { companyId: "company-1", name: "Job B", description: "D", majorsAssociated: "EE", createdAt: null },
        true,
        "job-b"
      ),
    ];

    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
    });

    const res = await request(app).get("/api/jobs?companyId=company-1");
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].id).toBe("job-a");
    expect(res.body.jobs[1].id).toBe("job-b");
  });

  it("includes applicationForm and applicationLink fields in response", async () => {
    const docs = [
      mockDocSnap(
        {
          companyId: "company-1",
          name: "Job A",
          description: "D",
          majorsAssociated: "CS",
          applicationLink: "https://example.com",
          applicationForm: { fields: [] },
          createdAt: { toMillis: () => 1000 },
        },
        true,
        "job-a"
      ),
    ];

    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
    });

    const res = await request(app).get("/api/jobs?companyId=company-1");
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].applicationLink).toBe("https://example.com");
    expect(res.body.jobs[0].applicationForm).toEqual({ fields: [] });
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(new Error("DB error")),
    });

    const res = await request(app).get("/api/jobs?companyId=company-1");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch jobs/i);
  });
});

/* ============================================================
   PUT /api/jobs/:id
============================================================ */
describe("PUT /api/jobs/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  const validUpdateBody = {
    name: "Updated Engineer",
    description: "Updated description.",
    majorsAssociated: "Computer Science",
    applicationLink: "https://example.com/apply",
  };

  it("returns 401 without auth header", async () => {
    const res = await request(app).put("/api/jobs/job-1").send(validUpdateBody);
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send({ ...validUpdateBody, name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Job title is required/i);
  });

  it("returns 400 when description is missing", async () => {
    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send({ ...validUpdateBody, description: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Job description is required/i);
  });

  it("returns 400 when majorsAssociated is missing", async () => {
    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send({ ...validUpdateBody, majorsAssociated: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Skills are required/i);
  });

  it("returns 400 when applicationLink is not a valid URL", async () => {
    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send({ ...validUpdateBody, applicationLink: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid application URL/i);
  });

  it("returns 404 when job does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        update: jest.fn(),
      })),
    });

    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send(validUpdateBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/i);
  });

  it("returns 404 when the job's company does not exist", async () => {
    mockJobsAndCompanies({
      jobDoc: mockDocSnap({ companyId: "company-1", name: "Old Job", description: "D", majorsAssociated: "CS" }, true, "job-1"),
      companyDoc: mockDocSnap(null, false, "company-1"),
    });

    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send(validUpdateBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when user is not authorized for the company", async () => {
    mockJobsAndCompanies({
      jobDoc: mockDocSnap({ companyId: "company-1", name: "Old Job", description: "D", majorsAssociated: "CS" }, true, "job-1"),
      companyDoc: mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "company-1"),
    });

    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send(validUpdateBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized for this company/i);
  });

  it("updates job successfully as owner", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1", name: "Old Job", description: "D", majorsAssociated: "CS" }, true, "job-1")
            ),
            update: mockUpdate,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send(validUpdateBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("sets applicationLink to null when omitted on update", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1", name: "Old Job", description: "D", majorsAssociated: "CS" }, true, "job-1")
            ),
            update: mockUpdate,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const { applicationLink: _unused, ...bodyWithoutLink } = validUpdateBody;
    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send(bodyWithoutLink);
    expect(res.status).toBe(200);
    const updateArgs = mockUpdate.mock.calls[0][0];
    expect(updateArgs.applicationLink).toBeNull();
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .put("/api/jobs/job-1")
      .set("Authorization", authHeader())
      .send(validUpdateBody);
    expect(res.status).toBe(500);
  });
});

/* ============================================================
   DELETE /api/jobs/:id
============================================================ */
describe("DELETE /api/jobs/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).delete("/api/jobs/job-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        delete: jest.fn(),
      })),
    });

    const res = await request(app)
      .delete("/api/jobs/job-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/i);
  });

  it("returns 404 when the job's company does not exist", async () => {
    mockJobsAndCompanies({
      jobDoc: mockDocSnap({ companyId: "company-1" }, true, "job-1"),
      companyDoc: mockDocSnap(null, false, "company-1"),
    });

    const res = await request(app)
      .delete("/api/jobs/job-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when user is not authorized for the company", async () => {
    mockJobsAndCompanies({
      jobDoc: mockDocSnap({ companyId: "company-1" }, true, "job-1"),
      companyDoc: mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "company-1"),
    });

    const res = await request(app)
      .delete("/api/jobs/job-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized for this company/i);
  });

  it("deletes job successfully as owner", async () => {
    const mockDelete = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            delete: mockDelete,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .delete("/api/jobs/job-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("deletes job successfully as representative", async () => {
    const mockDelete = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            delete: mockDelete,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", representativeIDs: ["test-uid"] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .delete("/api/jobs/job-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .delete("/api/jobs/job-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});

/* ============================================================
   PUT /api/jobs/:id/form
============================================================ */
describe("PUT /api/jobs/:id/form", () => {
  beforeEach(() => jest.clearAllMocks());

  const validForm = { fields: [{ label: "Name", type: "text" }] };

  it("returns 401 without auth header", async () => {
    const res = await request(app).put("/api/jobs/job-1/form").send(validForm);
    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        update: jest.fn(),
      })),
    });

    const res = await request(app)
      .put("/api/jobs/job-1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/i);
  });

  it("returns 404 when company does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            update: jest.fn(),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false, "company-1")),
          })),
        };
      }
    });

    const res = await request(app)
      .put("/api/jobs/job-1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Company not found/i);
  });

  it("returns 403 when user is not authorized for the company", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            update: jest.fn(),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .put("/api/jobs/job-1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized for this company/i);
  });

  it("saves application form successfully as owner", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            update: mockUpdate,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .put("/api/jobs/job-1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ applicationForm: validForm });
  });

  it("saves application form successfully as representative", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            update: mockUpdate,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "owner-uid", representativeIDs: ["test-uid"] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .put("/api/jobs/job-1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .put("/api/jobs/job-1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(500);
  });
});

/* ============================================================
   DELETE /api/jobs/:id/form
============================================================ */
describe("DELETE /api/jobs/:id/form", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).delete("/api/jobs/job-1/form");
    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        update: jest.fn(),
      })),
    });

    const res = await request(app)
      .delete("/api/jobs/job-1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/i);
  });

  it("returns 404 when company does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            update: jest.fn(),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false, "company-1")),
          })),
        };
      }
    });

    const res = await request(app)
      .delete("/api/jobs/job-1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Company not found/i);
  });

  it("returns 403 when user is not authorized for the company", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            update: jest.fn(),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .delete("/api/jobs/job-1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized for this company/i);
  });

  it("deletes application form successfully as owner", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "job-1")
            ),
            update: mockUpdate,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .delete("/api/jobs/job-1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ applicationForm: "DELETE_SENTINEL" });
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .delete("/api/jobs/job-1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});

/* ============================================================
   GET /api/companies/:companyId/submissions
============================================================ */
describe("GET /api/companies/:companyId/submissions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/companies/company-1/submissions");
    expect(res.status).toBe(401);
  });

  it("returns 404 when company does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .get("/api/companies/company-1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Company not found/i);
  });

  it("returns 403 when user is not authorized for the company", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "company-1")
        ),
      })),
    });

    const res = await request(app)
      .get("/api/companies/company-1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized for this company/i);
  });

  it("returns submissions sorted by submittedAt descending", async () => {
    const submissionDocs = [
      { id: "sub-a", data: () => ({ companyId: "company-1", submittedAt: 1000 }) },
      { id: "sub-b", data: () => ({ companyId: "company-1", submittedAt: 3000 }) },
      { id: "sub-c", data: () => ({ companyId: "company-1", submittedAt: 2000 }) },
    ];

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
      if (name === "jobApplications") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: submissionDocs }),
        };
      }
    });

    const res = await request(app)
      .get("/api/companies/company-1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.submissions[0].id).toBe("sub-b"); // submittedAt: 3000
    expect(res.body.submissions[1].id).toBe("sub-c"); // submittedAt: 2000
    expect(res.body.submissions[2].id).toBe("sub-a"); // submittedAt: 1000
  });

  it("returns empty submissions array when no applications found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true, "company-1")
            ),
          })),
        };
      }
      if (name === "jobApplications") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      }
    });

    const res = await request(app)
      .get("/api/companies/company-1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.submissions).toEqual([]);
  });

  it("allows a representative to view submissions", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "owner-uid", representativeIDs: ["test-uid"] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
      if (name === "jobApplications") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      }
    });

    const res = await request(app)
      .get("/api/companies/company-1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .get("/api/companies/company-1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});
