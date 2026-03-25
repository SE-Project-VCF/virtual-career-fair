const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    delete: jest.fn(() => "FieldValue.delete"),
    serverTimestamp: jest.fn(() => "serverTimestamp"),
    arrayUnion: jest.fn((...args) => args),
    arrayRemove: jest.fn((...args) => args),
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

jest.mock("../firebase", () => ({
  db: { collection: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

function authHeader(uid = "test-uid") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: "test@test.com" });
  return "Bearer valid-token";
}

/* ============================================================
   PATCH /api/job-invitations/:id/status
   ============================================================ */
describe("PATCH /api/job-invitations/:id/status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when status is missing", async () => {
    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ userId: "u1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/viewed.*clicked/i);
  });

  it("returns 400 when status is invalid", async () => {
    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "accepted", userId: "u1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/viewed.*clicked/i);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "viewed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id is required/i);
  });

  it("returns 404 when invitation does not exist", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        update: jest.fn(),
      })),
    }));

    const res = await request(app)
      .patch("/api/job-invitations/inv-404/status")
      .send({ status: "viewed", userId: "u1" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/invitation not found/i);
  });

  it("returns 403 when userId does not match invitation studentId", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ studentId: "correct-student", status: "sent" }, true)
        ),
        update: jest.fn(),
      })),
    }));

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "viewed", userId: "wrong-student" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only update your own/i);
  });

  it("marks invitation as viewed and sets viewedAt timestamp", async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ studentId: "u1", status: "sent", viewedAt: null }, true)
        ),
        update: updateMock,
      })),
    }));

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "viewed", userId: "u1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "viewed",
        viewedAt: expect.anything(),
      })
    );
  });

  it("does not overwrite viewedAt when already set", async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            { studentId: "u1", status: "sent", viewedAt: { toMillis: () => 999 } },
            true
          )
        ),
        update: updateMock,
      })),
    }));

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "viewed", userId: "u1" });

    expect(res.status).toBe(200);
    // viewedAt should NOT be in the update since it was already set
    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty("viewedAt");
  });

  it("marks invitation as clicked and sets clickedAt timestamp", async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            { studentId: "u1", status: "viewed", viewedAt: { toMillis: () => 500 } },
            true
          )
        ),
        update: updateMock,
      })),
    }));

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "clicked", userId: "u1" });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "clicked",
        clickedAt: expect.anything(),
      })
    );
  });

  it("also sets viewedAt when clicking an unviewed invitation", async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ studentId: "u1", status: "sent", viewedAt: null }, true)
        ),
        update: updateMock,
      })),
    }));

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "clicked", userId: "u1" });

    expect(res.status).toBe(200);
    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg).toHaveProperty("viewedAt");
    expect(updateArg).toHaveProperty("clickedAt");
  });

  it("returns 500 when Firestore update fails", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ studentId: "u1", status: "sent", viewedAt: null }, true)
        ),
        update: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    }));

    const res = await request(app)
      .patch("/api/job-invitations/inv-1/status")
      .send({ status: "viewed", userId: "u1" });

    expect(res.status).toBe(500);
  });
});

/* ============================================================
   GET /api/job-invitations/:invitationId
   ============================================================ */
describe("GET /api/job-invitations/:invitationId", () => {
  beforeEach(() => jest.clearAllMocks());

  const invitationData = {
    jobId: "job-1",
    companyId: "company-1",
    studentId: "test-uid",
    sentBy: "rep-1",
    sentVia: "notification",
    status: "sent",
    sentAt: { toMillis: () => 1000 },
    viewedAt: null,
    clickedAt: null,
    message: "You're a great fit!",
  };

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/job-invitations/inv-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when invitation does not exist", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    }));

    const res = await request(app)
      .get("/api/job-invitations/inv-404")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/invitation not found/i);
  });

  it("returns 403 when authenticated user is not the recipient", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ...invitationData, studentId: "someone-else" }, true)
        ),
      })),
    }));

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", authHeader("test-uid"));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("returns invitation with full job, company, and sender details", async () => {
    const jobData = {
      name: "React Developer",
      description: "Build amazing UIs",
      majorsAssociated: "CS",
      applicationLink: "https://apply.io",
    };
    const companyData = {
      companyName: "Tech Corp",
      boothId: "booth-42",
    };
    const senderData = {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@techcorp.com",
    };

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(invitationData, true, "inv-1")
            ),
          })),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(jobData, true, "job-1")),
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
            get: jest.fn().mockResolvedValue(mockDocSnap(senderData, true, "rep-1")),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", authHeader("test-uid"));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("inv-1");
    expect(res.body.data.job.name).toBe("React Developer");
    expect(res.body.data.company.companyName).toBe("Tech Corp");
    expect(res.body.data.company.boothId).toBe("booth-42");
    expect(res.body.data.sender.firstName).toBe("Jane");
    expect(res.body.data.sentAt).toBe(1000);
    expect(res.body.data.viewedAt).toBeNull();
    expect(res.body.data.message).toBe("You're a great fit!");
  });

  it("returns null for job details when job does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(invitationData, true, "inv-1")),
          })),
        };
      }
      // All other collections return non-existent docs
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", authHeader("test-uid"));

    expect(res.status).toBe(200);
    expect(res.body.data.job).toBeNull();
    expect(res.body.data.company).toBeNull();
    expect(res.body.data.sender).toBeNull();
  });

  it("still returns invitation when sub-fetches throw errors", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(invitationData, true, "inv-1")),
          })),
        };
      }
      // Throw on all other collections to simulate partial failures
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockRejectedValue(new Error("Partial failure")),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", authHeader("test-uid"));

    expect(res.status).toBe(200);
    expect(res.body.data.job).toBeNull();
    expect(res.body.data.company).toBeNull();
    expect(res.body.data.sender).toBeNull();
  });

  it("returns 500 when main invitation fetch throws", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    }));

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", authHeader("test-uid"));

    expect(res.status).toBe(500);
  });

  it("returns viewedAt and clickedAt as milliseconds when set", async () => {
    const viewedInvitation = {
      ...invitationData,
      viewedAt: { toMillis: () => 2000 },
      clickedAt: { toMillis: () => 3000 },
    };

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(viewedInvitation, true, "inv-1")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/inv-1")
      .set("Authorization", authHeader("test-uid"));

    expect(res.status).toBe(200);
    expect(res.body.data.viewedAt).toBe(2000);
    expect(res.body.data.clickedAt).toBe(3000);
  });
});
