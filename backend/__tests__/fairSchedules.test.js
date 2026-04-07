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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), runTransaction: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return {
    ...actual,
    verifyAdmin: jest.fn(),
    evaluateFairStatusForFair: jest.fn(),
  };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin } = require("../helpers");
const { mockDocSnap, mockQuerySnap } = require("./testUtils");

// now.toMillis() === 1000000 per firebase-admin mock

function makeScheduleDoc(id, startMillis, endMillis, name = null, description = null) {
  return {
    id,
    data: () => ({
      name,
      description,
      startTime: { toMillis: () => startMillis },
      endTime: { toMillis: () => endMillis },
      createdAt: { toMillis: () => 500000 },
      updatedAt: { toMillis: () => 500000 },
      createdBy: "admin-uid",
      updatedBy: "admin-uid",
    }),
  };
}

function authAs(uid) {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

/* =======================================================
   GET /api/fair-status  (exercises evaluateFairStatus)
======================================================= */
describe("GET /api/fair-status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns isLive=true when an active schedule exists", async () => {
    // schedule active: startMillis=0, endMillis=2000000, now=1000000
    const activeSchedule = makeScheduleDoc("sched-1", 0, 2000000, "Spring Fair", "Great fair");

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([activeSchedule])) };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app).get("/api/fair-status");

    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
    expect(res.body.source).toBe("schedule");
    expect(res.body.scheduleName).toBe("Spring Fair");
    expect(res.body.scheduleDescription).toBe("Great fair");
  });

  it("falls back to manual toggle when no active schedule", async () => {
    // schedule not active: past
    const pastSchedule = makeScheduleDoc("sched-1", 0, 500000);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([pastSchedule])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: true }, true)),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app).get("/api/fair-status");

    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
    expect(res.body.source).toBe("manual");
  });

  it("returns isLive=false when no schedule and no fairSettings doc", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app).get("/api/fair-status");

    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(false);
    expect(res.body.source).toBe("manual");
  });

  it("ignores schedules missing startTime or endTime", async () => {
    const incompleteSchedule = {
      id: "sched-bad",
      data: () => ({ startTime: null, endTime: null }),
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([incompleteSchedule])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app).get("/api/fair-status");

    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(false);
  });
});

/* =======================================================
   POST /api/toggle-fair-status
======================================================= */
describe("POST /api/toggle-fair-status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).post("/api/toggle-fair-status").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing userId/i);
  });

  it("returns 404 when user not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).post("/api/toggle-fair-status").send({ userId: "no-such-user" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 403 when user is not an administrator", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).post("/api/toggle-fair-status").send({ userId: "student-uid" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrator/i);
  });

  it("toggles fair status off when currently live (via manual status)", async () => {
    const setMock = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      if (name === "fairSchedules") {
        // no active schedules → falls through to manual
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: true }, true)),
            set: setMock,
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app).post("/api/toggle-fair-status").send({ userId: "admin-uid" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isLive).toBe(false);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ isLive: false, updatedBy: "admin-uid" }),
      { merge: true }
    );
  });

  it("toggles fair status on when currently not live", async () => {
    const setMock = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
            set: setMock,
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app).post("/api/toggle-fair-status").send({ userId: "admin-uid" });

    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
  });
});

/* =======================================================
   GET /api/fair-schedules (admin only)
======================================================= */
describe("GET /api/fair-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when verifyAdmin rejects", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Not admin" });

    const res = await request(app).get("/api/fair-schedules").query({ userId: "student-uid" });
    expect(res.status).toBe(403);
  });

  it("returns schedules list for admin", async () => {
    verifyAdmin.mockResolvedValue(null);

    const schedDocs = [makeScheduleDoc("s1", 1000, 9000, "Fair 1", "Desc")];
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap(schedDocs)),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/fair-schedules").query({ userId: "admin-uid" });

    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(1);
    expect(res.body.schedules[0].id).toBe("s1");
    expect(res.body.schedules[0].name).toBe("Fair 1");
    expect(res.body.schedules[0].startTime).toBe(1000);
    expect(res.body.schedules[0].endTime).toBe(9000);
  });

  it("returns empty schedules list when none exist", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/fair-schedules").query({ userId: "admin-uid" });

    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(0);
  });
});

