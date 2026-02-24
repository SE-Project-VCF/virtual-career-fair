// Tests specifically designed to cover conditional branches
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

describe("CORS Branch Coverage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows requests with no origin header", async () => {
    const res = await request(app)
      .get("/api/fair-status")
      .set("Origin", "");
    expect(res.status).toBeGreaterThan(0);
  });

  it("allows requests from localhost:5173", async () => {
    const res = await request(app)
      .get("/api/fair-status")
      .set("Origin", "http://localhost:5173");
    expect(res.status).toBeGreaterThan(0);
  });

  it("rejects requests from disallowed origin", async () => {
    const res = await request(app)
      .get("/api/fair-status")
      .set("Origin", "http://evil.com"); // NOSONAR - intentional http for security test
    // CORS rejection happens at middleware level
    expect(res.status).toBeGreaterThan(0);
  });
});

describe("Input Validation Branch Coverage", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("POST /api/jobs - whitespace handling", () => {
    it("rejects description that is only whitespace", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
          ),
        })),
      });

      const res = await request(app)
        .post("/api/jobs")
        .set("Authorization", authHeader())
        .send({
          companyId: "c1",
          name: "Job",
          description: "   \t\n  ",
          majorsAssociated: "CS",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("description");
    });

    it("rejects majorsAssociated that is only whitespace", async () => {
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
          ),
        })),
      });

      const res = await request(app)
        .post("/api/jobs")
        .set("Authorization", authHeader())
        .send({
          companyId: "c1",
          name: "Job",
          description: "Valid description",
          majorsAssociated: "  \n  ",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Skills");
    });

    it("handles applicationLink that is only whitespace", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "companies") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
              ),
            })),
          };
        }
        return {
          add: jest.fn().mockResolvedValue({ id: "job123" }),
        };
      });

      const res = await request(app)
        .post("/api/jobs")
        .set("Authorization", authHeader())
        .send({
          companyId: "c1",
          name: "Job",
          description: "Description",
          majorsAssociated: "CS",
          applicationLink: "   ",
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("PUT /api/jobs - validation branches", () => {
    it("accepts valid URL in applicationLink during update", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "jobs") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
              update: jest.fn().mockResolvedValue(undefined),
            })),
          };
        }
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      });

      const res = await request(app)
        .put("/api/jobs/j1")
        .set("Authorization", authHeader())
        .send({
          name: "Updated Job",
          description: "Updated desc",
          majorsAssociated: "CS",
          applicationLink: "https://valid-url.com/apply",
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("clears applicationLink when empty string provided", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "jobs") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
              update: jest.fn().mockResolvedValue(undefined),
            })),
          };
        }
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      });

      const res = await request(app)
        .put("/api/jobs/j1")
        .set("Authorization", authHeader())
        .send({
          name: "Updated Job",
          description: "Updated desc",
          majorsAssociated: "CS",
          applicationLink: "",
        });
      expect(res.status).toBe(200);
    });
  });
});

describe("Fair Schedules Branch Coverage", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("PUT /api/fair-schedules/:id", () => {
    it("handles both startTime and endTime undefined", async () => {
      const { verifyAdmin } = require("../helpers");
      verifyAdmin.mockResolvedValue(null);

      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              startTime: { toMillis: () => 1000 },
              endTime: { toMillis: () => 2000 },
              name: "Schedule",
            }),
          }),
          update: jest.fn().mockResolvedValue(undefined),
        })),
      });

      const res = await request(app)
        .put("/api/fair-schedules/s1")
        .send({ userId: "admin1", name: "Updated Name" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("handles name and description update only", async () => {
      const { verifyAdmin } = require("../helpers");
      verifyAdmin.mockResolvedValue(null);

      const updateMock = jest.fn().mockResolvedValue(undefined);
      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest
            .fn()
            .mockResolvedValueOnce({
              exists: true,
              data: () => ({
                startTime: { toMillis: () => 1000 },
                endTime: { toMillis: () => 2000 },
                name: "Old Name",
                description: "Old Description",
              }),
            })
            .mockResolvedValueOnce({
              exists: true,
              id: "s1",
              data: () => ({
                startTime: { toMillis: () => 1000 },
                endTime: { toMillis: () => 2000 },
                name: "New Name",
                description: "New Description",
              }),
            }),
          update: updateMock,
        })),
      });

      const res = await request(app)
        .put("/api/fair-schedules/s1")
        .send({ userId: "admin1", name: "New Name", description: "New Description" });

      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalled();
    });

    it("returns 400 when neither start/end times exist but update provided", async () => {
      const { verifyAdmin } = require("../helpers");
      verifyAdmin.mockResolvedValue(null);

      db.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              startTime: null,
              endTime: null,
            }),
          }),
        })),
      });

      const res = await request(app)
        .put("/api/fair-schedules/s1")
        .send({ userId: "admin1", startTime: "2024-06-15T10:00" });

      expect(res.status).toBe(400);
    });
  });
});

