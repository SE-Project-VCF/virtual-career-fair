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
const jobInvitationsRouter = require("../../routes/jobInvitations");
const { db, auth } = require("../../firebase");
const app = createTestApp(jobInvitationsRouter);

// Auto-authenticate all requests so verifyFirebaseToken passes
const AUTH = "Bearer valid-token";
beforeEach(() => {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
});

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return AUTH;
}

// ─── Fixture data ────────────────────────────────────────────────────────────

const repUserData = { role: "representative", companyId: "company-1" };
const studentUserData = { role: "student" };
const companyData = { companyName: "Acme Corp", boothId: "booth-1", ownerId: "rep-1", representativeIDs: ["rep-2"] };
const jobData = { companyId: "company-1", name: "SWE", description: "Build stuff", majorsAssociated: "CS" };

const invitationData = {
  jobId: "job-1",
  companyId: "company-1",
  studentId: "student-1",
  sentBy: "rep-1",
  sentVia: "notification",
  status: "sent",
  sentAt: { toMillis: () => 1000000 },
  viewedAt: null,
  clickedAt: null,
  message: "Check this out",
};

// ─── Helper: make a batch mock ────────────────────────────────────────────────

function makeBatch() {
  return {
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
}

/* ============================================================
   POST /api/job-invitations/send
============================================================ */
describe("POST /api/job-invitations/send", () => {
  beforeEach(() => jest.clearAllMocks());

  const validBody = {
    jobId: "job-1",
    studentIds: ["student-1"],
    sentVia: "notification",
    userId: "rep-1",
  };

  it("returns 400 when jobId is missing", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send({ ...validBody, jobId: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Job ID is required/i);
  });

  it("returns 400 when studentIds is missing", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send({ ...validBody, studentIds: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/At least one student ID is required/i);
  });

  it("returns 400 when studentIds is empty array", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send({ ...validBody, studentIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/At least one student ID is required/i);
  });

  it("returns 400 when sentVia is not 'notification'", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send({ ...validBody, sentVia: "chat" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sentVia must be 'notification'/i);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send({ ...validBody, userId: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User ID is required/i);
  });

  it("returns 404 when job does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/i);
  });

  it("returns 404 when userId does not exist (verifyRepOrOwner)", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User not found/i);
  });

  it("returns 403 when user is not a rep or owner", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only representatives and company owners/i);
  });

  it("returns 403 when rep belongs to a different company", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "representative", companyId: "other-company" })),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/You can only send invitations for your own company/i);
  });

  it("returns 400 when a student ID does not exist", async () => {
    let userCallCount = 0;
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => {
            userCallCount++;
            // First call = verifyRepOrOwner (rep user); second call = student check (not found)
            if (userCallCount === 1) {
              return { get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)) };
            }
            return { get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) };
          }),
        };
      }
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid student IDs/i);
  });

  it("returns 400 when a student ID belongs to a non-student", async () => {
    let userCallCount = 0;
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => {
            userCallCount++;
            if (userCallCount === 1) {
              return { get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)) };
            }
            return { get: jest.fn().mockResolvedValue(mockDocSnap({ role: "representative" })) };
          }),
        };
      }
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid student IDs/i);
  });

  it("returns 200 and creates invitations on happy path", async () => {
    const batch = makeBatch();
    let userCallCount = 0;

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => {
            userCallCount++;
            if (userCallCount === 1) {
              return { get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)) };
            }
            return { get: jest.fn().mockResolvedValue(mockDocSnap(studentUserData)) };
          }),
        };
      }
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({ id: "new-inv-id", set: jest.fn() })),
        };
      }
    });
    db.batch = jest.fn(() => batch);

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.invitationsSent).toBe(1);
    expect(batch.commit).toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to send invitations/i);
  });
});