/* =======================================================
   GET /api/public/fair-schedules
======================================================= */
describe("GET /api/public/fair-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns sorted schedules for public", async () => {
    const schedDocs = [
      makeScheduleDoc("s2", 5000, 8000, "B"),
      makeScheduleDoc("s1", 1000, 4000, "A"),
    ];
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap(schedDocs)) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/public/fair-schedules");

    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(2);
    // sorted ascending by startTime
    expect(res.body.schedules[0].startTime).toBe(1000);
    expect(res.body.schedules[1].startTime).toBe(5000);
  });

  it("handles schedules with null startTime (sorted last)", async () => {
    const schedDocs = [
      { id: "s-null", data: () => ({ name: null, startTime: null, endTime: null, description: null }) },
      makeScheduleDoc("s1", 1000, 4000),
    ];
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap(schedDocs)) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/public/fair-schedules");

    expect(res.status).toBe(200);
    expect(res.body.schedules[0].startTime).toBe(1000);
    expect(res.body.schedules[1].startTime).toBeNull();
  });
});

/* =======================================================
   POST /api/fair-schedules
======================================================= */
describe("POST /api/fair-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when verifyAdmin rejects", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Not admin" });

    const res = await request(app).post("/api/fair-schedules").send({
      userId: "student-uid",
      startTime: "2026-03-01T10:00:00Z",
      endTime: "2026-03-01T18:00:00Z",
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when startTime is missing", async () => {
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app).post("/api/fair-schedules").send({
      userId: "admin-uid",
      endTime: "2026-03-01T18:00:00Z",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start time and end time/i);
  });

  it("returns 400 when end is before start", async () => {
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app).post("/api/fair-schedules").send({
      userId: "admin-uid",
      startTime: "2026-03-01T18:00:00Z",
      endTime: "2026-03-01T10:00:00Z",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end time must be after start time/i);
  });

  it("creates schedule successfully", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          add: jest.fn().mockResolvedValue({ id: "new-sched-id" }),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).post("/api/fair-schedules").send({
      userId: "admin-uid",
      name: "Career Fair",
      description: "Annual fair",
      startTime: "2026-03-01T10:00:00Z",
      endTime: "2026-03-01T18:00:00Z",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.schedule.id).toBe("new-sched-id");
    expect(res.body.schedule.name).toBe("Career Fair");
  });
});

/* =======================================================
   PUT /api/fair-schedules/:id
======================================================= */
describe("PUT /api/fair-schedules/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when verifyAdmin rejects", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Not admin" });

    const res = await request(app).put("/api/fair-schedules/sched-1").send({ userId: "student-uid" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when schedule does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).put("/api/fair-schedules/sched-1").send({ userId: "admin-uid" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/schedule not found/i);
  });

  it("updates schedule name and description without changing times", async () => {
    verifyAdmin.mockResolvedValue(null);

    const existingData = {
      name: "Old Name",
      description: "Old Desc",
      startTime: { toMillis: () => 1000 },
      endTime: { toMillis: () => 9000 },
    };
    const updatedData = {
      name: "New Name",
      description: "New Desc",
      startTime: { toMillis: () => 1000 },
      endTime: { toMillis: () => 9000 },
    };
    const updateMock = jest.fn().mockResolvedValue(undefined);
    let callCount = 0;

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(() => {
              callCount++;
              return Promise.resolve(
                callCount === 1
                  ? mockDocSnap(existingData, true, "sched-1")
                  : mockDocSnap(updatedData, true, "sched-1")
              );
            }),
            update: updateMock,
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).put("/api/fair-schedules/sched-1").send({
      userId: "admin-uid",
      name: "New Name",
      description: "New Desc",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });

  it("returns 400 when updated times are invalid (end before start)", async () => {
    verifyAdmin.mockResolvedValue(null);

    const existingData = {
      name: "Fair",
      startTime: { toMillis: () => 1000 },
      endTime: { toMillis: () => 9000 },
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(existingData, true, "sched-1")),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).put("/api/fair-schedules/sched-1").send({
      userId: "admin-uid",
      startTime: "2026-03-01T18:00:00Z",
      endTime: "2026-03-01T10:00:00Z",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end time must be after start time/i);
  });
});

