const { mockDocSnap, mockQuerySnap } = require("./testUtils");

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

jest.mock("../firebase", () => ({
  db: { collection: jest.fn(), runTransaction: jest.fn() },
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

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

function setupDbMock(configs) {
  db.collection.mockImplementation((name) => {
    const cfg = configs[name] || {};
    const docRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap(cfg.docData, cfg.docExists !== false, cfg.docId || "mock-id")
      ),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      id: cfg.docId || "mock-id",
    };
    return {
      doc: jest.fn(() => docRef),
      add: jest.fn().mockResolvedValue({ id: cfg.newDocId || "new-invitation-id" }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(cfg.docs || [])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

describe("POST /api/job-invitations/send", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 without userId (checked before auth)", async () => {
    const res = await request(app).post("/api/job-invitations/send").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when jobId is missing", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ studentIds: ["s1"], message: "Hello", sentVia: "notification", userId: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/job id/i);
  });

  it("returns 400 when studentIds is missing", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ jobId: "j1", message: "Hello", sentVia: "notification", userId: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/student/i);
  });

  it("returns 400 when sentVia is not 'notification'", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ jobId: "j1", studentIds: ["s1"], message: "Hello", sentVia: "chat", userId: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sentVia/i);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ jobId: "j1", studentIds: ["s1"], message: "Hello", sentVia: "notification" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id/i);
  });

  it("returns 404 when job does not exist", async () => {
    setupDbMock({
      jobs: { docExists: false },
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ jobId: "j1", studentIds: ["s1"], sentVia: "notification", userId: "u1" });
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/job not found/i);
  });

  it("returns 404 when user does not exist", async () => {
    setupDbMock({
      jobs: { docData: { companyId: "c1", name: "Developer" }, docExists: true },
      users: { docExists: false },
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ jobId: "j1", studentIds: ["s1"], sentVia: "notification", userId: "u1" });
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 403 when user is not rep or owner", async () => {
    setupDbMock({
      jobs: { docData: { companyId: "c1", name: "Developer" }, docExists: true },
      users: { docData: { role: "student", companyId: "c1" }, docExists: true },
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ jobId: "j1", studentIds: ["s1"], sentVia: "notification", userId: "u1" });
    
    expect(res.status).toBe(403);
  });

  it("returns 403 when user belongs to different company", async () => {
    setupDbMock({
      jobs: { docData: { companyId: "c1", name: "Developer" }, docExists: true },
      users: { docData: { role: "companyOwner", companyId: "c2" }, docExists: true },
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ jobId: "j1", studentIds: ["s1"], sentVia: "notification", userId: "u1" });
    
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/your own company/i);
  });

  it("successfully sends invitations for company owner", async () => {
    const mockBatch = {
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(),
    };
    
    db.batch = jest.fn(() => mockBatch);
    
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({ id: "inv-" + Math.random() })), // NOSONAR - test ID generation
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1", name: "Developer" }, true, "j1")),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((id) => {
            if (id === "u1") {
              return {
                get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner", companyId: "c1" }, true, "u1")),
              };
            }
            // Student IDs
            return {
              get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, id)),
            };
          }),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyName: "Tech Corp" }, true, "c1")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
        })),
      };
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ 
        jobId: "j1", 
        studentIds: ["s1", "s2"], 
        message: "Apply now!", 
        sentVia: "notification", 
        userId: "u1" 
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("allows administrators to send invitations", async () => {
    const mockBatch = {
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(),
    };
    
    db.batch = jest.fn(() => mockBatch);
    
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          doc: jest.fn(() => ({ id: "inv-" + Math.random() })), // NOSONAR - test ID generation
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1", name: "Developer" }, true, "j1")),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((id) => {
            if (id === "admin1") {
              return {
                get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true, "admin1")),
              };
            }
            // Student IDs
            return {
              get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, id)),
            };
          }),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyName: "Tech Corp" }, true, "c1")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
        })),
      };
    });

    const res = await request(app)
      .post("/api/job-invitations/send")
      .set("Authorization", authHeader())
      .send({ 
        jobId: "j1", 
        studentIds: ["s1"], 
        message: "Apply", 
        sentVia: "notification", 
        userId: "admin1" 
      });
    
    expect(res.status).toBe(200);
  });
});

describe("GET /api/job-invitations/received", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 without userId (checked before auth)", async () => {
    const res = await request(app).get("/api/job-invitations/received");
    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .get("/api/job-invitations/received")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id/i);
  });

  it("returns 404 when user does not exist", async () => {
    setupDbMock({
      users: { docExists: false },
    });

    const res = await request(app)
      .get("/api/job-invitations/received?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 403 when user is not a student", async () => {
    setupDbMock({
      users: { docData: { role: "companyOwner" }, docExists: true },
    });

    const res = await request(app)
      .get("/api/job-invitations/received?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only students/i);
  });

  it("successfully returns student invitations", async () => {
    const invitationDoc = mockDocSnap({
      studentId: "s1",
      jobId: "j1",
      companyId: "c1",
      status: "sent",
      sentAt: { toMillis: () => 1000000 },
    }, true, "inv-1");

    setupDbMock({
      users: { docData: { role: "student" }, docExists: true },
      jobs: { docData: { name: "Developer", companyId: "c1" }, docExists: true },
      companies: { docData: { companyName: "Tech Corp" }, docExists: true },
    });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([invitationDoc])),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Developer", companyId: "c1" }, true, "j1")),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyName: "Tech Corp" }, true, "c1")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/received?userId=s1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(200);
    expect(res.body.invitations).toBeDefined();
    expect(Array.isArray(res.body.invitations)).toBe(true);
  });
});