/* ============================================================
   GET /api/job-invitations/received
============================================================ */
describe("GET /api/job-invitations/received", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).get("/api/job-invitations/received").set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User ID is required/i);
  });

  it("returns 404 when user does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).get("/api/job-invitations/received?userId=nonexistent").set("Authorization", AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User not found/i);
  });

  it("returns 403 when user is not a student", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "representative" })),
          })),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/received?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only students can view received invitations/i);
  });

  it("returns 200 with invitations on happy path (no enrichment docs)", async () => {
    const invDoc = mockDocSnap(
      { ...invitationData, sentAt: { toMillis: () => 2000000 } },
      true,
      "inv-1"
    );
    const querySnap = mockQuerySnap([invDoc]);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(studentUserData)),
          })),
        };
      }
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
      }
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
      if (name === "companies") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).get("/api/job-invitations/received?userId=student-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invitations)).toBe(true);
    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0].id).toBe("inv-1");
  });

  it("returns 200 with enriched invitation details", async () => {
    const invDoc = mockDocSnap(invitationData, true, "inv-1");
    const querySnap = mockQuerySnap([invDoc]);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn((id) => {
            if (id === "student-1") {
              return { get: jest.fn().mockResolvedValue(mockDocSnap(studentUserData)) };
            }
            // sender
            return {
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ firstName: "Jane", lastName: "Doe", email: "jane@co.com" }, true, id)
              ),
            };
          }),
        };
      }
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ...jobData, applicationLink: "https://apply.com", applicationForm: null }, true, "job-1")
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(companyData, true, "company-1")),
          })),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/received?userId=student-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.invitations[0].job.name).toBe("SWE");
    expect(res.body.invitations[0].company.companyName).toBe("Acme Corp");
    expect(res.body.invitations[0].sender.firstName).toBe("Jane");
  });

  it("filters by status query param", async () => {
    const queryRef = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(studentUserData)),
          })),
        };
      }
      if (name === "jobInvitations") {
        return queryRef;
      }
    });

    const res = await request(app).get("/api/job-invitations/received?userId=student-1&status=viewed").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    // where was called twice: once for studentId filter, once for status filter
    expect(queryRef.where).toHaveBeenCalledTimes(2);
  });

  it("returns 500 on unexpected error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await request(app).get("/api/job-invitations/received?userId=student-1").set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch invitations/i);
  });
});

/* ============================================================
   GET /api/job-invitations/sent
============================================================ */
describe("GET /api/job-invitations/sent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).get("/api/job-invitations/sent").set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User ID is required/i);
  });

  it("returns 404 when userId does not exist (verifyRepOrOwner)", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).get("/api/job-invitations/sent?userId=nobody").set("Authorization", AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User not found/i);
  });

  it("returns 403 when user is not a rep or owner", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/sent?userId=student-1").set("Authorization", AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only representatives and company owners/i);
  });

  it("returns 403 when rep belongs to a different company than queried companyId", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "representative", companyId: "other-company" })),
          })),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/sent?userId=rep-1&companyId=company-1").set("Authorization", AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/You can only send invitations for your own company/i);
  });

  it("returns 200 with invitations on happy path (by sentBy)", async () => {
    const invDoc = mockDocSnap(invitationData, true, "inv-1");
    const querySnap = mockQuerySnap([invDoc]);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn((id) => {
            if (id === "rep-1") {
              return { get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)) };
            }
            return { get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) };
          }),
        };
      }
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
      }
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).get("/api/job-invitations/sent?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invitations)).toBe(true);
    expect(res.body.invitations).toHaveLength(1);
  });

  it("returns 200 with invitations filtered by companyId", async () => {
    const invDoc = mockDocSnap(invitationData, true, "inv-1");
    const querySnap = mockQuerySnap([invDoc]);

    const jobInvRef = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(querySnap),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)),
          })),
        };
      }
      if (name === "jobInvitations") {
        return jobInvRef;
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "SWE" }, true, "job-1")),
          })),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/sent?userId=rep-1&companyId=company-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    // "companyId" filter path: where called with "companyId"
    expect(jobInvRef.where).toHaveBeenCalledWith("companyId", "==", "company-1");
  });

  it("returns 500 on unexpected error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await request(app).get("/api/job-invitations/sent?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch invitations/i);
  });
});