/* =======================================================
   DELETE /api/fair-schedules/:id
======================================================= */
describe("DELETE /api/fair-schedules/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when verifyAdmin rejects", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Not admin" });

    const res = await request(app).delete("/api/fair-schedules/sched-1").query({ userId: "student-uid" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when schedule does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).delete("/api/fair-schedules/sched-1").query({ userId: "admin-uid" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/schedule not found/i);
  });

  it("deletes schedule successfully", async () => {
    verifyAdmin.mockResolvedValue(null);

    const deleteMock = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Fair" }, true, "sched-1")),
            delete: deleteMock,
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).delete("/api/fair-schedules/sched-1").query({ userId: "admin-uid" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deleteMock).toHaveBeenCalled();
  });
});

/* =======================================================
   POST /api/companies
======================================================= */
describe("POST /api/companies", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/companies").send({ companyName: "Acme" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyName is missing", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "owner-uid" });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authAs("owner-uid"))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/company name is required/i);
  });

  it("returns 404 when user not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authAs("owner-uid"))
      .send({ companyName: "Acme" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not companyOwner", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authAs("owner-uid"))
      .send({ companyName: "Acme" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/company owners/i);
  });

  it("creates company successfully", async () => {
    const setMock = jest.fn().mockResolvedValue(undefined);
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const newDocRef = { id: "company-123", set: setMock };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner" }, true)),
            update: updateMock,
          })),
        };
      }
      if (name === "companies") {
        return { doc: jest.fn(() => newDocRef) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authAs("owner-uid"))
      .send({ companyName: "Acme Corp" });

    expect(res.status).toBe(201);
    expect(res.body.companyId).toBe("company-123");
    expect(res.body.inviteCode).toBeDefined();
    expect(setMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
  });
});

/* =======================================================
   POST /api/link-company
======================================================= */
describe("POST /api/link-company", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/link-company").send({ inviteCode: "ABC123" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when inviteCode is missing", async () => {
    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authAs("rep-uid"))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invite code is required/i);
  });

  it("returns 400 when invite code is invalid", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authAs("rep-uid"))
      .send({ inviteCode: "BADCODE" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid invite code/i);
  });

  it("returns 400 when already linked to company", async () => {
    const companyDoc = {
      id: "company-1",
      data: () => ({ companyName: "Acme", representativeIDs: [] }),
    };

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([companyDoc])),
          doc: jest.fn(),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authAs("rep-uid"))
      .send({ inviteCode: "VALIDCODE" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already linked/i);
  });

  it("links company successfully", async () => {
    const companyDoc = {
      id: "company-1",
      data: () => ({ companyName: "Acme", representativeIDs: ["existing-rep"] }),
    };

    db.runTransaction.mockImplementation(async (fn) => {
      const transaction = { update: jest.fn() };
      await fn(transaction);
    });

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([companyDoc])),
          doc: jest.fn(() => ({ id: "company-1" })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "other-company" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authAs("rep-uid"))
      .send({ inviteCode: "ACME01" });

    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe("company-1");
    expect(res.body.companyName).toBe("Acme");
  });
});

/* =======================================================
   GET /api/companies/:companyId/invite-code
======================================================= */
describe("GET /api/companies/:companyId/invite-code", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/companies/company-1/invite-code");
    expect(res.status).toBe(401);
  });

  it("returns 404 when company not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/companies/company-1/invite-code")
      .set("Authorization", authAs("owner-uid"));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when user is neither owner nor admin", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", inviteCode: "SECRET" }, true)
            ),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/companies/company-1/invite-code")
      .set("Authorization", authAs("student-uid"));
    expect(res.status).toBe(403);
  });

  it("returns invite code for company owner", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", inviteCode: "MYCODE" }, true)
            ),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/companies/company-1/invite-code")
      .set("Authorization", authAs("owner-uid"));
    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBe("MYCODE");
  });

  it("returns invite code for admin", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", inviteCode: "ADMINCODE" }, true)
            ),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/companies/company-1/invite-code")
      .set("Authorization", authAs("admin-uid"));
    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBe("ADMINCODE");
  });

  it("returns 404 when no invite code is set", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", inviteCode: null }, true)
            ),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/companies/company-1/invite-code")
      .set("Authorization", authAs("owner-uid"));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no invite code/i);
  });
});