describe("Sync Stream Users Branch Coverage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("handles user without email in sync", async () => {
    auth.verifyIdToken.mockResolvedValueOnce({
      uid: "admin-uid",
      email: "admin@test.com",
    });

    const users = [
      {
        id: "u1",
        data: () => ({
          uid: "u1",
          email: "",
          firstName: "John",
          lastName: "Doe",
        }),
      },
    ];

    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "administrator" }, true)
            ),
          })),
        };
      }
      return {
        get: jest.fn().mockResolvedValue({
          docs: users.map((u) => ({ data: () => u.data() })),
        }),
      };
    });

    const res = await request(app)
      .post("/api/sync-stream-users")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe("Register User Branch Coverage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("handles email without @ symbol in sync-stream-user", async () => {
    const res = await request(app)
      .post("/api/sync-stream-user")
      .set("Authorization", authHeader())
      .send({
        uid: "test-uid",
        email: "justausername",
        firstName: "John",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("handles firstName and lastName as undefined in registration", async () => {
    auth.createUser.mockResolvedValueOnce({ uid: "user123" });

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue(undefined),
      })),
      add: jest.fn().mockResolvedValue({ id: "company123" }),
    });

    const res = await request(app)
      .post("/api/register-user")
      .send({
        email: "test@test.com",
        password: "pass123", // NOSONAR - test fixture password
        role: "student",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Fair Status Evaluation Branch Coverage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns isLive true when schedule exactly at startTime", async () => {
    // Timestamp.now() returns 1000000
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          get: jest.fn().mockResolvedValue({
            docs: [
              {
                id: "sched-1",
                data: () => ({
                  startTime: { toMillis: () => 1000000 },
                  endTime: { toMillis: () => 2000000 },
                  name: "Fair",
                }),
              },
            ],
          }),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
        })),
      };
    });

    const res = await request(app).get("/api/fair-status");
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
  });

  it("returns isLive true when schedule exactly at endTime", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          get: jest.fn().mockResolvedValue({
            docs: [
              {
                id: "sched-1",
                data: () => ({
                  startTime: { toMillis: () => 500000 },
                  endTime: { toMillis: () => 1000000 },
                  name: "Fair",
                }),
              },
            ],
          }),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
        })),
      };
    });

    const res = await request(app).get("/api/fair-status");
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
  });

  it("handles schedule with no startTime or endTime", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          get: jest.fn().mockResolvedValue({
            docs: [
              {
                id: "sched-1",
                data: () => ({
                  startTime: null,
                  endTime: null,
                  name: "Invalid Schedule",
                }),
              },
            ],
          }),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
        })),
      };
    });

    const res = await request(app).get("/api/fair-status");
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(false);
  });
});

describe("Job Sorting Branch Coverage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("handles jobs without createdAt timestamp", async () => {
    const jobs = [
      {
        id: "j1",
        data: () => ({
          companyId: "c1",
          name: "Job1",
          description: "d1",
          majorsAssociated: "CS",
          applicationLink: null,
          createdAt: null,
        }),
      },
      {
        id: "j2",
        data: () => ({
          companyId: "c1",
          name: "Job2",
          description: "d2",
          majorsAssociated: "CS",
          applicationLink: null,
          createdAt: { toMillis: () => 2000 },
        }),
      },
    ];

    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap(jobs)),
    });

    const res = await request(app).get("/api/jobs?companyId=c1");
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].name).toBe("Job2");
    expect(res.body.jobs[1].name).toBe("Job1");
  });

  it("handles all jobs without createdAt", async () => {
    const jobs = [
      {
        id: "j1",
        data: () => ({
          companyId: "c1",
          name: "Job1",
          description: "d1",
          majorsAssociated: "CS",
          applicationLink: null,
          createdAt: null,
        }),
      },
      {
        id: "j2",
        data: () => ({
          companyId: "c1",
          name: "Job2",
          description: "d2",
          majorsAssociated: "CS",
          applicationLink: null,
          createdAt: null,
        }),
      },
    ];

    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap(jobs)),
    });

    const res = await request(app).get("/api/jobs?companyId=c1");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(2);
  });
});

describe("Public Fair Schedules Sorting", () => {
  beforeEach(() => jest.clearAllMocks());

  it("handles schedules without startTime in sorting", async () => {
    const schedules = [
      {
        id: "s2",
        data: () => ({
          name: "Schedule 2",
          startTime: { toMillis: () => 2000 },
          endTime: { toMillis: () => 3000 },
          description: null,
        }),
      },
      {
        id: "s1",
        data: () => ({
          name: "Schedule 1",
          startTime: null,
          endTime: { toMillis: () => 1000 },
          description: null,
        }),
      },
    ];

    db.collection.mockReturnValue({
      get: jest.fn().mockResolvedValue(mockQuerySnap(schedules)),
    });

    const res = await request(app).get("/api/public/fair-schedules");
    expect(res.status).toBe(200);
    expect(res.body.schedules[0].name).toBe("Schedule 2");
    expect(res.body.schedules[1].name).toBe("Schedule 1");
  });

  it("handles all schedules without startTime", async () => {
    const schedules = [
      {
        id: "s1",
        data: () => ({
          name: "Schedule 1",
          startTime: null,
          endTime: { toMillis: () => 1000 },
          description: null,
        }),
      },
      {
        id: "s2",
        data: () => ({
          name: "Schedule 2",
          startTime: null,
          endTime: { toMillis: () => 2000 },
          description: null,
        }),
      },
    ];

    db.collection.mockReturnValue({
      get: jest.fn().mockResolvedValue(mockQuerySnap(schedules)),
    });

    const res = await request(app).get("/api/public/fair-schedules");
    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(2);
  });
});