/* ============================================================
   PATCH /api/job-invitations/:id/status
============================================================ */
describe("PATCH /api/job-invitations/:id/status", () => {
  beforeEach(() => jest.clearAllMocks());

  const validBody = { status: "viewed", userId: "student-1" };

  it("returns 400 when status is invalid", async () => {
    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send({ status: "invalid", userId: "student-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Status must be 'viewed' or 'clicked'/i);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send({ status: "viewed" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User ID is required/i);
  });

  it("returns 404 when invitation does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
            update: jest.fn(),
          })),
        };
      }
    });

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Invitation not found/i);
  });

  it("returns 403 when userId does not match studentId", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ...invitationData, studentId: "other-student" })
            ),
            update: jest.fn(),
          })),
        };
      }
    });

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/You can only update your own invitations/i);
  });

  it("returns 200 and updates status to 'viewed'", async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ...invitationData, studentId: "student-1", viewedAt: null })
            ),
            update: updateFn,
          })),
        };
      }
    });

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "viewed", viewedAt: expect.anything() })
    );
  });

  it("returns 200 and updates status to 'clicked', also sets viewedAt when not set", async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ...invitationData, studentId: "student-1", viewedAt: null })
            ),
            update: updateFn,
          })),
        };
      }
    });

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send({ status: "clicked", userId: "student-1" });
    expect(res.status).toBe(200);
    const updateArg = updateFn.mock.calls[0][0];
    expect(updateArg.status).toBe("clicked");
    expect(updateArg.clickedAt).toBeDefined();
    expect(updateArg.viewedAt).toBeDefined(); // also set because viewedAt was null
  });

  it("does not overwrite viewedAt when already set during 'viewed' update", async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({
                ...invitationData,
                studentId: "student-1",
                viewedAt: { toMillis: () => 999 },
              })
            ),
            update: updateFn,
          })),
        };
      }
    });

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(200);
    const updateArg = updateFn.mock.calls[0][0];
    expect(updateArg.viewedAt).toBeUndefined();
  });

  it("returns 500 on unexpected error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .set("Authorization", AUTH)
      .send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to update invitation status/i);
  });
});

/* ============================================================
   GET /api/job-invitations/stats/:jobId
============================================================ */
describe("GET /api/job-invitations/stats/:jobId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).get("/api/job-invitations/stats/job-1").set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User ID is required/i);
  });

  it("returns 404 when job does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).get("/api/job-invitations/stats/job-1?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/i);
  });

  it("returns 403 when user is not a rep or owner", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/stats/job-1?userId=student-1").set("Authorization", AUTH);
    expect(res.status).toBe(403);
  });

  it("returns 200 with correct stats on happy path", async () => {
    const docs = [
      mockDocSnap({ viewedAt: { toMillis: () => 1 }, clickedAt: { toMillis: () => 2 } }, true, "a"),
      mockDocSnap({ viewedAt: { toMillis: () => 3 }, clickedAt: null }, true, "b"),
      mockDocSnap({ viewedAt: null, clickedAt: null }, true, "c"),
    ];
    const querySnap = {
      ...mockQuerySnap(docs),
      size: 3,
      forEach: (cb) => docs.forEach((d) => cb(d)),
    };

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)),
          })),
        };
      }
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/stats/job-1?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.totalSent).toBe(3);
    expect(res.body.totalViewed).toBe(2);
    expect(res.body.totalClicked).toBe(1);
    expect(res.body.viewRate).toBe("66.7");
    expect(res.body.clickRate).toBe("33.3");
  });

  it("returns 0 rates when totalSent is 0", async () => {
    const querySnap = { ...mockQuerySnap([]), size: 0, forEach: jest.fn() };

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)),
          })),
        };
      }
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/stats/job-1?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.viewRate).toBe("0");
    expect(res.body.clickRate).toBe("0");
  });

  it("returns 500 on unexpected error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await request(app).get("/api/job-invitations/stats/job-1?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch stats/i);
  });
});