describe("GET /api/job-invitations/sent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 without userId (checked before auth)", async () => {
    const res = await request(app).get("/api/job-invitations/sent");
    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .get("/api/job-invitations/sent")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id/i);
  });

  it("returns 404 when user does not exist", async () => {
    setupDbMock({
      users: { docExists: false },
    });

    const res = await request(app)
      .get("/api/job-invitations/sent?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 403 when user is not rep or owner", async () => {
    setupDbMock({
      users: { docData: { role: "student" }, docExists: true },
    });

    const res = await request(app)
      .get("/api/job-invitations/sent?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(403);
  });

  it("successfully returns sent invitations by userId", async () => {
    const invitationDoc = mockDocSnap({
      sentBy: "u1",
      studentId: "s1",
      jobId: "j1",
      companyId: "c1",
      status: "sent",
      sentAt: { toMillis: () => 1000000 },
    }, true, "inv-1");

    setupDbMock({
      users: { docData: { role: "representative", companyId: "c1" }, docExists: true },
    });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([invitationDoc])),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ 
              role: "representative", 
              companyId: "c1",
              firstName: "John",
              lastName: "Doe"
            }, true, "s1")),
          })),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Developer" }, true, "j1")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/sent?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(200);
    expect(res.body.invitations).toBeDefined();
    expect(Array.isArray(res.body.invitations)).toBe(true);
  });

  it("returns sent invitations by companyId", async () => {
    setupDbMock({
      users: { docData: { role: "companyOwner", companyId: "c1" }, docExists: true },
    });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner", companyId: "c1" }, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/sent?userId=u1&companyId=c1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(200);
    expect(res.body.invitations).toBeDefined();
  });
});

describe("GET /api/job-invitations/stats/:jobId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 without userId (checked before auth)", async () => {
    const res = await request(app).get("/api/job-invitations/stats/j1");
    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .get("/api/job-invitations/stats/j1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id/i);
  });

  it("returns 404 when job does not exist", async () => {
    setupDbMock({
      jobs: { docExists: false },
    });

    const res = await request(app)
      .get("/api/job-invitations/stats/j1?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/job not found/i);
  });

  it("returns 404 when user does not exist", async () => {
    setupDbMock({
      jobs: { docData: { companyId: "c1", name: "Developer" }, docExists: true },
      users: { docExists: false },
    });

    const res = await request(app)
      .get("/api/job-invitations/stats/j1?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("successfully returns invitation stats", async () => {
    const invitations = [
      mockDocSnap({ status: "sent", studentId: "s1" }, true, "inv-1"),
      mockDocSnap({ status: "viewed", studentId: "s2", viewedAt: { toMillis: () => 1000 } }, true, "inv-2"),
      mockDocSnap({ status: "clicked", studentId: "s3", viewedAt: { toMillis: () => 1000 }, clickedAt: { toMillis: () => 2000 } }, true, "inv-3"),
    ];

    const mockQuerySnapshot = {
      ...mockQuerySnap(invitations),
      size: 3,
      forEach: (callback) => invitations.forEach(callback),
    };

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnapshot),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1", name: "Developer" }, true, "j1")),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner", companyId: "c1" }, true, "u1")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/stats/j1?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(200);
    expect(res.body.totalSent).toBe(3);
    expect(res.body.totalViewed).toBe(2);
    expect(res.body.totalClicked).toBe(1);
  });
});

describe("GET /api/job-invitations/details/:jobId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 without userId (checked before auth)", async () => {
    const res = await request(app).get("/api/job-invitations/details/j1");
    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .get("/api/job-invitations/details/j1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id/i);
  });

  it("returns 404 when job does not exist", async () => {
    setupDbMock({
      jobs: { docExists: false },
    });

    const res = await request(app)
      .get("/api/job-invitations/details/j1?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/job not found/i);
  });

  it("successfully returns detailed invitation data", async () => {
    const invitations = [
      mockDocSnap({ 
        status: "sent", 
        studentId: "s1",
        sentAt: { toMillis: () => 1000000 },
        viewedAt: null,
        clickedAt: null,
        message: "Apply now"
      }, true, "inv-1"),
    ];

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap(invitations)),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1", name: "Developer" }, true, "j1")),
          })),
        };
      }
      if (name === "users") {
        let callCount = 0;
        return {
          doc: jest.fn(() => {
            callCount++;
            return {
              get: jest.fn().mockResolvedValue(
                callCount === 1
                  ? mockDocSnap({ role: "companyOwner", companyId: "c1" }, true, "u1")
                  : mockDocSnap({ 
                      firstName: "Jane", 
                      lastName: "Student", 
                      email: "jane@test.com",
                      major: "CS"
                    }, true, "s1")
              ),
            };
          }),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/details/j1?userId=u1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(200);
    expect(res.body.invitations).toBeDefined();
    expect(Array.isArray(res.body.invitations)).toBe(true);
  });

  it("allows administrators to view details", async () => {
    setupDbMock({
      jobs: { docData: { companyId: "c1", name: "Developer" }, docExists: true },
      users: { docData: { role: "administrator" }, docExists: true },
    });

    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1", name: "Developer" }, true, "j1")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/job-invitations/details/j1?userId=admin1")
      .set("Authorization", authHeader());
    
    expect(res.status).toBe(200);
  });
});
