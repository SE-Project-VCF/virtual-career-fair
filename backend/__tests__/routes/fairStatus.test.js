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
const fairStatusRouter = require("../../routes/fairStatus");
const { db, auth } = require("../../firebase");
const { verifyAdmin } = require("../../helpers");
const app = createTestApp(fairStatusRouter);

// Auto-authenticate all requests so verifyFirebaseToken passes
beforeEach(() => {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
});

const AUTH = "Bearer valid-token";

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return AUTH;
}

// Helper: build a schedule doc mock with toMillis-aware timestamps
function makeScheduleDoc(id, startMillis, endMillis, overrides = {}) {
  return mockDocSnap(
    {
      name: overrides.name ?? "Test Schedule",
      description: overrides.description ?? "A schedule",
      startTime: { toMillis: () => startMillis },
      endTime: { toMillis: () => endMillis },
      createdAt: overrides.createdAt ?? { toMillis: () => 500000 },
      updatedAt: overrides.updatedAt ?? { toMillis: () => 600000 },
      createdBy: overrides.createdBy ?? "admin-uid",
      updatedBy: overrides.updatedBy ?? "admin-uid",
    },
    true,
    id
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fair-status
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/fair-status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns isLive: false with source manual when no schedules and no statusDoc", async () => {
    // No active schedules
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
      if (name === "fairSettings") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).get("/api/fair-status").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isLive: false,
      source: "manual",
      scheduleName: null,
      scheduleDescription: null,
    });
  });

  it("returns isLive from manual statusDoc when no active schedules", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: true }, true)),
          })),
        };
      }
    });

    const res = await request(app).get("/api/fair-status").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
    expect(res.body.source).toBe("manual");
  });

  it("returns isLive: true with source schedule when an active schedule exists", async () => {
    // now() returns toMillis() === 1000000; schedule window 500000 – 2000000
    const activeDoc = makeScheduleDoc("sched-1", 500000, 2000000, {
      name: "Spring Fair",
      description: "Spring event",
    });

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([activeDoc])) };
      }
    });

    const res = await request(app).get("/api/fair-status").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isLive: true,
      source: "schedule",
      scheduleName: "Spring Fair",
      scheduleDescription: "Spring event",
    });
  });

  it("falls through to manual status when schedule window has not started yet", async () => {
    // now() = 1000000; schedule starts at 2000000
    const futureDoc = makeScheduleDoc("sched-future", 2000000, 3000000);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([futureDoc])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
          })),
        };
      }
    });

    const res = await request(app).get("/api/fair-status").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(false);
    expect(res.body.source).toBe("manual");
  });

  it("falls through to manual status when schedule window has ended", async () => {
    // now() = 1000000; schedule ended at 500000
    const pastDoc = makeScheduleDoc("sched-past", 100000, 500000);

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([pastDoc])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: true }, true)),
          })),
        };
      }
    });

    const res = await request(app).get("/api/fair-status").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("manual");
  });

  it("returns 500 when Firestore throws and fallback also fails", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("Firestore unavailable");
    });

    const res = await request(app).get("/api/fair-status").set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch fair status" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/toggle-fair-status
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/toggle-fair-status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).post("/api/toggle-fair-status").set("Authorization", AUTH).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing userId" });
  });

  it("returns 404 when user document does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).post("/api/toggle-fair-status").set("Authorization", AUTH).send({ userId: "ghost-uid" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
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
    });

    const res = await request(app).post("/api/toggle-fair-status").set("Authorization", AUTH).send({ userId: "student-uid" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Only administrators can toggle fair status" });
  });

  it("toggles from false to true and persists the new status", async () => {
    const statusSetMock = jest.fn().mockResolvedValue(undefined);
    const statusDocGetMock = jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true));

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      if (name === "fairSchedules") {
        // No active schedules so evaluateFairStatus falls through to manual
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: statusDocGetMock,
            set: statusSetMock,
          })),
        };
      }
    });

    const res = await request(app).post("/api/toggle-fair-status").set("Authorization", AUTH).send({ userId: "admin-uid" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, isLive: true });
    expect(statusSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ isLive: true, updatedBy: "admin-uid" }),
      { merge: true }
    );
  });

  it("toggles from true to false", async () => {
    const statusSetMock = jest.fn().mockResolvedValue(undefined);

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
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: true }, true)),
            set: statusSetMock,
          })),
        };
      }
    });

    const res = await request(app).post("/api/toggle-fair-status").set("Authorization", AUTH).send({ userId: "admin-uid" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, isLive: false });
  });

  it("evaluates live status from active schedule when toggling (toggles to false)", async () => {
    // Active schedule window 500000 – 2000000; now() = 1000000 → isLive: true → toggled to false
    const activeDoc = makeScheduleDoc("sched-1", 500000, 2000000);
    const statusSetMock = jest.fn().mockResolvedValue(undefined);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      if (name === "fairSchedules") {
        return { get: jest.fn().mockResolvedValue(mockQuerySnap([activeDoc])) };
      }
      if (name === "fairSettings") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: true }, true)),
            set: statusSetMock,
          })),
        };
      }
    });

    const res = await request(app).post("/api/toggle-fair-status").set("Authorization", AUTH).send({ userId: "admin-uid" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, isLive: false });
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => {
      throw new Error("DB failure");
    });

    const res = await request(app).post("/api/toggle-fair-status").set("Authorization", AUTH).send({ userId: "admin-uid" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to toggle fair status" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fair-schedules (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/fair-schedules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when userId is missing (verifyAdmin rejects)", async () => {
    verifyAdmin.mockResolvedValue({ status: 400, error: "Missing userId" });
    const res = await request(app).get("/api/fair-schedules").set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing userId" });
  });

  it("returns 404 when user is not found", async () => {
    verifyAdmin.mockResolvedValue({ status: 404, error: "User not found" });
    const res = await request(app).get("/api/fair-schedules").set("Authorization", AUTH).query({ userId: "ghost" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not an administrator", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Only administrators can manage schedules" });
    const res = await request(app).get("/api/fair-schedules").set("Authorization", AUTH).query({ userId: "non-admin" });
    expect(res.status).toBe(403);
  });

  it("returns empty schedules list when none exist", async () => {
    verifyAdmin.mockResolvedValue(null);

    const collRef = {
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    };
    db.collection.mockReturnValue(collRef);

    const res = await request(app).get("/api/fair-schedules").set("Authorization", AUTH).query({ userId: "admin-uid" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ schedules: [] });
  });

  it("returns mapped schedules with correct fields", async () => {
    verifyAdmin.mockResolvedValue(null);

    const doc1 = makeScheduleDoc("sched-1", 1000000, 2000000, {
      name: "Fall Fair",
      description: "Autumn",
      createdAt: { toMillis: () => 100 },
      updatedAt: { toMillis: () => 200 },
      createdBy: "creator-uid",
      updatedBy: "updater-uid",
    });

    const collRef = {
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([doc1])),
    };
    db.collection.mockReturnValue(collRef);

    const res = await request(app).get("/api/fair-schedules").set("Authorization", AUTH).query({ userId: "admin-uid" });
    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(1);
    expect(res.body.schedules[0]).toEqual({
      id: "sched-1",
      name: "Fall Fair",
      startTime: 1000000,
      endTime: 2000000,
      description: "Autumn",
      createdAt: 100,
      updatedAt: 200,
      createdBy: "creator-uid",
      updatedBy: "updater-uid",
    });
  });

  it("returns 500 on Firestore error", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.collection.mockImplementation(() => { throw new Error("DB error"); });

    const res = await request(app).get("/api/fair-schedules").set("Authorization", AUTH).query({ userId: "admin-uid" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch fair schedules" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public/fair-schedules
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/public/fair-schedules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty schedules list", async () => {
    db.collection.mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnap([])) });

    const res = await request(app).get("/api/public/fair-schedules").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ schedules: [] });
  });

  it("returns schedules sorted ascending by startTime", async () => {
    const doc1 = makeScheduleDoc("sched-b", 3000000, 4000000, { name: "Later" });
    const doc2 = makeScheduleDoc("sched-a", 1000000, 2000000, { name: "Earlier" });

    db.collection.mockReturnValue({
      get: jest.fn().mockResolvedValue(mockQuerySnap([doc1, doc2])),
    });

    const res = await request(app).get("/api/public/fair-schedules").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.schedules[0].id).toBe("sched-a");
    expect(res.body.schedules[1].id).toBe("sched-b");
  });

  it("sorts schedules with null startTime to the end", async () => {
    const docNoTime = mockDocSnap(
      { name: "No time", startTime: null, endTime: null, description: null },
      true,
      "sched-null"
    );
    const docWithTime = makeScheduleDoc("sched-real", 1000000, 2000000, { name: "With time" });

    db.collection.mockReturnValue({
      get: jest.fn().mockResolvedValue(mockQuerySnap([docNoTime, docWithTime])),
    });

    const res = await request(app).get("/api/public/fair-schedules").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.schedules[0].id).toBe("sched-real");
    expect(res.body.schedules[1].id).toBe("sched-null");
  });

  it("returns only public fields (no createdAt, createdBy, etc.)", async () => {
    const doc = makeScheduleDoc("sched-1", 1000000, 2000000, { name: "Pub" });
    db.collection.mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnap([doc])) });

    const res = await request(app).get("/api/public/fair-schedules").set("Authorization", AUTH);
    const schedule = res.body.schedules[0];
    expect(schedule).toHaveProperty("id");
    expect(schedule).toHaveProperty("name");
    expect(schedule).toHaveProperty("startTime");
    expect(schedule).toHaveProperty("endTime");
    expect(schedule).toHaveProperty("description");
    expect(schedule).not.toHaveProperty("createdAt");
    expect(schedule).not.toHaveProperty("createdBy");
    expect(schedule).not.toHaveProperty("updatedAt");
    expect(schedule).not.toHaveProperty("updatedBy");
  });

  it("returns 500 on Firestore error", async () => {
    db.collection.mockImplementation(() => { throw new Error("DB error"); });

    const res = await request(app).get("/api/public/fair-schedules").set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch fair schedules" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fair-schedules (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/fair-schedules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const VALID_START = "2026-06-01T09:00:00Z";
  const VALID_END = "2026-06-01T17:00:00Z";

  it("returns 400 when userId is missing (verifyAdmin rejects)", async () => {
    verifyAdmin.mockResolvedValue({ status: 400, error: "Missing userId" });
    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({ startTime: VALID_START, endTime: VALID_END });
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not an administrator", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Only administrators can manage schedules" });
    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({ userId: "non-admin", startTime: VALID_START, endTime: VALID_END });
    expect(res.status).toBe(403);
  });

  it("returns 400 when startTime is missing", async () => {
    verifyAdmin.mockResolvedValue(null);
    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({ userId: "admin-uid", endTime: VALID_END });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Start time and end time are required" });
  });

  it("returns 400 when endTime is missing", async () => {
    verifyAdmin.mockResolvedValue(null);
    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({ userId: "admin-uid", startTime: VALID_START });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Start time and end time are required" });
  });

  it("returns 400 when endTime is not after startTime", async () => {
    verifyAdmin.mockResolvedValue(null);
    // endTime equals startTime
    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({
      userId: "admin-uid",
      startTime: VALID_START,
      endTime: VALID_START,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "End time must be after start time" });
  });

  it("creates a schedule and returns the new document", async () => {
    verifyAdmin.mockResolvedValue(null);

    const addMock = jest.fn().mockResolvedValue({ id: "new-sched-id" });
    db.collection.mockReturnValue({ add: addMock });

    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({
      userId: "admin-uid",
      name: "Summer Fair",
      description: "Great event",
      startTime: VALID_START,
      endTime: VALID_END,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.schedule.id).toBe("new-sched-id");
    expect(res.body.schedule.name).toBe("Summer Fair");
    expect(res.body.schedule.description).toBe("Great event");
    expect(typeof res.body.schedule.startTime).toBe("number");
    expect(typeof res.body.schedule.endTime).toBe("number");
    expect(addMock).toHaveBeenCalledTimes(1);
  });

  it("creates a schedule with null name when name is not provided", async () => {
    verifyAdmin.mockResolvedValue(null);
    const addMock = jest.fn().mockResolvedValue({ id: "sched-no-name" });
    db.collection.mockReturnValue({ add: addMock });

    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({
      userId: "admin-uid",
      startTime: VALID_START,
      endTime: VALID_END,
    });

    expect(res.status).toBe(200);
    expect(res.body.schedule.name).toBeNull();
  });

  it("returns 500 on Firestore error", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.collection.mockImplementation(() => { throw new Error("DB error"); });

    const res = await request(app).post("/api/fair-schedules").set("Authorization", AUTH).send({
      userId: "admin-uid",
      startTime: VALID_START,
      endTime: VALID_END,
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to create fair schedule" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/fair-schedules/:id (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
// Build a docRef mock with a dedicated get that can return different values
function makeDocRefMock(existingData, exists = true, updatedData = null) {
  const getBeforeUpdate = mockDocSnap(existingData, exists, "sched-123");
  const getAfterUpdate = mockDocSnap(updatedData || existingData, true, "sched-123");
  let callCount = 0;
  const getMock = jest.fn(() => {
    callCount++;
    return Promise.resolve(callCount === 1 ? getBeforeUpdate : getAfterUpdate);
  });
  return {
    get: getMock,
    update: jest.fn().mockResolvedValue(undefined),
  };
}

describe("PUT /api/fair-schedules/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const VALID_START = "2026-06-01T09:00:00Z";
  const VALID_END = "2026-06-01T17:00:00Z";

  it("returns 400 when userId is missing", async () => {
    verifyAdmin.mockResolvedValue({ status: 400, error: "Missing userId" });
    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({});
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not an administrator", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Only administrators can manage schedules" });
    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({ userId: "non-admin" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when schedule document does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    const docRef = makeDocRefMock(null, false);
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({ userId: "admin-uid" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Schedule not found" });
  });

  it("returns 400 when only startTime is provided but existing endTime is missing", async () => {
    verifyAdmin.mockResolvedValue(null);
    // Existing doc has no endTime
    const existingData = {
      name: "Old",
      startTime: { toMillis: () => 1000000 },
      endTime: null,
    };
    const docRef = makeDocRefMock(existingData);
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({
      userId: "admin-uid",
      startTime: VALID_START,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Both start time and end time are required");
  });

  it("returns 400 when new endTime is not after new startTime (resolveScheduleTimes validation)", async () => {
    verifyAdmin.mockResolvedValue(null);
    const existingData = {
      name: "Old",
      startTime: { toMillis: () => 1000000 },
      endTime: { toMillis: () => 2000000 },
    };
    const docRef = makeDocRefMock(existingData);
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    // End time same as start time → error
    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({
      userId: "admin-uid",
      startTime: VALID_START,
      endTime: VALID_START,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("End time must be after start time");
  });

  it("updates name and description without touching timestamps", async () => {
    verifyAdmin.mockResolvedValue(null);
    const existingData = {
      name: "Old Name",
      description: "Old Desc",
      startTime: { toMillis: () => 1000000 },
      endTime: { toMillis: () => 2000000 },
    };
    const updatedData = {
      name: "New Name",
      description: "New Desc",
      startTime: { toMillis: () => 1000000 },
      endTime: { toMillis: () => 2000000 },
    };
    const docRef = makeDocRefMock(existingData, true, updatedData);
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({
      userId: "admin-uid",
      name: "New Name",
      description: "New Desc",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.schedule.name).toBe("New Name");
    expect(res.body.schedule.description).toBe("New Desc");
    // update should not include startTime/endTime keys
    const updateArgs = docRef.update.mock.calls[0][0];
    expect(updateArgs).not.toHaveProperty("startTime");
    expect(updateArgs).not.toHaveProperty("endTime");
  });

  it("updates only startTime while keeping existing endTime via resolveScheduleTimes", async () => {
    verifyAdmin.mockResolvedValue(null);
    // Existing endTime must be after the parsed startTime.
    // "2026-01-01T00:00:00Z" parses to ~1767225600000 ms, so endTime must exceed that.
    const existingData = {
      name: "Test",
      startTime: { toMillis: () => 1000000 },
      endTime: { toMillis: () => 9999999999999 },
    };
    const docRef = makeDocRefMock(existingData, true, existingData);
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({
      userId: "admin-uid",
      startTime: "2026-01-01T00:00:00Z",
    });

    expect(res.status).toBe(200);
    const updateArgs = docRef.update.mock.calls[0][0];
    expect(updateArgs).toHaveProperty("startTime");
    expect(updateArgs).toHaveProperty("endTime");
  });

  it("updates both startTime and endTime", async () => {
    verifyAdmin.mockResolvedValue(null);
    const existingData = {
      name: "Test",
      startTime: { toMillis: () => 1000000 },
      endTime: { toMillis: () => 2000000 },
    };
    const updatedData = {
      ...existingData,
      startTime: { toMillis: () => 3000000 },
      endTime: { toMillis: () => 4000000 },
    };
    const docRef = makeDocRefMock(existingData, true, updatedData);
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({
      userId: "admin-uid",
      startTime: VALID_START,
      endTime: VALID_END,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on Firestore error", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.collection.mockImplementation(() => { throw new Error("DB error"); });

    const res = await request(app).put("/api/fair-schedules/sched-123").set("Authorization", AUTH).send({ userId: "admin-uid" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to update fair schedule" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/fair-schedules/:id (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/fair-schedules/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when userId is missing", async () => {
    verifyAdmin.mockResolvedValue({ status: 400, error: "Missing userId" });
    const res = await request(app).delete("/api/fair-schedules/sched-123").set("Authorization", AUTH);
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not an administrator", async () => {
    verifyAdmin.mockResolvedValue({ status: 403, error: "Only administrators can manage schedules" });
    const res = await request(app).delete("/api/fair-schedules/sched-123").set("Authorization", AUTH).query({ userId: "non-admin" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when schedule does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    const docRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      delete: jest.fn(),
    };
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app).delete("/api/fair-schedules/sched-123").set("Authorization", AUTH).query({ userId: "admin-uid" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Schedule not found" });
  });

  it("deletes an existing schedule and returns success", async () => {
    verifyAdmin.mockResolvedValue(null);
    const deleteMock = jest.fn().mockResolvedValue(undefined);
    const docRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap({ name: "To Delete" }, true)),
      delete: deleteMock,
    };
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app).delete("/api/fair-schedules/sched-123").set("Authorization", AUTH).query({ userId: "admin-uid" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Schedule deleted successfully" });
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 on Firestore error", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.collection.mockImplementation(() => { throw new Error("DB error"); });

    const res = await request(app).delete("/api/fair-schedules/sched-123").set("Authorization", AUTH).query({ userId: "admin-uid" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to delete fair schedule" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/update-invite-code
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/update-invite-code", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({ userId: "user-uid" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing required fields" });
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({ companyId: "comp-1" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing required fields" });
  });

  it("returns 404 when company does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({ companyId: "comp-ghost", userId: "user-uid" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Company not found" });
  });

  it("returns 403 when user is not the company owner", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "other-uid" }, true)),
          })),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({ companyId: "comp-1", userId: "user-uid" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Only the company owner can update the invite code" });
  });

  it("returns 400 when custom invite code fails format validation (too short)", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true)),
          })),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
      newInviteCode: "AB",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/4-20 characters/);
  });

  it("returns 400 when custom invite code contains invalid characters", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true)),
          })),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
      newInviteCode: "HELLO!@#$",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/letters and numbers/);
  });

  it("returns 400 when custom invite code is already in use by another company", async () => {
    const conflictingDoc = mockDocSnap({ inviteCode: "MYCODE123" }, true, "other-company");

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, id)),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([conflictingDoc])),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
      newInviteCode: "MYCODE123",
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "This invite code is already in use by another company" });
  });

  it("accepts a valid custom invite code and updates the company", async () => {
    const transactionGetMock = jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, "comp-1"));
    const transactionUpdateMock = jest.fn();
    db.runTransaction.mockImplementation(async (fn) => {
      await fn({ get: transactionGetMock, update: transactionUpdateMock });
    });

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const docRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, "comp-1")),
        };
        return {
          doc: jest.fn(() => docRef),
          where: jest.fn().mockReturnThis(),
          // No other companies with this invite code
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
      newInviteCode: "NEWCODE99",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteCode).toBe("NEWCODE99");
  });

  it("generates a random invite code when newInviteCode is not provided", async () => {
    const transactionGetMock = jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, "comp-1"));
    const transactionUpdateMock = jest.fn();
    db.runTransaction.mockImplementation(async (fn) => {
      await fn({ get: transactionGetMock, update: transactionUpdateMock });
    });

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const docRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, "comp-1")),
        };
        return {
          doc: jest.fn(() => docRef),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Generated code is alphanumeric uppercase, 12 chars from crypto.randomBytes(6).hex
    expect(res.body.inviteCode).toMatch(/^[A-F0-9]+$/);
  });

  it("is case-insensitive: normalises custom code to uppercase", async () => {
    const transactionGetMock = jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, "comp-1"));
    const transactionUpdateMock = jest.fn();
    db.runTransaction.mockImplementation(async (fn) => {
      await fn({ get: transactionGetMock, update: transactionUpdateMock });
    });

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const docRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, "comp-1")),
        };
        return {
          doc: jest.fn(() => docRef),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
      newInviteCode: "mycode12",
    });

    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBe("MYCODE12");
  });

  it("returns 500 when transaction throws", async () => {
    db.runTransaction.mockRejectedValue(new Error("Transaction failed"));

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const docRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "owner-uid" }, true, "comp-1")),
        };
        return {
          doc: jest.fn(() => docRef),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
    });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
      newInviteCode: "VALID123",
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to update invite code" });
  });

  it("returns 500 on Firestore error during company lookup", async () => {
    db.collection.mockImplementation(() => { throw new Error("DB error"); });

    const res = await request(app).post("/api/update-invite-code").set("Authorization", AUTH).send({
      companyId: "comp-1",
      userId: "owner-uid",
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to update invite code" });
  });
});