/* ============================================================
   GET /api/job-invitations/details/:jobId
============================================================ */
describe("GET /api/job-invitations/details/:jobId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).get("/api/job-invitations/details/job-1").set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User ID is required/i);
  });

  it("returns 404 when job does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).get("/api/job-invitations/details/job-1?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/i);
  });

  it("returns 403 when user is not authorized", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/details/job-1?userId=student-1").set("Authorization", AUTH);
    expect(res.status).toBe(403);
  });

  it("returns 200 with invitation details on happy path", async () => {
    const invDoc = mockDocSnap(
      { ...invitationData, sentAt: { toMillis: () => 2000000 } },
      true,
      "inv-1"
    );
    const querySnap = mockQuerySnap([invDoc]);

    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(jobData)) })) };
      }
      if (name === "users") {
        return {
          doc: jest.fn((id) => {
            if (id === "rep-1") {
              return { get: jest.fn().mockResolvedValue(mockDocSnap(repUserData)) };
            }
            return {
              get: jest.fn().mockResolvedValue(
                mockDocSnap(
                  { firstName: "Alice", lastName: "Smith", email: "alice@test.com", major: "CS" },
                  true,
                  id
                )
              ),
            };
          }),
        };
      }
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
      }
    });

    const res = await request(app).get("/api/job-invitations/details/job-1?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invitations)).toBe(true);
    expect(res.body.invitations[0].id).toBe("inv-1");
    expect(res.body.invitations[0].student.firstName).toBe("Alice");
  });

  it("returns 500 on unexpected error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await request(app).get("/api/job-invitations/details/job-1?userId=rep-1").set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch invitation details/i);
  });
});

/* ============================================================
   GET /api/job-invitations/:invitationId  (dynamic, requires auth)
============================================================ */
describe("GET /api/job-invitations/:invitationId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/job-invitations/inv-1");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    auth.verifyIdToken.mockRejectedValue(new Error("bad token"));
    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", "Bearer bad-token");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired token/i);
  });

  it("returns 404 when invitation does not exist", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "student-1", email: "s@test.com" });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Invitation not found/i);
  });

  it("returns 403 when authenticated user is not the invitation recipient", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "other-student", email: "o@test.com" });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ...invitationData, studentId: "student-1" }, true, "inv-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not authorized to view this invitation/i);
  });

  it("returns 200 with invitation data on happy path", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "student-1", email: "s@test.com" });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ...invitationData, studentId: "student-1" }, true, "inv-1")
            ),
          })),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ...jobData, applicationLink: "https://apply.com" },
                true,
                "job-1"
              )
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(companyData, true, "company-1")),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ firstName: "Jane", lastName: "Rep", email: "jane@co.com" }, true, "rep-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("inv-1");
    expect(res.body.data.job.name).toBe("SWE");
    expect(res.body.data.company.companyName).toBe("Acme Corp");
    expect(res.body.data.sender.firstName).toBe("Jane");
  });

  it("returns 200 with nulls when enrichment docs do not exist", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "student-1", email: "s@test.com" });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ...invitationData, studentId: "student-1" }, true, "inv-1")
            ),
          })),
        };
      }
      // jobs, companies, users all return not-found
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(res.body.data.job).toBeNull();
    expect(res.body.data.company).toBeNull();
    expect(res.body.data.sender).toBeNull();
  });

  it("returns 500 on unexpected error", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "student-1", email: "s@test.com" });
    db.collection.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch invitation/i);
  });
});
